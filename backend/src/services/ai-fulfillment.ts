import { createHash } from 'crypto'
import type { Transaction } from 'sequelize'
import { AIDesign } from '../database/models/ai-design'
import { CommerceAudit } from '../database/models/commerce-audit'
import { AdminReviewAction, AIApprovalStatus, AIDesignStatus, CommerceItemType, OrderItemStatus, PaymentStatus } from '../database/models/model-enums'
import { Order } from '../database/models/order'
import { OrderItem } from '../database/models/order-item'
import { Payment } from '../database/models/payment'
import { getDatabase } from '../database/database'
import HttpError from '../errors/http-error'
import { privateStorage, type PrivateStorageService } from './ai-storage'
import { fulfillmentMode, type FulfillmentMode } from './fulfillment'
import { assertOrderItemTransition, refreshOrderAggregate } from './order-item-state'
import {
    createPrintifyOrder,
    findPrintifyOrderByExternalReference,
    getPrintifyOrder,
    getPrintifyShopId,
    sendPrintifyOrderToProduction,
    uploadPrintifyImage,
    type PrintifyOrderPayload
} from './printify'
import type { ShippingAddressInput } from './orders'
import { verifyPersistedOrderShipping } from './shipping'

export interface AIFulfillmentApi {
    upload: typeof uploadPrintifyImage
    create: typeof createPrintifyOrder
    get: typeof getPrintifyOrder
    findByExternalReference?: typeof findPrintifyOrderByExternalReference
    sendToProduction: typeof sendPrintifyOrderToProduction
    shopId: () => string
}

const defaultApi: AIFulfillmentApi = {
    upload: uploadPrintifyImage,
    create: createPrintifyOrder,
    get: getPrintifyOrder,
    findByExternalReference: findPrintifyOrderByExternalReference,
    sendToProduction: sendPrintifyOrderToProduction,
    shopId: getPrintifyShopId
}

function shipping(order: Order) {
    const address = order.shippingAddressSnapshot as ShippingAddressInput | undefined
    if (!address?.firstName || !address.lastName || !address.email || !address.phone || !address.address1
        || !address.city || !address.postalCode || !address.countryCode) {
        throw new HttpError(409, 'A complete shipping address is required before fulfillment.')
    }
    return address
}

function safeFailureCode(error: any) {
    const status = Number(error?.response?.status)
    return status >= 400 && status < 600 ? `PRINTIFY_HTTP_${status}` : 'PRINTIFY_CUSTOM_REQUEST_FAILED'
}

function safeMetadata(value: any) {
    return {
        uploadPreviewUrl: value?.uploadPreviewUrl,
        orderStatus: value?.orderStatus,
        createdAt: value?.createdAt,
        sentToProductionAt: value?.sentToProductionAt
    }
}

async function lockedItem(itemId: number, transaction: Transaction) {
    const item = await OrderItem.findByPk(itemId, {
        include: [Order, AIDesign], transaction, lock: transaction.LOCK.UPDATE
    })
    if (!item?.order) throw new HttpError(404, 'Order item not found.')
    return item
}

function assertCustomMapping(item: OrderItem) {
    const productId = String(item.printifyProductIdSnapshot ?? '').trim()
    const providerId = Number(item.printifyProviderIdSnapshot)
    const blueprintId = Number(item.printifyBlueprintIdSnapshot)
    const variantId = Number(item.printifyVariantIdSnapshot)
    if (!productId || ![providerId, blueprintId, variantId].every(value => Number.isSafeInteger(value) && value > 0)) {
        throw new HttpError(409, 'The approved AI item is missing a valid Printify product or variant mapping.')
    }
    return { providerId, blueprintId, variantId }
}

export async function approvedArtworkForFulfillment(
    item: OrderItem,
    storage: PrivateStorageService = privateStorage
) {
    if (item.itemType !== CommerceItemType.AI_CUSTOM || !item.aiDesignId || !item.aiDesign) {
        throw new HttpError(409, 'This order item is not an AI-custom item.')
    }
    if (item.aiDesign.approvalStatus !== AIApprovalStatus.APPROVED
        || item.aiDesign.status !== AIDesignStatus.APPROVED_FOR_PRINT) {
        throw new HttpError(409, 'The AI design must be approved before it can be submitted to production.')
    }
    if (!item.approvedArtworkStorageKey || !item.artworkChecksumSha256) {
        throw new HttpError(409, 'The approved printable artwork is missing for this AI-custom item.')
    }
    if (![OrderItemStatus.APPROVED_FOR_PRINT, OrderItemStatus.FULFILLMENT_FAILED, OrderItemStatus.SENT_TO_PRINTIFY].includes(item.status)) {
        throw new HttpError(409, 'This AI order item is not eligible for fulfillment in its current review state.')
    }
    assertCustomMapping(item)
    let artwork: Buffer
    try {
        artwork = await storage.read(item.approvedArtworkStorageKey)
    } catch (error: any) {
        if (error?.code === 'ENOENT' || error?.message === 'Invalid private storage key') {
            throw new HttpError(409, 'The approved printable artwork file could not be found.')
        }
        throw error
    }
    if (createHash('sha256').update(artwork).digest('hex') !== item.artworkChecksumSha256) {
        throw new HttpError(409, 'The approved printable artwork snapshot could not be verified.')
    }
    return artwork
}

export function customOrderPayload(item: OrderItem, order: Order, artworkUrl: string): PrintifyOrderPayload {
    const address = shipping(order)
    const { providerId, blueprintId, variantId } = assertCustomMapping(item)
    if (!order.shippingMethodCode) throw new HttpError(409, 'This order is missing its verified shipping method.')
    const printOnSide = process.env.PRINTIFY_AI_PRINT_ON_SIDE
    return {
        external_id: `${order.orderNumber}-AI-${item.id}`,
        label: `${order.orderNumber} custom item ${item.id}`,
        line_items: [{
            print_provider_id: providerId,
            blueprint_id: blueprintId,
            variant_id: variantId,
            quantity: item.quantity,
            external_id: `order-item-${item.id}`,
            print_areas: { front: artworkUrl },
            ...(printOnSide === 'mirror' || printOnSide === 'regular' ? { print_details: { print_on_side: printOnSide } } : {})
        }],
        shipping_method: order.shippingMethodCode,
        send_shipping_notification: false,
        address_to: {
            first_name: address.firstName,
            last_name: address.lastName,
            email: address.email,
            phone: address.phone,
            country: address.countryCode,
            region: address.state,
            address1: address.address1,
            address2: address.address2,
            city: address.city,
            zip: address.postalCode
        }
    }
}

export async function fulfillAIOrderItem(
    itemId: number,
    actorUserId?: number,
    api: AIFulfillmentApi = defaultApi,
    mode: FulfillmentMode = fulfillmentMode(),
    storage: PrivateStorageService = privateStorage,
    action: AdminReviewAction = AdminReviewAction.PRINTIFY_SUBMITTED
) {
    return getDatabase().transaction(async transaction => {
        const item = await lockedItem(itemId, transaction)
        const order = item.order!
        const payment = await Payment.findOne({ where: { orderId: order.id }, transaction, lock: transaction.LOCK.UPDATE })
        if (payment?.status !== PaymentStatus.CAPTURED || order.paymentStatus !== PaymentStatus.CAPTURED) {
            throw new HttpError(409, 'Only paid AI order items may be fulfilled.')
        }
        const artwork = await approvedArtworkForFulfillment(item, storage)
        const allItems = await OrderItem.findAll({ where: { orderId: order.id }, transaction, lock: transaction.LOCK.UPDATE })
        await verifyPersistedOrderShipping(order, allItems, transaction)
        if (action === AdminReviewAction.PRINTIFY_RETRIED) {
            await CommerceAudit.create({
                actorUserId, orderId: order.id, orderItemId: item.id, aiDesignId: item.aiDesignId,
                action, statusBefore: item.status, statusAfter: item.status, metadata: { mode, attempted: true }
            }, { transaction })
        }
        if (mode === 'disabled') {
            return { itemId: Number(item.id), orderId: Number(order.id), status: item.status, mode, submitted: false }
        }

        try {
            if (item.status === OrderItemStatus.FULFILLMENT_FAILED) {
                assertOrderItemTransition(item.status, OrderItemStatus.APPROVED_FOR_PRINT)
                item.status = OrderItemStatus.APPROVED_FOR_PRINT
            }
            let metadata = (item.fulfillmentMetadata ?? {}) as any
            const alreadySubmitted = Boolean(item.printifyOrderId)
            let reconciled = false
            let remote: any
            if (item.printifyOrderId) {
                remote = await api.get(item.printifyOrderId)
                item.printifyStatus = String(remote?.status ?? item.printifyStatus ?? '')
                item.fulfillmentSyncedAt = new Date()
                item.fulfillmentMetadata = safeMetadata({
                    ...metadata,
                    orderStatus: remote?.status,
                    createdAt: remote?.created_at,
                    sentToProductionAt: remote?.sent_to_production_at
                })
                await item.save({ transaction })
            } else if (api.findByExternalReference) {
                remote = await api.findByExternalReference(
                    `${order.orderNumber}-AI-${item.id}`,
                    [`order-item-${item.id}`]
                )
                if (remote?.id) {
                    reconciled = true
                    item.printifyOrderId = String(remote.id)
                    item.printifyStatus = String(remote.status ?? 'pending')
                    item.fulfillmentSubmittedAt = new Date()
                    item.fulfillmentSyncedAt = new Date()
                    item.fulfillmentMetadata = safeMetadata({
                        ...metadata,
                        orderStatus: remote.status,
                        createdAt: remote.created_at,
                        sentToProductionAt: remote.sent_to_production_at
                    })
                    assertOrderItemTransition(item.status, OrderItemStatus.SENT_TO_PRINTIFY)
                    item.status = OrderItemStatus.SENT_TO_PRINTIFY
                    await item.save({ transaction })
                }
            }
            if (!item.printifyUploadId && !item.printifyOrderId) {
                const uploaded = await api.upload(`ai-design-${item.aiDesignId}-order-item-${item.id}.png`, artwork)
                if (!uploaded?.id || !uploaded?.preview_url) throw new Error('Printify upload response is incomplete.')
                item.printifyUploadId = String(uploaded.id)
                metadata = { ...metadata, uploadPreviewUrl: String(uploaded.preview_url) }
                item.fulfillmentMetadata = safeMetadata(metadata)
                await item.save({ transaction })
            }

            const artworkUrl = String(metadata.uploadPreviewUrl ?? (item.fulfillmentMetadata as any)?.uploadPreviewUrl ?? '')
            if (!item.printifyOrderId) {
                if (!artworkUrl.startsWith('https://') && !artworkUrl.startsWith('http://')) throw new Error('Printify artwork URL is unavailable.')
                const response = await api.create(customOrderPayload(item, order, artworkUrl))
                if (!response?.id) throw new Error('Printify order response did not include an id.')
                item.printifyOrderId = String(response.id)
                item.printifyStatus = String(response.status ?? 'pending')
                item.fulfillmentSubmittedAt = new Date()
                item.fulfillmentSyncedAt = new Date()
                item.fulfillmentMetadata = safeMetadata({ ...metadata, orderStatus: response.status, createdAt: response.created_at })
                assertOrderItemTransition(item.status, OrderItemStatus.SENT_TO_PRINTIFY)
                item.status = OrderItemStatus.SENT_TO_PRINTIFY
                await item.save({ transaction })
                await CommerceAudit.create({
                    actorUserId,
                    orderId: order.id,
                    orderItemId: item.id,
                    aiDesignId: item.aiDesignId,
                    action: AdminReviewAction.PRINTIFY_SUBMITTED,
                    statusBefore: OrderItemStatus.APPROVED_FOR_PRINT,
                    statusAfter: OrderItemStatus.SENT_TO_PRINTIFY,
                    metadata: { mode, printifyOrderId: item.printifyOrderId, printifyUploadId: item.printifyUploadId }
                }, { transaction })
            }
            const remoteAlreadyInProduction = ['sending-to-production', 'in-production', 'fulfilled', 'partially-fulfilled']
                .includes(String(remote?.status ?? ''))
            if (mode === 'production' && item.status !== OrderItemStatus.IN_PRODUCTION && !remoteAlreadyInProduction) {
                await api.sendToProduction(item.printifyOrderId!)
                assertOrderItemTransition(item.status, OrderItemStatus.IN_PRODUCTION)
                await item.update({ status: OrderItemStatus.IN_PRODUCTION }, { transaction })
            }
            await refreshOrderAggregate(Number(order.id), transaction)
            return {
                itemId: Number(item.id), orderId: Number(order.id), printifyOrderId: item.printifyOrderId,
                status: item.status, mode, submitted: true, idempotent: alreadySubmitted || reconciled, reconciled
            }
        } catch (error) {
            const code = safeFailureCode(error)
            if (item.status !== OrderItemStatus.FULFILLMENT_FAILED) {
                assertOrderItemTransition(item.status, OrderItemStatus.FULFILLMENT_FAILED)
            }
            await item.update({
                status: OrderItemStatus.FULFILLMENT_FAILED,
                fulfillmentFailureCode: code,
                fulfillmentSyncedAt: new Date()
            }, { transaction })
            await refreshOrderAggregate(Number(order.id), transaction)
            return {
                itemId: Number(item.id), orderId: Number(order.id), printifyOrderId: item.printifyOrderId,
                status: OrderItemStatus.FULFILLMENT_FAILED, mode, submitted: Boolean(item.printifyOrderId), retryable: true, code
            }
        }
    })
}

export async function synchronizeAIOrderItem(itemId: number, actorUserId: number | undefined, api: AIFulfillmentApi = defaultApi) {
    const existing = await OrderItem.findByPk(itemId)
    if (!existing) throw new HttpError(404, 'Order item not found.')
    if (!existing.printifyOrderId) throw new HttpError(409, 'This AI order item has not been submitted to production.')
    const remote = await api.get(existing.printifyOrderId)
    return getDatabase().transaction(async transaction => {
        const item = await lockedItem(itemId, transaction)
        const status = String(remote?.status ?? '')
        const shipment = (remote?.shipments ?? [])[0]
        let next = item.status
        if (['sending-to-production', 'in-production'].includes(status)) next = OrderItemStatus.IN_PRODUCTION
        else if (['fulfilled', 'partially-fulfilled'].includes(status) && shipment?.number) next = shipment?.delivered_at ? OrderItemStatus.DELIVERED : OrderItemStatus.SHIPPED
        else if (status === 'canceled') next = OrderItemStatus.CANCELLED
        else if (['payment-not-received', 'has-issues'].includes(status)) next = OrderItemStatus.FULFILLMENT_FAILED
        if (next !== item.status) assertOrderItemTransition(item.status, next)
        const before = item.status
        await item.update({
            status: next,
            printifyStatus: status || item.printifyStatus,
            fulfillmentSyncedAt: new Date(),
            fulfillmentFailureCode: next === OrderItemStatus.FULFILLMENT_FAILED ? 'PRINTIFY_REPORTED_ISSUE' : null
        }, { transaction })
        await CommerceAudit.create({
            actorUserId, orderId: item.orderId, orderItemId: item.id, aiDesignId: item.aiDesignId,
            action: AdminReviewAction.PRINTIFY_SYNCHRONIZED, statusBefore: before, statusAfter: next,
            metadata: { printifyStatus: status }
        }, { transaction })
        await refreshOrderAggregate(Number(item.orderId), transaction)
        return { itemId: Number(item.id), printifyOrderId: item.printifyOrderId, printifyStatus: status, status: next }
    })
}

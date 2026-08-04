import type { Transaction } from 'sequelize'
import { CommerceItemType, FulfillmentStatus, OrderItemStatus, OrderStatus, PaymentStatus } from '../database/models/model-enums'
import { Order } from '../database/models/order'
import { OrderItem } from '../database/models/order-item'
import { Payment } from '../database/models/payment'
import { Product } from '../database/models/product'
import { ProductVariant } from '../database/models/product-variant'
import { getDatabase } from '../database/database'
import HttpError from '../errors/http-error'
import {
    createPrintifyOrder,
    findPrintifyOrderByExternalReference,
    getPrintifyOrder,
    getPrintifyShopId,
    sendPrintifyOrderToProduction,
    type PrintifyOrderPayload
} from './printify'
import type { ShippingAddressInput } from './orders'
import { verifyPersistedOrderShipping } from './shipping'
import { refreshOrderAggregate } from './order-item-state'

export type FulfillmentMode = 'disabled' | 'draft' | 'production'

export interface PrintifyFulfillmentApi {
    create: typeof createPrintifyOrder
    get: typeof getPrintifyOrder
    findByExternalReference?: typeof findPrintifyOrderByExternalReference
    sendToProduction: typeof sendPrintifyOrderToProduction
    shopId: () => string
}

const defaultApi: PrintifyFulfillmentApi = {
    create: createPrintifyOrder,
    get: getPrintifyOrder,
    findByExternalReference: findPrintifyOrderByExternalReference,
    sendToProduction: sendPrintifyOrderToProduction,
    shopId: getPrintifyShopId
}

const allowedTransitions: Partial<Record<OrderStatus, OrderStatus[]>> = {
    [OrderStatus.PENDING]: [OrderStatus.PAID, OrderStatus.CANCELLED, OrderStatus.FAILED],
    [OrderStatus.PAID]: [OrderStatus.READY_FOR_FULFILLMENT, OrderStatus.REFUNDED],
    [OrderStatus.PENDING_AI_REVIEW]: [OrderStatus.APPROVED, OrderStatus.REJECTED, OrderStatus.FULFILLMENT_FAILED, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
    [OrderStatus.APPROVED]: [OrderStatus.READY_FOR_FULFILLMENT, OrderStatus.SENT_TO_PRINTIFY, OrderStatus.FULFILLMENT_FAILED, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
    [OrderStatus.REJECTED]: [OrderStatus.CANCELLED, OrderStatus.REFUNDED],
    [OrderStatus.READY_FOR_FULFILLMENT]: [OrderStatus.SENT_TO_PRINTIFY, OrderStatus.FULFILLMENT_FAILED, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
    [OrderStatus.FULFILLMENT_FAILED]: [OrderStatus.READY_FOR_FULFILLMENT, OrderStatus.SENT_TO_PRINTIFY, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
    [OrderStatus.SENT_TO_PRINTIFY]: [OrderStatus.PRINTING, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.FULFILLMENT_FAILED, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
    [OrderStatus.PRINTING]: [OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.FULFILLMENT_FAILED, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
    [OrderStatus.PARTIALLY_FULFILLED]: [OrderStatus.SENT_TO_PRINTIFY, OrderStatus.PRINTING, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.FULFILLMENT_FAILED, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
    [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.REFUNDED]
}

export function fulfillmentMode(): FulfillmentMode {
    const mode = (process.env.PRINTIFY_FULFILLMENT_MODE ?? 'disabled').toLowerCase()
    if (!['disabled', 'draft', 'production'].includes(mode)) {
        throw new Error('PRINTIFY_FULFILLMENT_MODE must be disabled, draft, or production.')
    }
    return mode as FulfillmentMode
}

export function assertOrderTransition(current: OrderStatus, next: OrderStatus) {
    if (current === next) return
    if (!(allowedTransitions[current] ?? []).includes(next)) {
        throw new HttpError(409, `Order cannot move from ${current} to ${next}.`)
    }
}

async function transition(order: Order, next: OrderStatus, transaction: Transaction) {
    assertOrderTransition(order.status, next)
    await order.update({ status: next }, { transaction })
}

async function lockedOrder(orderId: number, transaction: Transaction) {
    const order = await Order.findByPk(orderId, {
        include: [
            { model: OrderItem, include: [Product, ProductVariant] },
            Payment
        ],
        transaction,
        lock: transaction.LOCK.UPDATE
    })
    if (!order) throw new HttpError(404, 'Order not found.')
    return order
}

function eligibleShipping(order: Order) {
    const address = order.shippingAddressSnapshot as ShippingAddressInput | undefined
    if (!address || !address.firstName || !address.lastName || !address.email || !address.phone
        || !address.address1 || !address.city || !address.postalCode || !address.countryCode) {
        throw new HttpError(409, 'A complete shipping address is required before fulfillment.')
    }
    return address
}

function isCustomItem(item: OrderItem) {
    return item.itemType === CommerceItemType.AI_CUSTOM || Boolean(item.aiDesignId || item.artworkUrl || item.artworkStorageKey)
}

function fulfillmentPayload(order: Order, address: ShippingAddressInput): PrintifyOrderPayload {
    const lineItems = (order.items ?? []).filter(item => !isCustomItem(item)).map(item => {
        const productId = item.printifyProductIdSnapshot
        const variantId = item.printifyVariantIdSnapshot
        if (!productId || !variantId || !/^\d+$/.test(variantId)) {
            throw new HttpError(409, 'An order item has an invalid production reference.')
        }
        return {
            product_id: productId,
            variant_id: Number(variantId),
            quantity: item.quantity,
            external_id: `order-item-${item.id}`
        }
    })
    if (!lineItems.length) throw new HttpError(409, 'Custom-design orders are not eligible for standard fulfillment.')
    if (!order.shippingMethodCode) throw new HttpError(409, 'This order is missing its verified shipping method.')

    return {
        external_id: order.orderNumber,
        label: order.orderNumber,
        line_items: lineItems,
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

function safeMetadata(response: any) {
    return {
        id: response?.id,
        status: response?.status,
        createdAt: response?.created_at,
        sentToProductionAt: response?.sent_to_production_at
    }
}

function failureCode(error: any) {
    const status = Number(error?.response?.status)
    return status >= 400 && status < 600 ? `PRINTIFY_HTTP_${status}` : 'PRINTIFY_REQUEST_FAILED'
}

function ensureEligibleOrder(order: Order) {
    if (order.paymentStatus !== PaymentStatus.CAPTURED || order.payment?.status !== PaymentStatus.CAPTURED) {
        throw new HttpError(409, 'Only successfully paid orders can be fulfilled.')
    }
    if (![OrderStatus.PAID, OrderStatus.PENDING_AI_REVIEW, OrderStatus.APPROVED, OrderStatus.READY_FOR_FULFILLMENT, OrderStatus.FULFILLMENT_FAILED, OrderStatus.SENT_TO_PRINTIFY, OrderStatus.PARTIALLY_FULFILLED].includes(order.status)) {
        throw new HttpError(409, 'This order is not eligible for fulfillment in its current state.')
    }
}

export async function fulfillStandardOrder(
    orderId: number,
    api: PrintifyFulfillmentApi = defaultApi,
    mode: FulfillmentMode = fulfillmentMode()
) {
    return getDatabase().transaction(async transaction => {
        const order = await lockedOrder(orderId, transaction)
        ensureEligibleOrder(order)
        const address = eligibleShipping(order)
        await verifyPersistedOrderShipping(order, order.items ?? [], transaction)
        const payload = fulfillmentPayload(order, address)
        const standardItems = (order.items ?? []).filter(item => !isCustomItem(item))
        const mixed = standardItems.length !== (order.items ?? []).length
        for (const item of standardItems) {
            if (item.status === OrderItemStatus.PENDING_PAYMENT) await item.update({ status: OrderItemStatus.PAID }, { transaction })
        }

        if (!mixed && (order.status === OrderStatus.PAID || order.status === OrderStatus.FULFILLMENT_FAILED)) {
            await transition(order, OrderStatus.READY_FOR_FULFILLMENT, transaction)
        }
        await order.update({
            fulfillmentStatus: FulfillmentStatus.READY,
            fulfillmentFailureCode: null
        }, { transaction })

        if (mode === 'disabled') {
            const status = mixed
                ? (await refreshOrderAggregate(Number(order.id), transaction)).fulfillmentStatus
                : FulfillmentStatus.READY
            return { orderId: Number(order.id), status, mode, submitted: false }
        }

        try {
            const hadPrintifyOrderId = Boolean(order.printifyOrderId)
            let printifyOrderId = order.printifyOrderId
            let response: any = order.fulfillmentMetadata ?? {}
            let reconciled = false
            let aggregateStatus = order.fulfillmentStatus
            if (printifyOrderId) {
                response = await api.get(printifyOrderId)
                await order.update({
                    printifyStatus: response?.status ?? order.printifyStatus,
                    fulfillmentMetadata: safeMetadata(response),
                    fulfillmentSyncedAt: new Date()
                }, { transaction })
            } else if (api.findByExternalReference) {
                response = await api.findByExternalReference(
                    order.orderNumber,
                    standardItems.map(item => `order-item-${item.id}`)
                )
                if (response?.id) {
                    printifyOrderId = String(response.id)
                    reconciled = true
                }
            }
            if (!printifyOrderId) {
                response = await api.create(payload)
                if (!response?.id) throw new Error('Printify order response did not include an id.')
                printifyOrderId = String(response.id)
            }
            if (!order.printifyOrderId) {
                await order.update({
                    printifyOrderId,
                    printifyShopId: api.shopId(),
                    printifyStatus: response.status ?? 'pending',
                    fulfillmentMetadata: safeMetadata(response),
                    fulfillmentSubmittedAt: new Date(),
                    fulfillmentSyncedAt: new Date(),
                    fulfillmentStatus: FulfillmentStatus.SUBMITTED
                }, { transaction })
                await Promise.all(standardItems.map(item => item.update({
                    status: OrderItemStatus.SENT_TO_PRINTIFY,
                    fulfillmentSubmittedAt: new Date(),
                    fulfillmentSyncedAt: new Date()
                }, { transaction })))
                aggregateStatus = (await refreshOrderAggregate(Number(order.id), transaction)).fulfillmentStatus
            }

            const remoteAlreadyInProduction = ['sending-to-production', 'in-production', 'fulfilled', 'partially-fulfilled']
                .includes(String(response?.status ?? ''))
            if (mode === 'production' && order.fulfillmentStatus !== FulfillmentStatus.IN_PRODUCTION && !remoteAlreadyInProduction) {
                await api.sendToProduction(printifyOrderId)
                await Promise.all(standardItems.map(item => item.update({ status: OrderItemStatus.IN_PRODUCTION }, { transaction })))
                aggregateStatus = (await refreshOrderAggregate(Number(order.id), transaction)).fulfillmentStatus
            }
            return {
                orderId: Number(order.id),
                printifyOrderId,
                status: aggregateStatus,
                mode,
                submitted: true,
                idempotent: hadPrintifyOrderId || reconciled,
                reconciled
            }
        } catch (error) {
            const code = failureCode(error)
            await Promise.all(standardItems.map(item => item.update({
                status: OrderItemStatus.FULFILLMENT_FAILED,
                fulfillmentFailureCode: code,
                fulfillmentSyncedAt: new Date()
            }, { transaction })))
            await order.update({
                status: OrderStatus.FULFILLMENT_FAILED,
                fulfillmentStatus: FulfillmentStatus.FAILED,
                fulfillmentFailureCode: code,
                fulfillmentSyncedAt: new Date()
            }, { transaction })
            return {
                orderId: Number(order.id),
                printifyOrderId: order.printifyOrderId,
                status: FulfillmentStatus.FAILED,
                mode,
                submitted: Boolean(order.printifyOrderId),
                retryable: true,
                code
            }
        }
    })
}

function dateOrUndefined(value: unknown) {
    if (!value) return undefined
    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? undefined : date
}

export async function synchronizePrintifyOrder(orderId: number, api: PrintifyFulfillmentApi = defaultApi) {
    const existing = await Order.findByPk(orderId)
    if (!existing) throw new HttpError(404, 'Order not found.')
    if (!existing.printifyOrderId) throw new HttpError(409, 'This order has not been submitted to production.')
    const remote = await api.get(existing.printifyOrderId)

    return getDatabase().transaction(async transaction => {
        const order = await lockedOrder(orderId, transaction)
        const status = String(remote?.status ?? '')
        const shipment = (remote?.shipments ?? [])[0]
        const deliveredAt = dateOrUndefined(shipment?.delivered_at)
        const shippedAt = dateOrUndefined(shipment?.shipped_at)

        const standardItems = (order.items ?? []).filter(item => !isCustomItem(item))
        const mixed = standardItems.length !== (order.items ?? []).length
        let nextStatus = order.status
        let fulfillmentStatus = order.fulfillmentStatus
        if (['sending-to-production', 'in-production'].includes(status)) {
            if (!mixed) nextStatus = OrderStatus.PRINTING
            fulfillmentStatus = FulfillmentStatus.IN_PRODUCTION
            await Promise.all(standardItems.map(item => item.update({ status: OrderItemStatus.IN_PRODUCTION }, { transaction })))
        } else if (['fulfilled', 'partially-fulfilled'].includes(status) && shipment?.number) {
            if (!mixed) nextStatus = deliveredAt ? OrderStatus.DELIVERED : OrderStatus.SHIPPED
            fulfillmentStatus = deliveredAt ? FulfillmentStatus.DELIVERED : FulfillmentStatus.SHIPPED
            await Promise.all(standardItems.map(item => item.update({ status: deliveredAt ? OrderItemStatus.DELIVERED : OrderItemStatus.SHIPPED }, { transaction })))
        } else if (status === 'canceled') {
            if (!mixed) nextStatus = OrderStatus.CANCELLED
            fulfillmentStatus = FulfillmentStatus.CANCELLED
            await Promise.all(standardItems.map(item => item.update({ status: OrderItemStatus.CANCELLED }, { transaction })))
        } else if (['payment-not-received', 'has-issues'].includes(status)) {
            nextStatus = OrderStatus.FULFILLMENT_FAILED
            fulfillmentStatus = FulfillmentStatus.FAILED
            await Promise.all(standardItems.map(item => item.update({ status: OrderItemStatus.FULFILLMENT_FAILED }, { transaction })))
        }

        if (nextStatus !== order.status) assertOrderTransition(order.status, nextStatus)
        await order.update({
            status: nextStatus,
            fulfillmentStatus,
            printifyStatus: status || order.printifyStatus,
            fulfillmentMetadata: safeMetadata(remote),
            fulfillmentSyncedAt: new Date(),
            fulfillmentFailureCode: fulfillmentStatus === FulfillmentStatus.FAILED ? 'PRINTIFY_REPORTED_ISSUE' : null,
            trackingCarrier: shipment?.carrier,
            trackingNumber: shipment?.number,
            trackingUrl: shipment?.url,
            shippedAt,
            deliveredAt,
            fulfilledAt: dateOrUndefined(remote?.fulfilled_at)
        }, { transaction })

        const aggregate = await refreshOrderAggregate(orderId, transaction)

        return {
            orderId: Number(order.id),
            printifyOrderId: order.printifyOrderId,
            printifyStatus: status,
            fulfillmentStatus: aggregate.fulfillmentStatus,
            tracking: shipment?.number ? { carrier: shipment.carrier, number: shipment.number, url: shipment.url } : undefined
        }
    })
}

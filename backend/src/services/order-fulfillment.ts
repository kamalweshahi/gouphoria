import { AIDesign } from '../database/models/ai-design'
import { CommerceItemType, PaymentStatus } from '../database/models/model-enums'
import { Order } from '../database/models/order'
import { OrderItem } from '../database/models/order-item'
import { Payment } from '../database/models/payment'
import HttpError from '../errors/http-error'
import {
    approvedArtworkForFulfillment,
    fulfillAIOrderItem,
    synchronizeAIOrderItem,
    type AIFulfillmentApi
} from './ai-fulfillment'
import { privateStorage, type PrivateStorageService } from './ai-storage'
import {
    fulfillStandardOrder,
    fulfillmentMode,
    synchronizePrintifyOrder,
    type FulfillmentMode,
    type PrintifyFulfillmentApi
} from './fulfillment'

export interface OrderFulfillmentOptions {
    mode?: FulfillmentMode
    standardApi?: PrintifyFulfillmentApi
    aiApi?: AIFulfillmentApi
    storage?: PrivateStorageService
}

async function fulfillmentOrder(orderId: number) {
    const order = await Order.findByPk(orderId, {
        include: [Payment, { model: OrderItem, include: [AIDesign] }]
    })
    if (!order) throw new HttpError(404, 'Order not found.')
    if (order.paymentStatus !== PaymentStatus.CAPTURED || order.payment?.status !== PaymentStatus.CAPTURED) {
        throw new HttpError(409, 'Only successfully paid orders can be submitted to production.')
    }
    if (!(order.items ?? []).length) throw new HttpError(409, 'This order has no production items.')
    return order
}

export async function fulfillOrderByItemType(
    orderId: number,
    actorUserId?: number,
    options: OrderFulfillmentOptions = {}
) {
    const order = await fulfillmentOrder(orderId)
    const mode = options.mode ?? fulfillmentMode()
    const storage = options.storage ?? privateStorage
    const standardItems = (order.items ?? []).filter(item => item.itemType === CommerceItemType.STANDARD)
    const customItems = (order.items ?? []).filter(item => item.itemType === CommerceItemType.AI_CUSTOM)

    // Validate every custom line before any external order is created. This prevents
    // a mixed order from partially submitting when approved artwork or mapping is absent.
    for (const item of customItems) await approvedArtworkForFulfillment(item, storage)

    const custom = []
    for (const item of customItems) {
        custom.push(await fulfillAIOrderItem(
            Number(item.id), actorUserId, options.aiApi, mode, storage
        ))
    }
    const standard = standardItems.length
        ? await fulfillStandardOrder(orderId, options.standardApi, mode)
        : undefined
    const refreshed = await Order.findByPk(orderId)

    return {
        orderId,
        mode,
        status: refreshed?.fulfillmentStatus ?? order.fulfillmentStatus,
        orderKind: standardItems.length && customItems.length ? 'mixed' : customItems.length ? 'ai_custom' : 'standard',
        submitted: Boolean(standard?.submitted || custom.some(result => result.submitted)),
        standard,
        custom
    }
}

export async function synchronizeOrderByItemType(
    orderId: number,
    actorUserId?: number,
    options: Pick<OrderFulfillmentOptions, 'standardApi' | 'aiApi'> = {}
) {
    const order = await Order.findByPk(orderId, { include: [OrderItem] })
    if (!order) throw new HttpError(404, 'Order not found.')
    const customItems = (order.items ?? []).filter(item => item.itemType === CommerceItemType.AI_CUSTOM && item.printifyOrderId)
    const standard = order.printifyOrderId
        ? await synchronizePrintifyOrder(orderId, options.standardApi)
        : undefined
    const custom = []
    for (const item of customItems) {
        custom.push(await synchronizeAIOrderItem(Number(item.id), actorUserId, options.aiApi))
    }
    if (!standard && !custom.length) throw new HttpError(409, 'This order has not been submitted to production.')
    const refreshed = await Order.findByPk(orderId)
    return {
        orderId,
        status: refreshed?.fulfillmentStatus ?? order.fulfillmentStatus,
        standard,
        custom
    }
}

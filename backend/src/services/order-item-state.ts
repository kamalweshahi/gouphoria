import type { Transaction } from 'sequelize'
import { FulfillmentStatus, OrderItemStatus, OrderStatus } from '../database/models/model-enums'
import { Order } from '../database/models/order'
import { OrderItem } from '../database/models/order-item'
import HttpError from '../errors/http-error'
import { grantCompletedOrderReward } from './credits'

const transitions: Record<OrderItemStatus, OrderItemStatus[]> = {
    [OrderItemStatus.PENDING_PAYMENT]: [OrderItemStatus.PAID, OrderItemStatus.PENDING_DESIGN_REVIEW, OrderItemStatus.CANCELLED],
    [OrderItemStatus.PAID]: [OrderItemStatus.PENDING_DESIGN_REVIEW, OrderItemStatus.SENT_TO_PRINTIFY, OrderItemStatus.FULFILLMENT_FAILED, OrderItemStatus.CANCELLED, OrderItemStatus.REFUNDED],
    [OrderItemStatus.PENDING_DESIGN_REVIEW]: [OrderItemStatus.APPROVED_FOR_PRINT, OrderItemStatus.REJECTED, OrderItemStatus.CHANGES_REQUESTED, OrderItemStatus.CANCELLED, OrderItemStatus.REFUNDED],
    [OrderItemStatus.APPROVED_FOR_PRINT]: [OrderItemStatus.SENT_TO_PRINTIFY, OrderItemStatus.FULFILLMENT_FAILED, OrderItemStatus.CANCELLED, OrderItemStatus.REFUNDED],
    [OrderItemStatus.REJECTED]: [OrderItemStatus.CANCELLED, OrderItemStatus.REFUNDED],
    [OrderItemStatus.CHANGES_REQUESTED]: [OrderItemStatus.PENDING_DESIGN_REVIEW, OrderItemStatus.CANCELLED, OrderItemStatus.REFUNDED],
    [OrderItemStatus.SENT_TO_PRINTIFY]: [OrderItemStatus.IN_PRODUCTION, OrderItemStatus.SHIPPED, OrderItemStatus.DELIVERED, OrderItemStatus.FULFILLMENT_FAILED, OrderItemStatus.CANCELLED, OrderItemStatus.REFUNDED],
    [OrderItemStatus.IN_PRODUCTION]: [OrderItemStatus.SHIPPED, OrderItemStatus.DELIVERED, OrderItemStatus.FULFILLMENT_FAILED, OrderItemStatus.CANCELLED, OrderItemStatus.REFUNDED],
    [OrderItemStatus.SHIPPED]: [OrderItemStatus.DELIVERED, OrderItemStatus.REFUNDED],
    [OrderItemStatus.DELIVERED]: [OrderItemStatus.REFUNDED],
    [OrderItemStatus.FULFILLMENT_FAILED]: [OrderItemStatus.PAID, OrderItemStatus.APPROVED_FOR_PRINT, OrderItemStatus.SENT_TO_PRINTIFY, OrderItemStatus.CANCELLED, OrderItemStatus.REFUNDED],
    [OrderItemStatus.CANCELLED]: [],
    [OrderItemStatus.REFUNDED]: []
}

export function assertOrderItemTransition(current: OrderItemStatus, next: OrderItemStatus) {
    if (current === next) return
    if (!transitions[current]?.includes(next)) throw new HttpError(409, `Order item cannot move from ${current} to ${next}.`)
}

function aggregate(items: OrderItem[]) {
    const statuses = items.map(item => item.status)
    const started = statuses.filter(status => [
        OrderItemStatus.SENT_TO_PRINTIFY,
        OrderItemStatus.IN_PRODUCTION,
        OrderItemStatus.SHIPPED,
        OrderItemStatus.DELIVERED
    ].includes(status)).length
    const fulfillmentStatus = statuses.some(status => status === OrderItemStatus.FULFILLMENT_FAILED)
        ? FulfillmentStatus.FAILED
        : statuses.length > 0 && statuses.every(status => status === OrderItemStatus.DELIVERED)
            ? FulfillmentStatus.DELIVERED
            : started > 0 && started < statuses.length
                ? FulfillmentStatus.PARTIAL
                : statuses.some(status => status === OrderItemStatus.SHIPPED || status === OrderItemStatus.DELIVERED)
                ? FulfillmentStatus.SHIPPED
                : statuses.some(status => status === OrderItemStatus.IN_PRODUCTION)
                    ? FulfillmentStatus.IN_PRODUCTION
                    : statuses.some(status => status === OrderItemStatus.SENT_TO_PRINTIFY)
                        ? FulfillmentStatus.SUBMITTED
                        : statuses.some(status => status === OrderItemStatus.APPROVED_FOR_PRINT)
                            ? FulfillmentStatus.READY
                            : FulfillmentStatus.NOT_READY
    if (statuses.some(status => status === OrderItemStatus.PENDING_DESIGN_REVIEW || status === OrderItemStatus.CHANGES_REQUESTED)) {
        return { status: OrderStatus.PENDING_AI_REVIEW, fulfillmentStatus }
    }
    if (statuses.some(status => status === OrderItemStatus.REJECTED)) return { status: OrderStatus.REJECTED, fulfillmentStatus }
    if (statuses.some(status => status === OrderItemStatus.FULFILLMENT_FAILED)) return { status: OrderStatus.FULFILLMENT_FAILED, fulfillmentStatus: FulfillmentStatus.FAILED }
    if (statuses.length && statuses.every(status => status === OrderItemStatus.DELIVERED)) return { status: OrderStatus.DELIVERED, fulfillmentStatus: FulfillmentStatus.DELIVERED }
    if (statuses.length && statuses.every(status => [OrderItemStatus.SHIPPED, OrderItemStatus.DELIVERED].includes(status))) {
        return { status: OrderStatus.SHIPPED, fulfillmentStatus: FulfillmentStatus.SHIPPED }
    }
    if (statuses.some(status => status === OrderItemStatus.SHIPPED || status === OrderItemStatus.DELIVERED)) {
        return { status: OrderStatus.PARTIALLY_FULFILLED, fulfillmentStatus: FulfillmentStatus.PARTIAL }
    }
    if (statuses.length && statuses.every(status => status === OrderItemStatus.IN_PRODUCTION)) {
        return { status: OrderStatus.PRINTING, fulfillmentStatus: FulfillmentStatus.IN_PRODUCTION }
    }
    if (statuses.some(status => status === OrderItemStatus.IN_PRODUCTION)) {
        return { status: OrderStatus.PARTIALLY_FULFILLED, fulfillmentStatus: FulfillmentStatus.PARTIAL }
    }
    if (statuses.length && statuses.every(status => status === OrderItemStatus.SENT_TO_PRINTIFY)) {
        return { status: OrderStatus.SENT_TO_PRINTIFY, fulfillmentStatus: FulfillmentStatus.SUBMITTED }
    }
    if (statuses.some(status => status === OrderItemStatus.SENT_TO_PRINTIFY)) {
        return { status: OrderStatus.PARTIALLY_FULFILLED, fulfillmentStatus: FulfillmentStatus.PARTIAL }
    }
    if (statuses.some(status => status === OrderItemStatus.APPROVED_FOR_PRINT)) return { status: OrderStatus.APPROVED, fulfillmentStatus: FulfillmentStatus.READY }
    if (statuses.length && statuses.every(status => status === OrderItemStatus.PAID)) return { status: OrderStatus.PAID, fulfillmentStatus: FulfillmentStatus.NOT_READY }
    return { status: OrderStatus.PENDING, fulfillmentStatus: FulfillmentStatus.NOT_READY }
}

export async function refreshOrderAggregate(orderId: number, transaction: Transaction) {
    const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE })
    if (!order) throw new HttpError(404, 'Order not found.')
    const items = await OrderItem.findAll({ where: { orderId }, transaction, lock: transaction.LOCK.UPDATE })
    const next = aggregate(items)
    await order.update(next, { transaction })
    if (next.status === OrderStatus.DELIVERED) await grantCompletedOrderReward(orderId, transaction)
    return next
}

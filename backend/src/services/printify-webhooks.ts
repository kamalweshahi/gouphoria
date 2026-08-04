import { createHmac, timingSafeEqual } from 'crypto'
import { UniqueConstraintError } from 'sequelize'
import { OrderItemStatus, PaymentStatus } from '../database/models/model-enums'
import { Order } from '../database/models/order'
import { OrderItem } from '../database/models/order-item'
import { Payment } from '../database/models/payment'
import { PrintifyWebhookEvent } from '../database/models/printify-webhook-event'
import { getDatabase } from '../database/database'
import HttpError from '../errors/http-error'
import { refreshOrderAggregate } from './order-item-state'
import { createPrintifyWebhook, getPrintifyShopId, getPrintifyWebhooks } from './printify'

const supportedTopics = [
    'order:created',
    'order:updated',
    'order:sent-to-production',
    'order:shipment:created',
    'order:shipment:delivered'
] as const

interface PrintifyEvent {
    id: string
    type: string
    resource: {
        id: string
        type: string
        data?: {
            shop_id?: string | number
            status?: string
            shipped_at?: string
            delivered_at?: string
            carrier?: { code?: string; tracking_number?: string; tracking_url?: string }
        } | null
    }
}

function webhookSecret() {
    const secret = process.env.PRINTIFY_WEBHOOK_SECRET
    if (!secret || secret.length < 20) throw new HttpError(503, 'Printify webhook verification is not configured.')
    return secret
}

export function verifyPrintifyWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!signature) return false
    const expected = `sha256=${createHmac('sha256', webhookSecret()).update(rawBody).digest('hex')}`
    const received = Buffer.from(signature)
    const calculated = Buffer.from(expected)
    return received.length === calculated.length && timingSafeEqual(received, calculated)
}

function targetStatus(event: PrintifyEvent) {
    if (event.type === 'order:shipment:delivered') return OrderItemStatus.DELIVERED
    if (event.type === 'order:shipment:created') return OrderItemStatus.SHIPPED
    if (event.type === 'order:sent-to-production') return OrderItemStatus.IN_PRODUCTION
    const remote = String(event.resource.data?.status ?? '')
    if (['sending-to-production', 'in-production'].includes(remote)) return OrderItemStatus.IN_PRODUCTION
    if (['fulfilled', 'partially-fulfilled'].includes(remote)) return OrderItemStatus.SHIPPED
    if (remote === 'canceled') return OrderItemStatus.CANCELLED
    if (['payment-not-received', 'has-issues'].includes(remote)) return OrderItemStatus.FULFILLMENT_FAILED
    return undefined
}

function canAdvance(current: OrderItemStatus, next: OrderItemStatus) {
    const ranks: Partial<Record<OrderItemStatus, number>> = {
        [OrderItemStatus.PAID]: 1,
        [OrderItemStatus.APPROVED_FOR_PRINT]: 1,
        [OrderItemStatus.SENT_TO_PRINTIFY]: 2,
        [OrderItemStatus.IN_PRODUCTION]: 3,
        [OrderItemStatus.SHIPPED]: 4,
        [OrderItemStatus.DELIVERED]: 5
    }
    if ([OrderItemStatus.DELIVERED, OrderItemStatus.REFUNDED, OrderItemStatus.CANCELLED].includes(current)) {
        return current === next
    }
    if ([OrderItemStatus.CANCELLED, OrderItemStatus.FULFILLMENT_FAILED].includes(next)) {
        return ![OrderItemStatus.SHIPPED, OrderItemStatus.DELIVERED].includes(current)
    }
    return (ranks[next] ?? 0) >= (ranks[current] ?? 0)
}

function date(value: unknown) {
    if (!value) return undefined
    const parsed = new Date(String(value))
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export async function handlePrintifyWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!verifyPrintifyWebhook(rawBody, signature)) throw new HttpError(401, 'Printify webhook signature is invalid.')
    let event: PrintifyEvent
    try {
        event = JSON.parse(rawBody.toString('utf8'))
    } catch {
        throw new HttpError(400, 'Printify webhook payload is invalid.')
    }
    if (!event?.id || !event.type || !event.resource?.id || event.resource.type !== 'order'
        || !supportedTopics.includes(event.type as typeof supportedTopics[number])) {
        throw new HttpError(422, 'Printify webhook event is unsupported.')
    }
    const shopId = String(event.resource.data?.shop_id ?? '')
    if (!shopId || shopId !== String(getPrintifyShopId())) throw new HttpError(403, 'Printify webhook shop does not match.')

    try {
        return await getDatabase().transaction(async transaction => {
            const existing = await PrintifyWebhookEvent.findByPk(event.id, { transaction, lock: transaction.LOCK.UPDATE })
            if (existing) return { accepted: true, idempotent: true }

            let order = await Order.findOne({
                where: { printifyOrderId: event.resource.id },
                include: [OrderItem],
                transaction,
                lock: transaction.LOCK.UPDATE
            })
            let items = order?.items?.filter(item => !item.aiDesignId) ?? []
            if (!order) {
                const customItem = await OrderItem.findOne({
                    where: { printifyOrderId: event.resource.id },
                    include: [Order],
                    transaction,
                    lock: transaction.LOCK.UPDATE
                })
                order = customItem?.order ?? undefined
                items = customItem ? [customItem] : []
            }

            const next = targetStatus(event)
            let outcome = order ? 'ignored' : 'unmatched'
            const payment = order
                ? await Payment.findOne({ where: { orderId: order.id }, transaction, lock: transaction.LOCK.UPDATE })
                : undefined
            if (order && (order.paymentStatus !== PaymentStatus.CAPTURED || payment?.status !== PaymentStatus.CAPTURED)) {
                outcome = 'ignored_unpaid'
            } else if (order && next) {
                let updated = false
                for (const item of items) {
                    if (canAdvance(item.status, next)) {
                        updated = true
                        await item.update({
                            status: next,
                            printifyStatus: event.resource.data?.status ?? event.type,
                            fulfillmentFailureCode: next === OrderItemStatus.FULFILLMENT_FAILED ? 'PRINTIFY_REPORTED_ISSUE' : null,
                            fulfillmentSyncedAt: new Date()
                        }, { transaction })
                    }
                }
                if (updated) {
                    const carrier = event.resource.data?.carrier
                    await order.update({
                        printifyStatus: event.resource.data?.status ?? event.type,
                        trackingCarrier: carrier?.code ?? order.trackingCarrier,
                        trackingNumber: carrier?.tracking_number ?? order.trackingNumber,
                        trackingUrl: carrier?.tracking_url ?? order.trackingUrl,
                        shippedAt: date(event.resource.data?.shipped_at) ?? order.shippedAt,
                        deliveredAt: date(event.resource.data?.delivered_at) ?? order.deliveredAt,
                        fulfillmentSyncedAt: new Date()
                    }, { transaction })
                    await refreshOrderAggregate(Number(order.id), transaction)
                    outcome = 'updated'
                } else {
                    outcome = 'ignored_out_of_order'
                }
            }

            await PrintifyWebhookEvent.create({
                id: event.id,
                topic: event.type,
                resourceId: event.resource.id,
                shopId,
                outcome
            }, { transaction })
            return { accepted: true, idempotent: false }
        })
    } catch (error) {
        if (error instanceof UniqueConstraintError) return { accepted: true, idempotent: true }
        throw error
    }
}

export async function synchronizePrintifyWebhooks() {
    const baseUrl = process.env.PRINTIFY_WEBHOOK_BASE_URL?.replace(/\/$/, '')
    if (!baseUrl || !/^https:\/\//i.test(baseUrl)) throw new HttpError(422, 'PRINTIFY_WEBHOOK_BASE_URL must be a public HTTPS URL.')
    const secret = webhookSecret()
    const url = `${baseUrl}/webhooks/printify`
    const existing = await getPrintifyWebhooks()
    const installed: string[] = []
    for (const topic of supportedTopics) {
        if (existing.some(webhook => webhook.topic === topic && webhook.url === url)) continue
        await createPrintifyWebhook(topic, url, secret)
        installed.push(topic)
    }
    return { url, requiredTopics: [...supportedTopics], installed, alreadyPresent: supportedTopics.length - installed.length }
}

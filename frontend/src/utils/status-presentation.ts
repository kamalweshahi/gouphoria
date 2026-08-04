import type Order from '../models/Order'

export type StatusAudience = 'customer' | 'admin'
export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral'

interface StatusDefinition {
    customer: string
    admin?: string
    tone: StatusTone
    terminal?: boolean
    nextActions?: string[]
}

const statuses: Record<string, StatusDefinition> = {
    not_started: { customer: 'Not started', tone: 'neutral' },
    created: { customer: 'Payment pending', admin: 'Created', tone: 'warning', nextActions: ['complete_payment'] },
    pending: { customer: 'Pending', tone: 'warning' },
    pending_payment: { customer: 'Payment pending', tone: 'warning', nextActions: ['complete_payment'] },
    approved: { customer: 'Payment approved', tone: 'warning' },
    captured: { customer: 'Paid', admin: 'Captured', tone: 'success', terminal: true },
    paid: { customer: 'Paid', tone: 'success', terminal: true },
    failed: { customer: 'Failed', tone: 'danger', terminal: true, nextActions: ['retry_if_available'] },
    payment_failed: { customer: 'Payment failed', tone: 'danger', terminal: true, nextActions: ['retry_if_available'] },
    refunded: { customer: 'Refunded', tone: 'danger', terminal: true },
    cancelled: { customer: 'Cancelled', tone: 'danger', terminal: true },
    active: { customer: 'Active', tone: 'success' },
    disabled: { customer: 'Disabled', tone: 'danger', terminal: true },
    suspended: { customer: 'Suspended', tone: 'danger' },

    pending_ai_review: { customer: 'Awaiting design review', admin: 'Awaiting AI review', tone: 'warning', nextActions: ['review'] },
    pending_design_review: { customer: 'Awaiting design review', tone: 'warning', nextActions: ['review'] },
    pending_admin_review: { customer: 'Awaiting design review', admin: 'Awaiting admin review', tone: 'warning', nextActions: ['review'] },
    changes_requested: { customer: 'Change requested', tone: 'warning', nextActions: ['revise'] },
    change_requested: { customer: 'Change requested', tone: 'warning', nextActions: ['revise'] },
    approved_for_print: { customer: 'Design approved', admin: 'Approved for print', tone: 'success', terminal: true },
    rejected: { customer: 'Design rejected', tone: 'danger', terminal: true },
    draft: { customer: 'Draft', tone: 'neutral' },
    generating: { customer: 'Creating design', tone: 'warning' },
    generated: { customer: 'Design ready', tone: 'success' },
    waiting_for_user: { customer: 'Ready for your review', tone: 'warning' },
    revision_requested: { customer: 'Revision requested', tone: 'warning' },
    added_to_cart: { customer: 'Saved in cart', tone: 'success' },
    purchased: { customer: 'Ordered', tone: 'success', terminal: true },

    not_ready: { customer: 'Preparing for fulfillment', admin: 'Not ready', tone: 'neutral' },
    ready: { customer: 'Ready for production', tone: 'warning', nextActions: ['submit_fulfillment'] },
    ready_for_fulfillment: { customer: 'Ready for production', tone: 'warning', nextActions: ['submit_fulfillment'] },
    submitted: { customer: 'Sent to production', admin: 'Submitted to production', tone: 'warning' },
    sent_to_printify: { customer: 'Sent to production', admin: 'Sent to production', tone: 'warning' },
    processing: { customer: 'Processing', tone: 'warning' },
    printing: { customer: 'In production', tone: 'warning' },
    in_production: { customer: 'In production', tone: 'warning' },
    partially_fulfilled: { customer: 'Partially fulfilled', tone: 'warning' },
    partial: { customer: 'Partially shipped', admin: 'Partial fulfillment', tone: 'warning' },
    shipped: { customer: 'Shipped', tone: 'success' },
    delivered: { customer: 'Delivered', tone: 'success', terminal: true },
    fulfillment_failed: { customer: 'Fulfillment needs attention', admin: 'Fulfillment failed', tone: 'danger', nextActions: ['retry_fulfillment'] },
    completed: { customer: 'Completed', tone: 'success', terminal: true },
    succeeded: { customer: 'Completed', tone: 'success', terminal: true }
}

function fallbackLabel(status: string) {
    return status.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

export function statusPresentation(status?: string, audience: StatusAudience = 'customer'): StatusDefinition {
    const normalized = (status || 'not_started').toLowerCase()
    const definition = statuses[normalized]
    if (!definition) return { customer: fallbackLabel(normalized), tone: 'neutral' }
    return {
        ...definition,
        customer: audience === 'admin' && definition.admin ? definition.admin : definition.customer
    }
}

export function statusLabel(status?: string, audience: StatusAudience = 'customer') {
    return statusPresentation(status, audience).customer
}

export function orderKind(items: Order['items']) {
    const hasStandard = items.some(item => item.itemType === 'standard')
    const hasCustom = items.some(item => item.itemType === 'ai_custom')
    return hasStandard && hasCustom ? 'Mixed order' : hasCustom ? 'AI-custom order' : 'Standard order'
}

export function phoneBrand(phoneModel?: string) {
    const value = phoneModel?.trim() || ''
    if (/iphone/i.test(value)) return 'Apple'
    if (/galaxy|samsung/i.test(value)) return 'Samsung'
    if (/pixel/i.test(value)) return 'Google'
    return 'Phone'
}

export function customerOrderStatus(order: Pick<Order, 'status' | 'paymentStatus' | 'fulfillmentStatus' | 'items'>) {
    if (['failed', 'payment_failed', 'refunded', 'cancelled'].includes(order.paymentStatus)) return order.paymentStatus
    if (!['captured', 'paid'].includes(order.paymentStatus)) return order.paymentStatus || 'pending_payment'

    const itemStatuses = order.items.map(item => item.status)
    if (itemStatuses.some(status => status === 'fulfillment_failed' || status === 'failed')) return 'fulfillment_failed'
    if (itemStatuses.some(status => status === 'changes_requested')) return 'changes_requested'
    if (itemStatuses.some(status => ['pending_ai_review', 'pending_design_review', 'pending_admin_review'].includes(status))) return 'pending_design_review'
    if (order.fulfillmentStatus === 'partially_fulfilled' || order.fulfillmentStatus === 'partial') return order.fulfillmentStatus
    return order.fulfillmentStatus || order.status
}

export interface TimelineStep {
    label: string
    state: 'complete' | 'current' | 'pending' | 'danger'
    detail?: string
}

export function orderTimeline(order: Order): TimelineStep[] {
    const paid = ['captured', 'paid'].includes(order.paymentStatus)
    const paymentFailed = ['failed', 'payment_failed', 'cancelled', 'refunded'].includes(order.paymentStatus)
    const customItems = order.items.filter(item => item.itemType === 'ai_custom')
    const reviewFailed = customItems.some(item => ['rejected', 'changes_requested'].includes(item.status))
    const reviewComplete = customItems.length > 0 && customItems.every(item =>
        ['approved_for_print', 'ready', 'submitted', 'in_production', 'shipped', 'delivered', 'completed'].includes(item.status))
    const productionStarted = ['submitted', 'in_production', 'printing', 'shipped', 'delivered', 'partial', 'partially_fulfilled'].includes(order.fulfillmentStatus)
    const anyShipped = order.fulfillmentSummary
        ? order.fulfillmentSummary.shipped + order.fulfillmentSummary.delivered > 0
        : ['shipped', 'delivered', 'partial', 'partially_fulfilled'].includes(order.fulfillmentStatus)
    const allShipped = ['shipped', 'delivered'].includes(order.fulfillmentStatus)
    const delivered = order.fulfillmentStatus === 'delivered'
    const steps: TimelineStep[] = [
        { label: 'Order created', state: 'complete', detail: new Date(order.createdAt).toLocaleString() },
        {
            label: 'Payment completed',
            state: paid ? 'complete' : paymentFailed ? 'danger' : 'current',
            detail: order.paidAt ? new Date(order.paidAt).toLocaleString() : statusLabel(order.paymentStatus)
        }
    ]

    if (customItems.length) {
        steps.push({
            label: reviewComplete ? 'Design approved' : 'Design review',
            state: reviewComplete ? 'complete' : reviewFailed ? 'danger' : paid ? 'current' : 'pending',
            detail: reviewFailed
                ? customItems.map(item => statusLabel(item.status)).filter((value, index, values) => values.indexOf(value) === index).join(', ')
                : `${customItems.length} custom ${customItems.length === 1 ? 'item' : 'items'}`
        })
    }

    steps.push(
        { label: 'Sent to production', state: productionStarted ? 'complete' : paid && (!customItems.length || reviewComplete) ? 'current' : 'pending' },
        { label: allShipped ? 'Shipped' : anyShipped ? 'Partially shipped' : 'Shipped', state: allShipped ? 'complete' : anyShipped ? 'current' : 'pending' },
        { label: 'Delivered', state: delivered ? 'complete' : 'pending' }
    )
    return steps
}

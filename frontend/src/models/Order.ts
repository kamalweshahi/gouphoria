export interface OrderItem {
    id: number
    productTitle: string
    variantTitle: string
    phoneModel: string
    caseType: string
    image?: string
    quantity: number
    unitPrice: number
    unitPriceCents: number
    lineTotal: number
    lineTotalCents: number
    currency: string
    itemType: 'standard' | 'ai_custom'
    status: string
    aiDesignId?: number
    basePrice: number
    artwork?: string
    mockup?: string
    reviewMessage?: string
}

export default interface Order {
    id: number
    orderNumber: string
    status: string
    paymentStatus: string
    currency: string
    subtotal: number
    subtotalCents: number
    shippingAmount: number
    shippingAmountCents: number
    taxAmount: number
    taxAmountCents: number
    total: number
    totalCents: number
    shippingMethod?: { id: string; name?: string; shippingMethod?: number }
    paypalOrderId?: string
    productionStarted?: boolean
    fulfillmentStatus: string
    fulfillmentSummary?: {
        totalItems: number
        awaitingReview: number
        submitted: number
        inProduction: number
        shipped: number
        delivered: number
        failed: number
        partial: boolean
    }
    fulfillmentFailure?: string
    shippingAddress?: import('./ShippingAddress').default
    tracking?: {
        carrier?: string
        number: string
        url?: string
        shippedAt?: string
        deliveredAt?: string
    }
    paidAt?: string
    createdAt: string
    updatedAt: string
    items: OrderItem[]
}

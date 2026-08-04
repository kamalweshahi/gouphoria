export interface CartItem {
    id: number
    productId: string
    variantId: string
    quantity: number
    unitPrice: number
    unitPriceCents: number
    lineTotal: number
    lineTotalCents: number
    currency: string
    productTitle: string
    variantTitle: string
    phoneModel: string
    caseType: string
    image?: string
    itemType: 'standard' | 'ai_custom'
    aiDesignId?: number
    basePrice: number
    artwork?: string
    mockup?: string
}

export default interface Cart {
    id: number
    status: string
    items: CartItem[]
    itemCount: number
    currency: string
    subtotal: number
    subtotalCents: number
}

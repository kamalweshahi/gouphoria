export interface ShippingOption {
    id: string
    name: string
    shippingMethod: number
    priceCents: number
    price: number
    currency: string
    pricing: {
        currency: string
        subtotalCents: number
        shippingCents: number
        taxCents: number
        totalCents: number
        subtotal: number
        shipping: number
        tax: number
        total: number
    }
}

export default interface ShippingQuote {
    id: string
    expiresAt: string
    context: 'cart' | 'direct'
    shippingOptions: ShippingOption[]
}

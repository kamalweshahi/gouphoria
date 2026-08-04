export interface CreditPackage {
    id: string
    name: string
    credits: number
    price: number
    currency: string
}

export interface CreditPurchase {
    id: number
    packageId: string
    packageName: string
    credits: number
    price: number
    currency: string
    paypalOrderId?: string
    status: 'created' | 'approved' | 'captured' | 'failed' | 'cancelled' | 'refunded'
    creditsGranted: boolean
    capturedAt?: string
    creditsGrantedAt?: string
    createdAt: string
    updatedAt: string
}

export interface CreditTransaction {
    id: number
    date: string
    type: string
    amount: number
    balanceAfter: number
    description: string
    related: { designId?: number; purchaseId?: number; orderId?: number }
}

export interface CreditHistory {
    balance: number
    transactions: CreditTransaction[]
    purchases: Array<{
        id: number
        packageName: string
        credits: number
        price: number
        currency: string
        status: CreditPurchase['status']
        creditsGranted: boolean
        createdAt: string
        capturedAt?: string
    }>
}

export interface AdminUserCredits extends CreditHistory {
    user: { id: number; name: string; email: string }
}

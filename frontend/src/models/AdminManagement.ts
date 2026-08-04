import type Product from './Product'

export interface Pagination { page: number; pageSize: number; total: number; totalPages: number }
export interface AdminCustomer {
    id: number; name: string; email: string; role: 'user' | 'admin'; status: string
    createdAt: string; lastLoginAt?: string
    metrics: { orders: number; paidOrders: number; totalSpending: number; savedDesigns: number; creditBalance: number; lastOrderAt?: string }
}
export interface AdminOrderSummary {
    id: number; orderNumber: string; customer?: { id: number; name: string; email: string }
    createdAt: string; products: string[]; quantity: number; subtotal: number; shipping: number; total: number; currency: string
    paymentStatus: string; status: string; fulfillmentStatus: string; printifyStatus?: string; trackingNumber?: string
    paypalOrderId?: string; printifyOrderId?: string
    itemCount: number; standardItems: number; customItems: number; orderKind: 'standard' | 'ai_custom' | 'mixed'
    awaitingReview: boolean; shippingStatus: string
}
export interface AdminProduct extends Product {
    databaseId: number; printifyTitle: string; printifyDescription?: string; printifyImage?: string
    providerVisible: boolean; providerStatus: string; retailPrice?: number | null; blueprintId?: string; printProviderId?: string
    catalogSyncedAt?: string; printifyUpdatedAt?: string
}
export interface AdminProductDeletionPlan {
    productId: number; productName: string; action: 'delete' | 'archive'; message: string
    references: { orderItems: number; cartItems: number; savedDesigns: number; shippingQuotes: number; auditRecords: number; total: number }
    alreadyProcessed?: 'deleted' | 'archived'
    archivedWithHistory?: boolean
}
export interface AdminCustomerDetails {
    user: AdminCustomer; creditBalance: number; orders: AdminOrderSummary[]
    activeSessions: number
    addresses: Array<{ id: number; recipientName: string; line1: string; line2?: string; city: string; state?: string; postalCode: string; countryCode: string; phone?: string; isDefault: boolean }>
    designs: Array<{ id: number; prompt: string; status: string; approvalStatus: string; product?: string; phoneModel?: string; caseType?: string; createdAt: string }>
    creditTransactions: Array<{ id: number; amount: number; balanceBefore: number; balanceAfter: number; reason: string; referenceId?: string; createdAt: string }>
    creditPurchases: Array<{ id: number; packageName: string; credits: number; price: number; currency: string; status: string; paypalOrderId?: string; capturedAt?: string; createdAt: string }>
    notes: Array<{ id: number; note: string; admin?: string; createdAt: string }>
    audits: Array<{ id: number; action: string; statusBefore?: string; statusAfter?: string; metadata?: object; createdAt: string }>
}
export interface AdminOrderDetails extends AdminOrderSummary {
    shippingAddress?: Record<string, string>; shippingQuote?: { id: string; context: string; createdAt: string; expiresAt: string; currency: string }
    shippingMethod?: { id?: string; name?: string; code?: number }; tax: number
    items: Array<{ id: number; itemType: string; status: string; productTitle: string; variantTitle: string; phoneModel: string; caseType: string; quantity: number; unitPrice: number; totalPrice: number; currency: string; aiDesignId?: number; artwork?: string; approvedArtwork?: string; mockup?: string; printify: Record<string, string | undefined>; design?: { id: number; prompt: string; revisionPrompt?: string; status: string; approvalStatus: string; generationCount: number } }>
    paypal: { environment: string; orderId?: string; captureId?: string; status: string; amount?: number; currency?: string; capturedAt?: string }
    printify: { mode: string; shopId?: string; orderId?: string; status?: string; submittedAt?: string; synchronizedAt?: string; failure?: string; tracking?: { carrier?: string; number?: string; url?: string } }
    notes: Array<{ id: number; note: string; action?: string; admin?: string; createdAt: string }>
    audits: Array<{ id: number; action: string; statusBefore?: string; statusAfter?: string; actor?: string; metadata?: object; createdAt: string }>
    webhookEvents: Array<{ id: string; topic: string; outcome: string; createdAt: string }>
}

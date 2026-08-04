export interface AdminReviewNote {
    id: number
    note: string
    visibility: 'internal' | 'user'
    action?: string
    statusBefore?: string
    statusAfter?: string
    admin?: { id: number; name: string }
    createdAt: string
}

export interface AdminReview {
    itemId: number
    orderId: number
    orderNumber: string
    customer?: { id: number; name: string; email: string }
    paymentStatus: string
    orderStatus: string
    itemStatus: string
    quantity: number
    submittedAt: string
    product: { id?: string; title: string }
    variant: { id?: string; title: string; phoneModel: string; caseType: string }
    pricing: { basePrice: number; unitPrice: number; currency: string }
    design: {
        id: number
        prompt: string
        revisionPrompt?: string
        status: string
        approvalStatus: string
        generationCount: number
        artwork: string
        mockup: string
        uploads: Array<{ id: number; url: string }>
    }
    notes: AdminReviewNote[]
    fulfillment: { printifyOrderId?: string; printifyStatus?: string; failed: boolean; retryable: boolean }
}

export interface AdminDashboardData {
    counts: {
        pendingReviews: number; changeRequested: number; approvedDesigns: number; rejectedDesigns: number
        fulfillmentFailures: number; paidAwaitingFulfillment: number; inProduction: number; shippedOrders: number
        paymentIssues: number; customers: number; activeProducts: number; disabledProducts: number; disabledVariants: number
    }
    recentPaidOrders: Array<{
        id: number
        orderNumber: string
        customer?: string
        total: number
        currency: string
        status: string
        customItems: number
        reviewItemId?: number
        paidAt?: string
    }>
}

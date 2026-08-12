export type AIDesignStatus =
    | 'draft'
    | 'generating'
    | 'generated'
    | 'waiting_for_user'
    | 'revision_requested'
    | 'approved'
    | 'failed'
    | 'added_to_cart'
    | 'purchased'
    | 'pending_admin_review'
    | 'approved_for_print'
    | 'rejected'
    | 'completed'
    | 'cancelled'

export interface AIGeneration {
    id: number
    kind: 'initial' | 'revision'
    status: 'processing' | 'succeeded' | 'failed'
    artworkUrl?: string
    mockupPreviewUrl?: string
    mockupTemplateId?: string
    selectedVariantId?: string
    artworkPlacement?: {
        left: number
        top: number
        width: number
        height: number
        fit: 'cover'
        position: 'centre'
        crop: { left: number; top: number; width: number; height: number }
        perspectiveCorners?: Array<{ x: number; y: number }>
        bleed?: number
        focalPoint?: { x: number; y: number }
        printableMaskId?: string
        safeArea?: { left: number; top: number; width: number; height: number }
        buttonExclusionZones?: Array<{ side: 'left' | 'right'; top: number; height: number; inset: number }>
        review?: {
            status: 'ready' | 'needs-review'
            reasons: string[]
            horizontalCropRatio: number
            verticalCropRatio: number
        }
    }
    mockupGeneratedAt?: string
    createdAt: string
    completedAt?: string
}

export interface AIDesignCommerceEntry {
    orderId?: number
    orderNumber?: string
    orderItemId: number
    paymentStatus?: string
    reviewStatus: string
    customerMessage?: string
    createdAt: string
}

export type MockupPreviewStatus = {
    status: 'supported'
    requestedPhoneModel: string
    normalizedPhoneModel: string
    mockupTemplateId: string
    cameraTemplateId: string
    shellTemplateId: string
} | {
    status: 'unsupported-model'
    requestedPhoneModel: string
}

export default interface AIDesign {
    id: number
    prompt: string
    revisionPrompt?: string
    status: AIDesignStatus
    approvalStatus: string
    ownershipConfirmed: boolean
    ownershipConfirmedAt?: string
    creditsUsed: number
    generationCount: number
    revisionAvailable: boolean
    generatedAt?: string
    mockupPreviewUrl?: string
    mockupPreviewStatus?: MockupPreviewStatus
    mockupTemplateId?: string
    selectedVariantId?: string
    artworkPlacement?: AIGeneration['artworkPlacement']
    mockupGeneratedAt?: string
    product?: { id: string; title: string; available?: boolean }
    variant?: { id: string; title: string; phoneModel: string; caseType: string }
    uploads: Array<{
        id: number
        url: string
        mimeType: string
        sizeBytes: number
        width?: number
        height?: number
    }>
    artwork: {
        originalUrl?: string
        currentUrl?: string
        mockupUrl?: string
    }
    generations: AIGeneration[]
    commerce: AIDesignCommerceEntry[]
    createdAt: string
    updatedAt: string
}

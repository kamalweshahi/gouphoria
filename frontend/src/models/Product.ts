export interface ProductImage {
    src?: string
    variant_ids?: Array<number | string>
    position?: string
    is_default?: boolean
}

export interface ProductVariant {
    databaseId?: number
    id: string
    printifyVariantId?: string
    title: string
    phoneModel: string
    caseType: string
    priceCents: number
    price: number
    currency: string
    available: boolean
    isEnabled: boolean
    providerEnabled?: boolean
    storefrontEnabled?: boolean
    image?: string
    sku?: string
    mockupTemplateId?: string
    mockupPreviewStatus?: {
        status: 'supported' | 'unsupported-model'
        requestedPhoneModel: string
        normalizedPhoneModel?: string
        mockupTemplateId?: string
        cameraTemplateId?: string
        shellTemplateId?: string
    }
    metadata?: {
        options?: Array<number | string>
        cost?: number
        rawTitle?: string
    }
}

export default interface Product {
    id: string
    printifyProductId?: string
    title: string
    displayName?: string
    description: string
    shortDescription?: string
    storefrontCategory?: string
    image?: string
    storefrontImage?: string
    price: number | null
    currency: string
    variantsCount: number
    variants: ProductVariant[]
    phoneModels: string[]
    caseTypes: string[]
    images?: ProductImage[]
    visible: boolean
    isVisible?: boolean
    isActive?: boolean
    sortOrder?: number
    allowDirectPurchase?: boolean
    allowAiCustomization?: boolean
    aiCustomOnly?: boolean
    tags: string[]
    createdAt?: string
    updatedAt?: string
}

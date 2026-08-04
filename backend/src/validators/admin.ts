import Joi from 'joi'

export const reviewItemParamsSchema = Joi.object({
    itemId: Joi.number().integer().positive().required()
})

export const reviewAssetParamsSchema = Joi.object({
    itemId: Joi.number().integer().positive().required(),
    kind: Joi.string().valid('artwork', 'mockup').required()
})

export const reviewUploadParamsSchema = Joi.object({
    itemId: Joi.number().integer().positive().required(),
    uploadId: Joi.number().integer().positive().required()
})

export const reviewDecisionSchema = Joi.object({
    decision: Joi.string().valid('approve', 'reject', 'changes_requested').required(),
    note: Joi.string().trim().max(1200).allow('').optional(),
    internalNote: Joi.string().trim().max(1200).allow('').optional()
}).options({ stripUnknown: true })

export const adminReviewQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid(
        'pending_design_review', 'changes_requested', 'approved_for_print', 'rejected',
        'sent_to_printify', 'in_production', 'shipped', 'delivered', 'fulfillment_failed'
    )
}).options({ stripUnknown: true })

export const adminCreditUserParamsSchema = Joi.object({
    userId: Joi.number().integer().positive().required()
})

export const adminCreditAdjustmentSchema = Joi.object({
    amount: Joi.number().integer().min(-10000).max(10000).invalid(0).required(),
    reason: Joi.string().trim().min(3).max(500).required()
}).options({ allowUnknown: false, stripUnknown: false })

export const adminUserParamsSchema = Joi.object({ userId: Joi.number().integer().positive().required() })
export const adminOrderParamsSchema = Joi.object({ orderId: Joi.number().integer().positive().required() })
export const adminProductParamsSchema = Joi.object({ productId: Joi.number().integer().positive().required() })
export const adminOrderAssetParamsSchema = Joi.object({
    orderId: Joi.number().integer().positive().required(),
    itemId: Joi.number().integer().positive().required(),
    kind: Joi.string().valid('artwork', 'approved-artwork', 'mockup').required()
})

export const adminCustomerQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().trim().max(254).allow(''),
    status: Joi.string().valid('active', 'suspended', 'disabled'),
    role: Joi.string().valid('user', 'admin'),
    hasOrders: Joi.boolean(),
    hasDesigns: Joi.boolean(),
    sort: Joi.string().valid('name', 'email', 'createdAt', 'lastLoginAt', 'status', 'role').default('createdAt'),
    direction: Joi.string().valid('asc', 'desc').default('desc')
}).options({ stripUnknown: true })

export const adminOrderQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
    search: Joi.string().trim().max(254).allow(''),
    paymentStatus: Joi.string().valid('created', 'approved', 'captured', 'failed', 'refunded'),
    fulfillmentStatus: Joi.string().valid('not_ready', 'ready', 'submitted', 'in_production', 'partial', 'shipped', 'delivered', 'failed', 'cancelled'),
    printifyStatus: Joi.string().trim().max(64).allow(''),
    orderStatus: Joi.string().valid('pending', 'paid', 'ready_for_fulfillment', 'fulfillment_failed', 'pending_ai_review', 'approved', 'rejected', 'sent_to_printify', 'printing', 'partially_fulfilled', 'shipped', 'delivered', 'cancelled', 'refunded', 'failed'),
    itemType: Joi.string().valid('standard', 'ai_custom', 'mixed'),
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
    sort: Joi.string().valid('createdAt', 'total', 'status', 'paymentStatus', 'fulfillmentStatus').default('createdAt'),
    direction: Joi.string().valid('asc', 'desc').default('desc')
}).options({ stripUnknown: true })

export const adminCustomerStatusSchema = Joi.object({
    status: Joi.string().valid('active', 'suspended', 'disabled').required()
}).options({ stripUnknown: true })

export const adminCustomerNoteSchema = Joi.object({
    note: Joi.string().trim().min(3).max(2000).required()
}).options({ stripUnknown: true })

export const adminProductUpdateSchema = Joi.object({
    displayName: Joi.string().trim().max(160).allow('', null),
    shortDescription: Joi.string().trim().max(500).allow('', null),
    storefrontCategory: Joi.string().trim().max(100).allow('', null),
    storefrontImage: Joi.string().uri({ scheme: ['http', 'https'] }).max(2000).allow('', null),
    isVisible: Joi.boolean().required(),
    isActive: Joi.boolean().required(),
    sortOrder: Joi.number().integer().min(-100000).max(100000).required(),
    allowDirectPurchase: Joi.boolean().required(),
    allowAiCustomization: Joi.boolean().required(),
    aiCustomOnly: Joi.boolean().required(),
    retailPrice: Joi.number().precision(2).min(0.01).max(100000).allow(null),
    blueprintId: Joi.string().trim().max(100).pattern(/^\d+$/).allow('', null),
    printProviderId: Joi.string().trim().max(100).pattern(/^\d+$/).allow('', null),
    variants: Joi.array().items(Joi.object({ id: Joi.number().integer().positive().required(), enabled: Joi.boolean().required() })).max(1000)
}).options({ allowUnknown: false })

export const adminProductDeleteSchema = Joi.object({
    confirmation: Joi.string().trim().min(3).max(255).required()
}).options({ allowUnknown: false })

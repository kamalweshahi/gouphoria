import Joi from 'joi'

export const createCreditPurchaseSchema = Joi.object({
    packageId: Joi.string().trim().min(1).max(64).required(),
    idempotencyKey: Joi.string().trim().min(16).max(120).required()
}).options({ allowUnknown: false, stripUnknown: false })

export const creditPurchaseParamsSchema = Joi.object({
    purchaseId: Joi.number().integer().positive().required()
})

export const captureCreditPurchaseSchema = Joi.object({
    paypalOrderId: Joi.string().trim().min(4).max(120).required()
}).options({ allowUnknown: false, stripUnknown: false })

export const cancelCreditPurchaseSchema = Joi.object({
    paypalOrderId: Joi.string().trim().min(4).max(120).optional()
}).options({ allowUnknown: false, stripUnknown: false })

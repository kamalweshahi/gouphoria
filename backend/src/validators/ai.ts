import Joi from 'joi'

export const AI_PROMPT_MIN_LENGTH = 12
export const AI_PROMPT_MAX_LENGTH = 1000
export const AI_REVISION_MIN_LENGTH = 5
export const AI_REVISION_MAX_LENGTH = 600

const prompt = Joi.string().trim().min(AI_PROMPT_MIN_LENGTH).max(AI_PROMPT_MAX_LENGTH).required().messages({
    'string.empty': 'Describe the artwork you want to create.',
    'string.min': `Please provide at least ${AI_PROMPT_MIN_LENGTH} characters so the design intent is clear.`,
    'string.max': `Keep the design prompt under ${AI_PROMPT_MAX_LENGTH} characters.`,
    'any.required': 'Describe the artwork you want to create.'
})

const idempotencyKey = Joi.string().trim().pattern(/^[A-Za-z0-9_-]{12,120}$/).required().messages({
    'string.pattern.base': 'The generation request identifier is invalid.',
    'any.required': 'A generation request identifier is required.'
})

export const createAIDesignSchema = Joi.object({
    productId: Joi.string().trim().min(1).max(100).required().messages({ 'any.required': 'Choose a phone case product.' }),
    variantId: Joi.string().trim().min(1).max(100).required().messages({ 'any.required': 'Choose a supported phone model and case type.' }),
    prompt,
    ownershipConfirmed: Joi.boolean().valid(true).required().messages({
        'any.only': 'Confirm that you own the rights to upload and use these images.',
        'any.required': 'Confirm that you own the rights to upload and use these images.'
    })
}).options({ stripUnknown: true })

export const generateAIDesignSchema = Joi.object({ idempotencyKey }).options({ stripUnknown: true })

export const changeAIDesignVariantSchema = Joi.object({
    productId: Joi.string().trim().min(1).max(100).required().messages({ 'any.required': 'Choose a phone case product.' }),
    variantId: Joi.string().trim().min(1).max(100).required().messages({ 'any.required': 'Choose an available phone model and case type.' })
}).options({ stripUnknown: true })

export const reviseAIDesignSchema = Joi.object({
    idempotencyKey,
    instructions: Joi.string().trim().min(AI_REVISION_MIN_LENGTH).max(AI_REVISION_MAX_LENGTH).required().messages({
        'string.empty': 'Describe the change you want.',
        'string.min': `Please provide at least ${AI_REVISION_MIN_LENGTH} characters for the revision.`,
        'string.max': `Keep revision instructions under ${AI_REVISION_MAX_LENGTH} characters.`,
        'any.required': 'Describe the change you want.'
    })
}).options({ stripUnknown: true })

export const aiDesignParamsSchema = Joi.object({
    designId: Joi.number().integer().positive().required().messages({ 'number.base': 'Design ID must be valid.' })
})

export const aiUploadParamsSchema = Joi.object({
    uploadId: Joi.number().integer().positive().required().messages({ 'number.base': 'Image ID must be valid.' })
})

export const aiAssetParamsSchema = Joi.object({
    designId: Joi.number().integer().positive().required(),
    assetKind: Joi.string().valid('original', 'current', 'mockup').required()
})

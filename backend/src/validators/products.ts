import Joi from 'joi'
import { shippingAddressSchema } from './orders'
import { MAX_CART_ITEM_QUANTITY } from '../services/cart'

const printifyId = Joi.string().trim().min(1).max(100).pattern(/^[A-Za-z0-9_-]+$/)

export const productIdParamsSchema = Joi.object({
    productId: printifyId.required().messages({
        'string.pattern.base': 'Product id is invalid.',
        'string.empty': 'Product id is required.'
    })
})

export const catalogImageParamsSchema = Joi.object({
    token: Joi.string().hex().length(64).required()
})

export const createPaymentOrderSchema = Joi.object({
    orderId: Joi.number().integer().positive(),
    productId: printifyId.messages({
        'string.pattern.base': 'Product id is invalid.',
        'string.empty': 'Product id is required.'
    }),
    variantId: printifyId.messages({
        'string.pattern.base': 'Variant id is invalid.',
        'string.empty': 'Select a phone model and case type before payment.',
        'any.required': 'Select a phone model and case type before payment.'
    }),
    shippingAddress: shippingAddressSchema.optional(),
    shippingQuoteId: Joi.string().uuid(),
    shippingOptionId: Joi.string().valid('standard', 'express', 'priority', 'printify_express', 'economy'),
    quantity: Joi.number().integer().min(1).max(MAX_CART_ITEM_QUANTITY)
}).xor('orderId', 'productId')
    .with('productId', ['variantId', 'shippingAddress', 'shippingQuoteId', 'shippingOptionId'])
    .without('orderId', ['variantId', 'shippingAddress', 'shippingQuoteId', 'shippingOptionId', 'quantity'])
    .options({ stripUnknown: true })

export const capturePaymentOrderSchema = Joi.object({
    orderId: Joi.number().integer().positive().required().messages({ 'any.required': 'Local order ID is required.' })
}).options({ stripUnknown: true })

export const paypalOrderParamsSchema = Joi.object({
    orderId: Joi.string().trim().min(1).max(128).pattern(/^[A-Za-z0-9_-]+$/).required()
        .messages({ 'string.pattern.base': 'Payment reference is invalid.' })
})

import Joi from 'joi'
import { MAX_CART_ITEM_QUANTITY } from '../services/cart'

const id = Joi.number().integer().positive()

export const cartItemParamsSchema = Joi.object({
    itemId: id.required().messages({ 'number.base': 'Cart item ID must be valid.' })
})

export const aiDesignCartParamsSchema = Joi.object({
    designId: id.required().messages({ 'number.base': 'Design ID must be valid.' })
})

export const addAIDesignCartItemSchema = Joi.object({
    quantity: Joi.number().integer().min(1).max(MAX_CART_ITEM_QUANTITY).default(1)
}).options({ stripUnknown: true })

export const addCartItemSchema = Joi.object({
    productId: Joi.string().trim().min(1).max(100).required().messages({ 'any.required': 'Choose a product.' }),
    variantId: Joi.string().trim().min(1).max(100).required().messages({ 'any.required': 'Choose a phone case option.' }),
    quantity: Joi.number().integer().min(1).max(MAX_CART_ITEM_QUANTITY).required().messages({
        'number.base': 'Quantity must be a whole number.',
        'number.integer': 'Quantity must be a whole number.',
        'number.min': 'Quantity must be at least 1.',
        'number.max': `Quantity cannot exceed ${MAX_CART_ITEM_QUANTITY}.`
    })
}).options({ stripUnknown: true })

export const updateCartItemSchema = Joi.object({
    quantity: Joi.number().integer().min(1).max(MAX_CART_ITEM_QUANTITY).required().messages({
        'number.base': 'Quantity must be a whole number.',
        'number.integer': 'Quantity must be a whole number.',
        'number.min': 'Quantity must be at least 1.',
        'number.max': `Quantity cannot exceed ${MAX_CART_ITEM_QUANTITY}.`
    })
}).options({ stripUnknown: true })

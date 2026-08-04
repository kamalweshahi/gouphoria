import Joi from 'joi'
import { MAX_CART_ITEM_QUANTITY } from '../services/cart'

export const shippingAddressSchema = Joi.object({
    firstName: Joi.string().trim().min(1).max(80).required().messages({ 'any.required': 'First name is required.' }),
    lastName: Joi.string().trim().min(1).max(80).required().messages({ 'any.required': 'Last name is required.' }),
    email: Joi.string().trim().lowercase().email().max(254).required().messages({ 'string.email': 'Enter a valid shipping email.' }),
    phone: Joi.string().trim().min(6).max(32).pattern(/^[+()\d\s.-]+$/).required().messages({ 'string.pattern.base': 'Enter a valid phone number.' }),
    address1: Joi.string().trim().min(3).max(180).required().messages({ 'any.required': 'Address line 1 is required.' }),
    address2: Joi.string().trim().allow('').max(180).optional(),
    city: Joi.string().trim().min(1).max(120).required().messages({ 'any.required': 'City is required.' }),
    state: Joi.string().trim().allow('').max(120).when('countryCode', {
        is: Joi.valid('US', 'CA', 'AU'),
        then: Joi.string().trim().min(1).required().messages({ 'any.required': 'State or region is required for this country.' })
    }),
    postalCode: Joi.string().trim().min(2).max(32).required().messages({ 'any.required': 'Postal code is required.' }),
    countryCode: Joi.string().trim().uppercase().length(2).pattern(/^[A-Z]{2}$/).required().messages({ 'string.length': 'Use a two-letter country code.' })
}).required().options({ stripUnknown: true })

const printifyId = Joi.string().trim().min(1).max(100).pattern(/^[A-Za-z0-9_-]+$/)

export const shippingQuoteSchema = Joi.object({
    shippingAddress: shippingAddressSchema,
    productId: printifyId,
    variantId: printifyId,
    quantity: Joi.number().integer().min(1).max(MAX_CART_ITEM_QUANTITY).default(1)
}).and('productId', 'variantId').options({ stripUnknown: true })

export const createOrderSchema = Joi.object({
    shippingAddress: shippingAddressSchema,
    shippingQuoteId: Joi.string().uuid().required().messages({ 'any.required': 'Request shipping options before checkout.' }),
    shippingOptionId: Joi.string().valid('standard', 'express', 'priority', 'printify_express', 'economy').required()
}).options({ stripUnknown: true })

export const orderParamsSchema = Joi.object({
    orderId: Joi.number().integer().positive().required().messages({ 'number.base': 'Order ID must be valid.' })
})

export const orderItemAssetParamsSchema = Joi.object({
    orderId: Joi.number().integer().positive().required(),
    itemId: Joi.number().integer().positive().required(),
    kind: Joi.string().valid('artwork', 'mockup').required()
})

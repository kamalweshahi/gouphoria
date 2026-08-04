import Joi from 'joi'

const email = Joi.string().trim().lowercase().email().max(254).required().messages({
    'string.email': 'Enter a valid email address.',
    'string.empty': 'Email is required.',
    'any.required': 'Email is required.'
})

const password = Joi.string()
    .min(10)
    .max(128)
    .pattern(/[a-z]/, 'lowercase letter')
    .pattern(/[A-Z]/, 'uppercase letter')
    .pattern(/[0-9]/, 'number')
    .required()
    .messages({
        'string.empty': 'Password is required.',
        'string.min': 'Password must be at least 10 characters.',
        'string.max': 'Password must be no more than 128 characters.',
        'string.pattern.name': 'Password must include at least one {#name}.',
        'any.required': 'Password is required.'
    })

export const registerSchema = Joi.object({
    name: Joi.string().trim().min(2).max(120).required().messages({
        'string.empty': 'Name is required.',
        'string.min': 'Name must be at least 2 characters.',
        'string.max': 'Name must be no more than 120 characters.',
        'any.required': 'Name is required.'
    }),
    email,
    password,
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
        'any.only': 'Passwords do not match.',
        'string.empty': 'Confirm your password.',
        'any.required': 'Confirm your password.'
    })
}).options({ abortEarly: false, stripUnknown: true })

export const loginSchema = Joi.object({
    email,
    password: Joi.string().max(128).required().messages({
        'string.empty': 'Password is required.',
        'any.required': 'Password is required.'
    })
}).options({ abortEarly: false, stripUnknown: true })

export const userIdParamsSchema = Joi.object({
    userId: Joi.number().integer().positive().required().messages({
        'number.base': 'User id must be a number.',
        'number.positive': 'User id must be positive.'
    })
})

import type { Request } from 'express'
import { ipKeyGenerator, MemoryStore, rateLimit } from 'express-rate-limit'

type LimitName = 'AUTH_LOGIN' | 'AUTH_REGISTER' | 'AI' | 'UPLOAD' | 'PAYMENT' | 'CREDIT_PURCHASE' | 'ADMIN_ACTION'

const stores = new Map<LimitName, MemoryStore>()

function integerSetting(name: string, fallback: number, minimum: number, maximum: number) {
    const value = Number(process.env[name] ?? fallback)
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} is invalid`)
    return value
}

function clientKey(request: Request) {
    return ipKeyGenerator(request.ip || request.socket.remoteAddress || 'unknown')
}

function authenticatedKey(request: Request) {
    return `user:${request.authUser?.id ?? 'anonymous'}:ip:${clientKey(request)}`
}

function limiter(
    name: LimitName,
    options: {
        defaultWindowMs: number
        defaultMax: number
        message: string
        keyGenerator?: (request: Request) => string
        skipSuccessfulRequests?: boolean
    }
) {
    const windowMs = integerSetting(`${name}_RATE_LIMIT_WINDOW_MS`, options.defaultWindowMs, 1000, 24 * 60 * 60 * 1000)
    const max = integerSetting(`${name}_RATE_LIMIT_MAX`, options.defaultMax, 1, 10000)
    const store = new MemoryStore()
    stores.set(name, store)
    return rateLimit({
        windowMs,
        limit: max,
        store,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        skipSuccessfulRequests: options.skipSuccessfulRequests,
        keyGenerator: options.keyGenerator ?? authenticatedKey,
        handler(request, response) {
            response.setHeader('Retry-After', String(Math.max(1, Math.ceil(windowMs / 1000))))
            response.status(429).json({
                message: options.message,
                eventId: request.eventId,
                code: 'RATE_LIMITED',
                recoverable: true
            })
        }
    })
}

function normalizedAccountKey(request: Request) {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase().slice(0, 254) : 'unknown'
    return `ip:${clientKey(request)}:account:${email}`
}

export const loginRateLimit = limiter('AUTH_LOGIN', {
    defaultWindowMs: 15 * 60 * 1000,
    defaultMax: 10,
    message: 'Too many login attempts. Please wait and try again.',
    keyGenerator: normalizedAccountKey,
    skipSuccessfulRequests: true
})

export const registerRateLimit = limiter('AUTH_REGISTER', {
    defaultWindowMs: 60 * 60 * 1000,
    defaultMax: 30,
    message: 'Too many account-creation attempts. Please wait and try again.',
    keyGenerator: request => `ip:${clientKey(request)}`
})

export const aiGenerationRateLimit = limiter('AI', {
    defaultWindowMs: 60 * 1000,
    defaultMax: 6,
    message: 'Too many AI requests. Please wait a moment and try again.'
})

export const uploadRateLimit = limiter('UPLOAD', {
    defaultWindowMs: 60 * 1000,
    defaultMax: 12,
    message: 'Too many upload attempts. Please wait a moment and try again.'
})

export const paymentRateLimit = limiter('PAYMENT', {
    defaultWindowMs: 60 * 1000,
    defaultMax: 20,
    message: 'Too many payment requests. Please wait briefly and retry the same checkout.',
    keyGenerator: request => `${authenticatedKey(request)}:route:${request.route?.path ?? request.path}`
})

export const creditPurchaseRateLimit = limiter('CREDIT_PURCHASE', {
    defaultWindowMs: 60 * 1000,
    defaultMax: 10,
    message: 'Too many credit payment requests. Please wait a moment and try again.',
    keyGenerator: request => `${authenticatedKey(request)}:route:${request.route?.path ?? request.path}`
})

export const adminActionRateLimit = limiter('ADMIN_ACTION', {
    defaultWindowMs: 60 * 1000,
    defaultMax: 30,
    message: 'Too many sensitive admin actions. Please wait and verify the current state before retrying.',
    keyGenerator: request => `${authenticatedKey(request)}:route:${request.route?.path ?? request.path}`
})

export function resetRateLimitsForTests(name?: LimitName) {
    if (name) {
        stores.get(name)?.resetAll()
        return
    }
    for (const store of stores.values()) store.resetAll()
}

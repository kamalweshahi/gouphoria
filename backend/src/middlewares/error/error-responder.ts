import type { NextFunction, Request, Response } from 'express'
import HttpError from '../../errors/http-error'

interface ErrorShape {
    status?: number
    message?: string
    response?: { status?: number }
}

export default function respondError(err: ErrorShape, request: Request, response: Response, next: NextFunction) {
    const candidate = err.status ?? err.response?.status ?? 500
    const status = candidate >= 400 && candidate <= 599 ? candidate : 500
    const isTrustedApplicationError = err instanceof HttpError
    const configurationMessage = err.message?.includes('is not configured') ? err.message : undefined
    const message = status === 413 && !isTrustedApplicationError
        ? 'The request is too large.'
        : isTrustedApplicationError
        ? (err.message || 'The request could not be completed.')
        : configurationMessage ?? (status >= 500
            ? 'Store server error. Please try again later.'
            : 'A connected service could not complete this request. Please try again.')

    response.status(status).json({
        message,
        eventId: request.eventId,
        ...(isTrustedApplicationError && err.code ? { code: err.code } : {}),
        ...(isTrustedApplicationError && err.recoverable ? { recoverable: true } : {})
    })
}

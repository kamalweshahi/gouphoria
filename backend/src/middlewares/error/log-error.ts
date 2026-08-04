
import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
    namespace Express {
        interface Request {
            eventId: string
        }
    }
}

interface SafeErrorShape {
    name?: string
    code?: string
    status?: number
    response?: { status?: number }
}

export default function logError(err: SafeErrorShape, request: Request, response: Response, next: NextFunction) {
    request.eventId = randomUUID()
    const status = err.status ?? err.response?.status ?? 500
    if (status >= 500) {
        // Deliberately omit the original error object: Axios errors may contain
        // provider authorization headers and request payloads.
        console.error('unexpected request failure', {
            eventId: request.eventId,
            method: request.method,
            path: request.path,
            status,
            name: err.name,
            code: err.code
        })
    }
    next(err)
}

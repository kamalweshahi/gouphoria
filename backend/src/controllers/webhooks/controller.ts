import type { NextFunction, Request, Response } from 'express'
import { handlePrintifyWebhook } from '../../services/printify-webhooks'

export async function printifyWebhook(request: Request, response: Response, next: NextFunction) {
    try {
        const result = await handlePrintifyWebhook(request.body as Buffer, request.header('x-pfy-signature'))
        response.status(200).json(result)
    } catch (error) {
        next(error)
    }
}

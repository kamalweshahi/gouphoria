import type { NextFunction, Request, Response } from 'express'
import { fulfillStandardOrder, synchronizePrintifyOrder } from '../../services/fulfillment'

export async function retryFulfillment(request: Request<{ orderId: string }>, response: Response, next: NextFunction) {
    try {
        const result = await fulfillStandardOrder(Number(request.params.orderId))
        response.status(result.status === 'failed' ? 202 : 200).json({ fulfillment: result })
    } catch (error) {
        next(error)
    }
}

export async function syncFulfillment(request: Request<{ orderId: string }>, response: Response, next: NextFunction) {
    try {
        response.json({ fulfillment: await synchronizePrintifyOrder(Number(request.params.orderId)) })
    } catch (error) {
        next(error)
    }
}

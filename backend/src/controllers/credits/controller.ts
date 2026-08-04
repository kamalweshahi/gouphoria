import type { NextFunction, Request, Response } from 'express'
import {
    cancelCreditPurchase,
    captureCreditPurchase,
    createCreditPurchase,
    getCreditHistory,
    listActiveCreditPackages
} from '../../services/credits'

function userId(request: Request) {
    return Number(request.authUser!.id)
}

export async function packages(request: Request, response: Response, next: NextFunction) {
    try { response.json({ packages: await listActiveCreditPackages() }) } catch (error) { next(error) }
}

export async function history(request: Request, response: Response, next: NextFunction) {
    try { response.json(await getCreditHistory(userId(request))) } catch (error) { next(error) }
}

export async function createPurchase(
    request: Request<{}, {}, { packageId: string; idempotencyKey: string }>,
    response: Response,
    next: NextFunction
) {
    try {
        response.status(201).json({ purchase: await createCreditPurchase(userId(request), request.body.packageId, request.body.idempotencyKey) })
    } catch (error) { next(error) }
}

export async function capturePurchase(
    request: Request<{ purchaseId: string }, {}, { paypalOrderId: string }>,
    response: Response,
    next: NextFunction
) {
    try {
        response.json(await captureCreditPurchase(userId(request), Number(request.params.purchaseId), request.body.paypalOrderId))
    } catch (error) { next(error) }
}

export async function cancelPurchase(
    request: Request<{ purchaseId: string }, {}, { paypalOrderId?: string }>,
    response: Response,
    next: NextFunction
) {
    try {
        response.json({ purchase: await cancelCreditPurchase(userId(request), Number(request.params.purchaseId), request.body.paypalOrderId) })
    } catch (error) { next(error) }
}

import type { NextFunction, Request, Response } from 'express'
import { createPendingOrderForVariant, getOwnedOrderModel, type ShippingAddressInput } from '../../services/orders'
import { captureSavedPayPalOrder, createPayPalOrderForSavedOrder, recoverSavedPayPalOrder } from '../../services/payments'
import { getPayPalClientId } from '../../services/paypal'

export function getPayPalClient(request: Request, response: Response, next: NextFunction) {
    try {
        response.json({ clientId: getPayPalClientId() })
    } catch (e) {
        next(e)
    }
}

export async function createOrder(request: Request<{}, {}, { orderId?: number; productId?: string; variantId?: string; shippingAddress?: ShippingAddressInput; shippingQuoteId?: string; shippingOptionId?: string; quantity?: number }>, response: Response, next: NextFunction) {
    try {
        const userId = Number(request.authUser!.id)
        const localOrder = request.body.orderId
            ? await getOwnedOrderModel(userId, request.body.orderId)
            : await createPendingOrderForVariant(
                userId,
                request.body.productId!,
                request.body.variantId!,
                request.body.shippingAddress!,
                request.body.shippingQuoteId!,
                request.body.shippingOptionId!,
                request.body.quantity ?? 1
            )
        response.status(201).json(await createPayPalOrderForSavedOrder(userId, Number(localOrder.id)))
    } catch (e) {
        next(e)
    }
}

export async function captureOrder(request: Request<{ orderId: string }, {}, { orderId: number }>, response: Response, next: NextFunction) {
    try {
        const order = await captureSavedPayPalOrder(
            Number(request.authUser!.id),
            request.body.orderId,
            request.params.orderId
        )
        response.json(order)
    } catch (e) {
        next(e)
    }
}

export async function recoverOrder(request: Request<{ orderId: string }, {}, { orderId: number }>, response: Response, next: NextFunction) {
    try {
        const order = await recoverSavedPayPalOrder(
            Number(request.authUser!.id),
            request.body.orderId,
            request.params.orderId
        )
        response.json(order)
    } catch (e) {
        next(e)
    }
}

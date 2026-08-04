import type { NextFunction, Request, Response } from 'express'
import { createPendingOrderFromCart, getUserOrder, getUserOrders, readOwnedOrderItemAsset, type ShippingAddressInput } from '../../services/orders'
import { createShippingQuote } from '../../services/shipping'

export async function quoteShipping(request: Request<{}, {}, { shippingAddress: ShippingAddressInput; productId?: string; variantId?: string; quantity?: number }>, response: Response, next: NextFunction) {
    try {
        response.status(201).json({ shippingQuote: await createShippingQuote(Number(request.authUser!.id), request.body) })
    } catch (error) {
        next(error)
    }
}

export async function createOrderFromCart(request: Request<{}, {}, { shippingAddress: ShippingAddressInput; shippingQuoteId: string; shippingOptionId: string }>, response: Response, next: NextFunction) {
    try {
        response.status(201).json({ order: await createPendingOrderFromCart(
            Number(request.authUser!.id),
            request.body.shippingAddress,
            request.body.shippingQuoteId,
            request.body.shippingOptionId
        ) })
    } catch (error) {
        next(error)
    }
}

export async function listOrders(request: Request, response: Response, next: NextFunction) {
    try {
        response.json({ orders: await getUserOrders(Number(request.authUser!.id)) })
    } catch (error) {
        next(error)
    }
}

export async function viewOrder(request: Request<{ orderId: string }>, response: Response, next: NextFunction) {
    try {
        response.json({ order: await getUserOrder(Number(request.authUser!.id), Number(request.params.orderId)) })
    } catch (error) {
        next(error)
    }
}

export async function viewOrderItemAsset(request: Request<{ orderId: string; itemId: string; kind: 'artwork' | 'mockup' }>, response: Response, next: NextFunction) {
    try {
        const asset = await readOwnedOrderItemAsset(
            Number(request.authUser!.id),
            Number(request.params.orderId),
            Number(request.params.itemId),
            request.params.kind
        )
        response.setHeader('Content-Type', asset.mimeType)
        response.setHeader('Cache-Control', 'private, max-age=300')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.send(asset.bytes)
    } catch (error) {
        next(error)
    }
}

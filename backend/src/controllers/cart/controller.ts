import type { NextFunction, Request, Response } from 'express'
import { addAIDesignCartItem, addCartItem, clearCart, getCart, removeCartItem, updateCartItem } from '../../services/cart'

function userId(request: Request) {
    return Number(request.authUser!.id)
}

export async function viewCart(request: Request, response: Response, next: NextFunction) {
    try {
        response.json({ cart: await getCart(userId(request)) })
    } catch (error) {
        next(error)
    }
}

export async function addItem(request: Request<{}, {}, { productId: string; variantId: string; quantity: number }>, response: Response, next: NextFunction) {
    try {
        response.status(201).json({ cart: await addCartItem(userId(request), request.body) })
    } catch (error) {
        next(error)
    }
}

export async function addAIDesignItem(request: Request<{ designId: string }, {}, { quantity: number }>, response: Response, next: NextFunction) {
    try {
        response.status(201).json({ cart: await addAIDesignCartItem(userId(request), Number(request.params.designId), request.body.quantity) })
    } catch (error) {
        next(error)
    }
}

export async function updateItem(request: Request<{ itemId: string }, {}, { quantity: number }>, response: Response, next: NextFunction) {
    try {
        response.json({ cart: await updateCartItem(userId(request), Number(request.params.itemId), request.body.quantity) })
    } catch (error) {
        next(error)
    }
}

export async function removeItem(request: Request<{ itemId: string }>, response: Response, next: NextFunction) {
    try {
        response.json({ cart: await removeCartItem(userId(request), Number(request.params.itemId)) })
    } catch (error) {
        next(error)
    }
}

export async function emptyCart(request: Request, response: Response, next: NextFunction) {
    try {
        response.json({ cart: await clearCart(userId(request)) })
    } catch (error) {
        next(error)
    }
}

import type { NextFunction, Request, Response } from 'express'
import { fulfillAIOrderItem, synchronizeAIOrderItem } from '../../services/ai-fulfillment'
import {
    getAdminDashboard,
    getAIReview,
    listAIReviewQueue,
    readAdminReviewAsset,
    readAdminReviewUpload,
    reviewAIOrderItem,
    type ReviewDecision
} from '../../services/admin-reviews'
import { AdminReviewAction } from '../../database/models/model-enums'
import { adjustUserCredits, getAdminUserCredits } from '../../services/credits'
import { synchronizePrintifyWebhooks } from '../../services/printify-webhooks'
import {
    addAdminCustomerNote,
    addAdminOrderNote,
    getAdminCustomer,
    getAdminOrder,
    listAdminCustomers,
    listAdminOrders,
    readAdminOrderItemAsset,
    retryAdminOrderFulfillment,
    syncAdminOrderFulfillment,
    updateAdminCustomerStatus
} from '../../services/admin-management'
import {
    deleteOrArchiveAdminProduct,
    getAdminProduct,
    getAdminProductDeletionPlan,
    listAdminProducts,
    updateAdminProduct
} from '../../services/catalog'
import type { UserStatus } from '../../database/models/model-enums'

function adminId(request: Request) {
    return Number(request.authUser!.id)
}

export async function dashboard(request: Request, response: Response, next: NextFunction) {
    try { response.json({ dashboard: await getAdminDashboard() }) } catch (error) { next(error) }
}

export async function reviewQueue(request: Request, response: Response, next: NextFunction) {
    try { response.json(await listAIReviewQueue((request as any).validatedQuery ?? request.query)) } catch (error) { next(error) }
}

export async function reviewDetails(request: Request<{ itemId: string }>, response: Response, next: NextFunction) {
    try { response.json({ review: await getAIReview(Number(request.params.itemId)) }) } catch (error) { next(error) }
}

export async function decideReview(request: Request<{ itemId: string }, {}, { decision: ReviewDecision; note?: string; internalNote?: string }>, response: Response, next: NextFunction) {
    try { response.json(await reviewAIOrderItem(adminId(request), Number(request.params.itemId), request.body)) } catch (error) { next(error) }
}

export async function retryAIItem(request: Request<{ itemId: string }>, response: Response, next: NextFunction) {
    try {
        response.json({ fulfillment: await fulfillAIOrderItem(Number(request.params.itemId), adminId(request), undefined, undefined, undefined, AdminReviewAction.PRINTIFY_RETRIED) })
    } catch (error) { next(error) }
}

export async function syncAIItem(request: Request<{ itemId: string }>, response: Response, next: NextFunction) {
    try { response.json({ fulfillment: await synchronizeAIOrderItem(Number(request.params.itemId), adminId(request)) }) } catch (error) { next(error) }
}

export async function reviewAsset(request: Request<{ itemId: string; kind: 'artwork' | 'mockup' }>, response: Response, next: NextFunction) {
    try {
        const asset = await readAdminReviewAsset(Number(request.params.itemId), request.params.kind)
        response.setHeader('Content-Type', asset.mimeType)
        response.setHeader('Content-Disposition', `inline; filename="${asset.filename}"`)
        response.setHeader('Content-Length', String(asset.bytes.length))
        response.setHeader('Cache-Control', 'private, max-age=300')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.send(asset.bytes)
    } catch (error) { next(error) }
}

export async function reviewUpload(request: Request<{ itemId: string; uploadId: string }>, response: Response, next: NextFunction) {
    try {
        const asset = await readAdminReviewUpload(Number(request.params.itemId), Number(request.params.uploadId))
        response.setHeader('Content-Type', asset.mimeType)
        response.setHeader('Content-Disposition', `inline; filename="${asset.filename}"`)
        response.setHeader('Content-Length', String(asset.bytes.length))
        response.setHeader('Cache-Control', 'private, max-age=300')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.send(asset.bytes)
    } catch (error) { next(error) }
}

export async function userCredits(request: Request<{ userId: string }>, response: Response, next: NextFunction) {
    try { response.json(await getAdminUserCredits(Number(request.params.userId))) } catch (error) { next(error) }
}

export async function adjustCredits(
    request: Request<{ userId: string }, {}, { amount: number; reason: string }>,
    response: Response,
    next: NextFunction
) {
    try {
        response.status(201).json(await adjustUserCredits(adminId(request), Number(request.params.userId), request.body.amount, request.body.reason))
    } catch (error) { next(error) }
}

export async function syncPrintifyWebhooks(request: Request, response: Response, next: NextFunction) {
    try { response.json({ webhooks: await synchronizePrintifyWebhooks() }) } catch (error) { next(error) }
}

export async function customers(request: Request, response: Response, next: NextFunction) {
    try { response.json(await listAdminCustomers((request as any).validatedQuery ?? request.query)) } catch (error) { next(error) }
}

export async function customerDetails(request: Request<{ userId: string }>, response: Response, next: NextFunction) {
    try { response.json(await getAdminCustomer(Number(request.params.userId))) } catch (error) { next(error) }
}

export async function changeCustomerStatus(request: Request<{ userId: string }, {}, { status: UserStatus }>, response: Response, next: NextFunction) {
    try { response.json({ user: await updateAdminCustomerStatus(adminId(request), Number(request.params.userId), request.body.status) }) } catch (error) { next(error) }
}

export async function addCustomerNote(request: Request<{ userId: string }, {}, { note: string }>, response: Response, next: NextFunction) {
    try { response.status(201).json({ note: await addAdminCustomerNote(adminId(request), Number(request.params.userId), request.body.note) }) } catch (error) { next(error) }
}

export async function orders(request: Request, response: Response, next: NextFunction) {
    try { response.json(await listAdminOrders((request as any).validatedQuery ?? request.query)) } catch (error) { next(error) }
}

export async function orderDetails(request: Request<{ orderId: string }>, response: Response, next: NextFunction) {
    try { response.json({ order: await getAdminOrder(Number(request.params.orderId)) }) } catch (error) { next(error) }
}

export async function addOrderNote(request: Request<{ orderId: string }, {}, { note: string }>, response: Response, next: NextFunction) {
    try { response.status(201).json({ note: await addAdminOrderNote(adminId(request), Number(request.params.orderId), request.body.note) }) } catch (error) { next(error) }
}

export async function retryOrderFulfillment(request: Request<{ orderId: string }>, response: Response, next: NextFunction) {
    try { response.json({ fulfillment: await retryAdminOrderFulfillment(adminId(request), Number(request.params.orderId)) }) } catch (error) { next(error) }
}

export async function syncOrderFulfillment(request: Request<{ orderId: string }>, response: Response, next: NextFunction) {
    try { response.json({ fulfillment: await syncAdminOrderFulfillment(adminId(request), Number(request.params.orderId)) }) } catch (error) { next(error) }
}

export async function orderItemAsset(request: Request<{ orderId: string; itemId: string; kind: 'artwork' | 'approved-artwork' | 'mockup' }>, response: Response, next: NextFunction) {
    try {
        const asset = await readAdminOrderItemAsset(Number(request.params.orderId), Number(request.params.itemId), request.params.kind)
        response.setHeader('Content-Type', asset.mimeType)
        response.setHeader('Cache-Control', 'private, max-age=300')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.send(asset.bytes)
    } catch (error) { next(error) }
}

export async function products(request: Request, response: Response, next: NextFunction) {
    try { response.json({ products: await listAdminProducts({ refresh: true }) }) } catch (error) { next(error) }
}

export async function productDetails(request: Request<{ productId: string }>, response: Response, next: NextFunction) {
    try { response.json({ product: await getAdminProduct(Number(request.params.productId)) }) } catch (error) { next(error) }
}

export async function saveProduct(request: Request<{ productId: string }>, response: Response, next: NextFunction) {
    try { response.json({ product: await updateAdminProduct(Number(request.params.productId), request.body, adminId(request)) }) } catch (error) { next(error) }
}

export async function productDeletionPreview(request: Request<{ productId: string }>, response: Response, next: NextFunction) {
    try { response.json({ plan: await getAdminProductDeletionPlan(Number(request.params.productId)) }) } catch (error) { next(error) }
}

export async function removeProduct(
    request: Request<{ productId: string }, {}, { confirmation: string }>,
    response: Response,
    next: NextFunction
) {
    try {
        response.json(await deleteOrArchiveAdminProduct(Number(request.params.productId), adminId(request), request.body.confirmation))
    } catch (error) { next(error) }
}

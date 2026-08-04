import type { NextFunction, Request, Response } from 'express'
import { getStorefrontProduct, listStorefrontProducts, synchronizePhoneCaseCatalog } from '../../services/catalog'
import { readCatalogImage } from '../../services/catalog-media'

export async function getAllProducts(request: Request, response: Response, next: NextFunction) {
    try {
        const products = await listStorefrontProducts()
        response.json(products)
    } catch (e) {
        next(e)
    }
}

export async function getOneProduct(request: Request<{ productId: string }>, response: Response, next: NextFunction) {
    try {
        const product = await getStorefrontProduct(request.params.productId)
        response.json(product)
    } catch (e) {
        next(e)
    }
}

export async function getAIProducts(request: Request, response: Response, next: NextFunction) {
    try {
        response.json(await listStorefrontProducts({ aiOnly: true }))
    } catch (error) {
        next(error)
    }
}

export async function syncCatalog(request: Request, response: Response, next: NextFunction) {
    try {
        const result = await synchronizePhoneCaseCatalog()
        response.json({
            message: 'Production catalog synchronized.',
            data: result
        })
    } catch (error) {
        next(error)
    }
}

export async function getCatalogImage(request: Request<{ token: string }>, response: Response, next: NextFunction) {
    try {
        const image = await readCatalogImage(request.params.token)
        response.setHeader('Content-Type', image.contentType)
        response.setHeader('Cache-Control', 'public, max-age=86400, immutable')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.send(image.bytes)
    } catch (error) { next(error) }
}

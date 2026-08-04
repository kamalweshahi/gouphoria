import type { NextFunction, Request, Response } from 'express'
import { listStorefrontProducts } from '../../services/catalog'
import { buildRobotsTxt, buildSitemap } from '../../services/seo'

export async function getSitemap(request: Request, response: Response, next: NextFunction) {
    try {
        const products = await listStorefrontProducts({ refresh: false })
        response
            .status(200)
            .type('application/xml')
            .set('Cache-Control', 'public, max-age=3600')
            .send(buildSitemap(products.map(product => ({ id: product.id, updatedAt: product.updatedAt }))))
    } catch (error) {
        next(error)
    }
}

export function getRobotsTxt(request: Request, response: Response) {
    response
        .status(200)
        .type('text/plain')
        .set('Cache-Control', 'public, max-age=3600')
        .send(buildRobotsTxt())
}

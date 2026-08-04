import { createHash } from 'crypto'
import axios from 'axios'
import { Product } from '../database/models/product'
import { ProductVariant } from '../database/models/product-variant'
import HttpError from '../errors/http-error'

function isPrivateProductionImage(value: string) {
    try {
        const hostname = new URL(value).hostname.toLowerCase()
        return hostname === 'printify.com' || hostname.endsWith('.printify.com')
    } catch { return false }
}

export function customerCatalogImageUrl(value?: string) {
    if (!value || !isPrivateProductionImage(value)) return value
    const token = createHash('sha256').update(value).digest('hex')
    return `/products/assets/${token}`
}

function productImageUrls(product: Product) {
    const embedded = (product.images ?? []).flatMap(image => {
        const src = (image as { src?: unknown }).src
        return typeof src === 'string' ? [src] : []
    })
    return [product.storefrontImage, product.thumbnailUrl, ...embedded].filter((value): value is string => Boolean(value))
}

export async function readCatalogImage(token: string) {
    const [products, variants] = await Promise.all([
        Product.findAll({ attributes: ['storefrontImage', 'thumbnailUrl', 'images'] }),
        ProductVariant.findAll({ attributes: ['imageUrl'] })
    ])
    const candidates = [
        ...products.flatMap(productImageUrls),
        ...variants.flatMap(variant => variant.imageUrl ? [variant.imageUrl] : [])
    ]
    const source = candidates.find(value => isPrivateProductionImage(value) && createHash('sha256').update(value).digest('hex') === token)
    if (!source) throw new HttpError(404, 'Catalog image not found.')
    const result = await axios.get<ArrayBuffer>(source, {
        responseType: 'arraybuffer',
        timeout: 12_000,
        maxContentLength: 12 * 1024 * 1024,
        maxBodyLength: 12 * 1024 * 1024,
        validateStatus: status => status === 200
    })
    const contentType = String(result.headers['content-type'] ?? '').split(';')[0].toLowerCase()
    if (!contentType.startsWith('image/')) throw new HttpError(502, 'Catalog image is temporarily unavailable.')
    return { bytes: Buffer.from(result.data), contentType }
}

import axios from 'axios'
import HttpError from '../errors/http-error'

const PRINTIFY_BASE_URL = 'https://api.printify.com/v1'
const PHONE_MODEL_PATTERN = /\b(iphone|samsung\s+galaxy|google\s+pixel)\b/i

export interface RawPrintifyImage {
    src?: string
    variant_ids?: Array<number | string>
    position?: string
    is_default?: boolean
    [key: string]: unknown
}

export interface RawPrintifyVariant {
    id: number | string
    title?: string
    price?: number
    is_enabled?: boolean
    is_available?: boolean
    sku?: string
    options?: Array<number | string>
    cost?: number
    [key: string]: unknown
}

export interface RawPrintifyProduct {
    id: string
    title?: string
    description?: string
    images?: RawPrintifyImage[]
    variants?: RawPrintifyVariant[]
    tags?: string[]
    visible?: boolean
    blueprint_id?: number | string
    print_provider_id?: number | string
    created_at?: string
    updated_at?: string
    [key: string]: unknown
}

export interface PrintifyVariant {
    id: string
    printifyVariantId: string
    title: string
    phoneModel: string
    caseType: string
    priceCents: number
    price: number
    currency: string
    available: boolean
    isEnabled: boolean
    image?: string
    sku?: string
    metadata: {
        options: Array<number | string>
        cost?: number
        rawTitle: string
    }
}

export interface PrintifyProduct {
    id: string
    printifyProductId: string
    title: string
    description: string
    image?: string
    images: RawPrintifyImage[]
    price: number | null
    currency: string
    variantsCount: number
    variants: PrintifyVariant[]
    phoneModels: string[]
    caseTypes: string[]
    visible: boolean
    tags: string[]
    blueprintId?: string
    printProviderId?: string
    createdAt?: string
    updatedAt?: string
}

function getPrintifyConfig() {
    const apiKey = process.env.PRINTIFY_API_KEY
    const shopId = process.env.PRINTIFY_SHOP_ID

    if (!apiKey || !shopId) {
        const error: any = new Error('Printify API is not configured. Please set PRINTIFY_API_KEY and PRINTIFY_SHOP_ID in backend environment variables.')
        error.status = 500
        throw error
    }

    return { apiKey, shopId }
}

export function getPrintifyShopId() {
    return getPrintifyConfig().shopId
}

function printifyClient() {
    const { apiKey } = getPrintifyConfig()
    return axios.create({
        baseURL: PRINTIFY_BASE_URL,
        timeout: Number(process.env.PRINTIFY_TIMEOUT_MS ?? 15000),
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    })
}

function cleanText(value: string | undefined) {
    return (value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function uniqueNormalized(values: string[]) {
    const unique = new Map<string, string>()
    for (const value of values) {
        const key = value.toLowerCase().replace(/[^a-z0-9]+/g, '')
        if (key && !unique.has(key)) unique.set(key, value)
    }
    return [...unique.values()]
}

function titleCase(value: string) {
    return value
        .toLowerCase()
        .replace(/\b\w/g, letter => letter.toUpperCase())
        .replace(/\bMagsafe\b/g, 'MagSafe')
        .replace(/\bIphone\b/g, 'iPhone')
}

export function normalizePhoneModel(value: string) {
    return cleanText(value)
        .replace(/\s*\/\s*/g, ' / ')
        .replace(/\s*,\s*/g, ', ')
        .replace(/\biphone\b/ig, 'iPhone')
        .replace(/\bsamsung\s+galaxy\b/ig, 'Samsung Galaxy')
        .replace(/\bgoogle\s+pixel\b/ig, 'Google Pixel')
        .replace(/\bpro\s+max\b/ig, 'Pro Max')
        .replace(/\bpro\b/ig, 'Pro')
        .replace(/\bplus\b/ig, 'Plus')
        .replace(/(\d)se\b/ig, '$1SE')
        .replace(/\bse\b/ig, 'SE')
        .replace(/\s+/g, ' ')
        .trim()
}

function variantTitleParts(variantTitle: string) {
    const parts = cleanText(variantTitle).split(/\s+\/\s+/).map(part => part.trim()).filter(Boolean)
    return {
        phoneModel: parts[0] ?? '',
        variantCaseType: parts.slice(1).join(' / ')
    }
}

function caseTypeFromProduct(product: RawPrintifyProduct) {
    const ignored = /\b(gift|custom|design|stylish|unique|trendy|cute|accessor|lover|fashion)\b/i
    const candidates = (product.tags ?? [])
        .map(cleanText)
        .filter(tag => /\bcase(s)?\b/i.test(tag) && !ignored.test(tag))
        .sort((a, b) => b.split(' ').length - a.split(' ').length || b.length - a.length)

    return candidates[0] || 'Phone Case'
}

export function normalizeCaseType(value: string, product?: RawPrintifyProduct) {
    const source = cleanText(value) || (product ? caseTypeFromProduct(product) : '')
    return titleCase(source.replace(/\bcases\b/ig, 'case'))
}

export function isPhoneCaseProduct(product: RawPrintifyProduct) {
    const searchable = [product.title, ...(product.tags ?? [])].filter(Boolean).join(' ')
    const hasCaseMetadata = /\b(phone|mobile|magnetic|tough)\b[^,]{0,30}\b(case|cover)s?\b/i.test(searchable)
        || /\b(case|cover)s?\b[^,]{0,30}\b(phone|mobile)\b/i.test(searchable)
    const hasPhoneVariant = (product.variants ?? []).some(variant => PHONE_MODEL_PATTERN.test(variant.title ?? ''))
    return hasCaseMetadata && hasPhoneVariant
}

function imageForVariant(product: RawPrintifyProduct, variantId: string) {
    const images = product.images ?? []
    const matching = images.filter(image => (image.variant_ids ?? []).some(id => String(id) === variantId))
    return matching.find(image => image.is_default)?.src
        || matching[0]?.src
        || images.find(image => image.is_default)?.src
        || images[0]?.src
}

export function mapPrintifyVariant(product: RawPrintifyProduct, variant: RawPrintifyVariant): PrintifyVariant | undefined {
    const rawTitle = cleanText(variant.title)
    const parts = variantTitleParts(rawTitle)
    if (!PHONE_MODEL_PATTERN.test(parts.phoneModel)) return undefined

    const priceCents = variant.price
    if (!Number.isSafeInteger(priceCents) || priceCents < 0) return undefined
    const price = priceCents / 100

    const id = String(variant.id)
    return {
        id,
        printifyVariantId: id,
        title: rawTitle,
        phoneModel: normalizePhoneModel(parts.phoneModel),
        caseType: normalizeCaseType(parts.variantCaseType, product),
        priceCents,
        price,
        currency: 'USD',
        available: variant.is_available !== false,
        isEnabled: variant.is_enabled === true,
        image: imageForVariant(product, id),
        sku: variant.sku,
        metadata: {
            options: variant.options ?? [],
            cost: variant.cost,
            rawTitle
        }
    }
}

export function mapPrintifyProduct(product: RawPrintifyProduct, options: { includeDisabled?: boolean } = {}): PrintifyProduct {
    const mappedVariants = (product.variants ?? [])
        .map(variant => mapPrintifyVariant(product, variant))
        .filter((variant): variant is PrintifyVariant => Boolean(variant))
        .filter(variant => options.includeDisabled || variant.isEnabled)
    const availableVariants = mappedVariants.filter(variant => variant.isEnabled && variant.available)
    const prices = availableVariants.map(variant => variant.price)
    const images = product.images ?? []

    return {
        id: product.id,
        printifyProductId: product.id,
        title: cleanText(product.title),
        description: product.description?.replace(/<[^>]+>/g, '') ?? '',
        image: images.find(image => image.is_default)?.src || images[0]?.src,
        images,
        price: prices.length ? Math.min(...prices) : null,
        currency: 'USD',
        variantsCount: mappedVariants.length,
        variants: mappedVariants,
        phoneModels: uniqueNormalized(mappedVariants.map(variant => variant.phoneModel)),
        caseTypes: uniqueNormalized(mappedVariants.map(variant => variant.caseType)),
        visible: product.visible === true,
        tags: product.tags ?? [],
        blueprintId: product.blueprint_id === undefined ? undefined : String(product.blueprint_id),
        printProviderId: product.print_provider_id === undefined ? undefined : String(product.print_provider_id),
        createdAt: product.created_at,
        updatedAt: product.updated_at
    }
}

export function filterPhoneCaseProducts(products: RawPrintifyProduct[]) {
    return products
        .filter(isPhoneCaseProduct)
        .map(product => mapPrintifyProduct(product))
        .filter(product => product.visible && product.variants.some(variant => variant.isEnabled))
}

export async function getRawPrintifyProducts() {
    const { shopId } = getPrintifyConfig()
    const client = printifyClient()
    const firstResponse = await client.get(`/shops/${shopId}/products.json`, { params: { limit: 50, page: 1 } })
    const products: RawPrintifyProduct[] = firstResponse.data?.data ?? []
    const lastPage = Number(firstResponse.data?.last_page ?? 1)

    for (let page = 2; page <= lastPage; page += 1) {
        const response = await client.get(`/shops/${shopId}/products.json`, { params: { limit: 50, page } })
        products.push(...(response.data?.data ?? []))
    }
    return products
}

export async function getRawPrintifyProduct(productId: string) {
    const { shopId } = getPrintifyConfig()
    const response = await printifyClient().get(`/shops/${shopId}/products/${encodeURIComponent(productId)}.json`)
    return response.data as RawPrintifyProduct
}

export async function getPrintifyProducts() {
    return filterPhoneCaseProducts(await getRawPrintifyProducts())
}

export async function getPrintifyProduct(productId: string) {
    const rawProduct = await getRawPrintifyProduct(productId)
    if (!isPhoneCaseProduct(rawProduct)) {
        throw new HttpError(404, 'This product is not a supported phone case.')
    }

    const product = mapPrintifyProduct(rawProduct)
    if (!product.visible || !product.variants.length) {
        throw new HttpError(404, 'This phone case is not currently available.')
    }
    return product
}

export function selectPrintifyVariant(rawProduct: RawPrintifyProduct, variantId: string) {
    if (!isPhoneCaseProduct(rawProduct)) {
        throw new HttpError(404, 'This product is not a supported phone case.')
    }

    const rawVariant = (rawProduct.variants ?? []).find(variant => String(variant.id) === String(variantId))
    if (!rawVariant) throw new HttpError(400, 'The selected variant does not belong to this product.')

    const variant = mapPrintifyVariant(rawProduct, rawVariant)
    if (!variant) throw new HttpError(400, 'The selected variant is not a supported phone case option.')
    if (!variant.isEnabled) throw new HttpError(409, 'The selected phone case option is disabled.')
    if (!variant.available) throw new HttpError(409, 'The selected phone case option is currently unavailable.')

    return { product: mapPrintifyProduct(rawProduct), variant }
}

export async function getPrintifyVariant(productId: string, variantId: string) {
    return selectPrintifyVariant(await getRawPrintifyProduct(productId), variantId)
}

export interface PrintifyOrderPayload {
    external_id: string
    label: string
    line_items: Array<{
        product_id?: string
        print_provider_id?: number
        blueprint_id?: number
        variant_id: number
        quantity: number
        external_id: string
        print_areas?: {
            front: string | Array<{ src: string; scale?: number; x?: number; y?: number; angle?: number }>
        }
        print_details?: { print_on_side?: 'mirror' | 'regular' }
    }>
    shipping_method: number
    send_shipping_notification: boolean
    address_to: {
        first_name: string
        last_name: string
        email: string
        phone: string
        country: string
        region?: string
        address1: string
        address2?: string
        city: string
        zip: string
    }
}

export type PrintifyShippingPayload = Pick<PrintifyOrderPayload, 'line_items' | 'address_to'>

export async function calculatePrintifyShipping(payload: PrintifyShippingPayload) {
    const { shopId } = getPrintifyConfig()
    const response = await printifyClient().post(`/shops/${shopId}/orders/shipping.json`, payload)
    return response.data as Record<string, unknown>
}

export async function getPrintifyWebhooks() {
    const { shopId } = getPrintifyConfig()
    const response = await printifyClient().get(`/shops/${shopId}/webhooks.json`)
    return response.data as Array<{ id: string; topic: string; url: string; shop_id: string | number }>
}

export async function createPrintifyWebhook(topic: string, url: string, secret: string) {
    const { shopId } = getPrintifyConfig()
    const response = await printifyClient().post(`/shops/${shopId}/webhooks.json`, { topic, url, secret })
    return response.data
}

export async function uploadPrintifyImage(fileName: string, contents: Buffer) {
    const response = await printifyClient().post('/uploads/images.json', {
        file_name: fileName,
        contents: contents.toString('base64')
    })
    return response.data
}

export async function createPrintifyOrder(payload: PrintifyOrderPayload) {
    const { shopId } = getPrintifyConfig()
    const response = await printifyClient().post(`/shops/${shopId}/orders.json`, payload)
    return response.data
}

export async function getPrintifyOrder(orderId: string) {
    const { shopId } = getPrintifyConfig()
    const response = await printifyClient().get(`/shops/${shopId}/orders/${encodeURIComponent(orderId)}.json`)
    return response.data
}

export async function getPrintifyOrders(page = 1, limit = 10) {
    const { shopId } = getPrintifyConfig()
    const response = await printifyClient().get(`/shops/${shopId}/orders.json`, {
        params: {
            page: Math.max(1, Math.trunc(page)),
            limit: Math.min(10, Math.max(1, Math.trunc(limit)))
        }
    })
    return response.data as {
        data?: any[]
        current_page?: number
        last_page?: number
    }
}

function printifyOrderExternalReferences(order: any) {
    const references = new Set<string>()
    const add = (value: unknown) => {
        const normalized = String(value ?? '').trim()
        if (normalized) references.add(normalized)
    }
    add(order?.external_id)
    add(order?.app_order_id)
    add(order?.label)
    add(order?.metadata?.shop_order_label)
    for (const item of order?.line_items ?? []) {
        add(item?.external_id)
        add(item?.metadata?.external_id)
    }
    return references
}

/**
 * Reconciles an interrupted create-order request using the immutable local
 * references already sent to Printify. The scan is intentionally bounded.
 */
export async function findPrintifyOrderByExternalReference(
    externalId: string,
    lineItemExternalIds: string[] = []
) {
    const wanted = new Set([externalId, ...lineItemExternalIds].map(value => String(value).trim()).filter(Boolean))
    const maxPages = Math.min(20, Math.max(1, Number(process.env.PRINTIFY_RECONCILIATION_PAGES ?? 5)))
    for (let page = 1; page <= maxPages; page += 1) {
        const response = await getPrintifyOrders(page, 10)
        const orders = Array.isArray(response?.data) ? response.data : []
        const match = orders.find(order => {
            const references = printifyOrderExternalReferences(order)
            return [...wanted].some(reference => references.has(reference))
        })
        if (match) return match
        const lastPage = Number(response?.last_page ?? page)
        if (!orders.length || page >= lastPage) break
    }
    return undefined
}

export async function sendPrintifyOrderToProduction(orderId: string) {
    const { shopId } = getPrintifyConfig()
    const response = await printifyClient().post(`/shops/${shopId}/orders/${encodeURIComponent(orderId)}/send_to_production.json`, {})
    return response.data
}

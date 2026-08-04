import axios from 'axios'
import type Product from '../models/Product'
import type ShippingAddress from '../models/ShippingAddress'
import { configureSessionAwareClient } from './session-aware-client'
import { customerAssetUrl } from './assets'

const baseUrl = import.meta.env.VITE_REST_SERVER_URL || 'http://localhost:3000'
const storeClient = axios.create({ baseURL: baseUrl, withCredentials: true })
configureSessionAwareClient(storeClient)
const catalogCacheDurationMs = 60_000
let catalogCache: { products: Product[]; expiresAt: number } | null = null
let catalogRequest: Promise<Product[]> | null = null

function customerProduct(product: Product): Product {
    return {
        ...product,
        image: customerAssetUrl(product.image),
        storefrontImage: customerAssetUrl(product.storefrontImage),
        images: product.images?.map(image => ({ ...image, src: customerAssetUrl(image.src) })),
        variants: product.variants.map(variant => ({ ...variant, image: customerAssetUrl(variant.image) }))
    }
}

export interface PayPalCapture {
    id?: string
    status: string
    orderId: number
    orderNumber: string
    paymentStatus: string
    total: number
    totalCents: number
    currency: string
    recoverable?: boolean
    pendingApproval?: boolean
    recovered?: boolean
    idempotent?: boolean
    [key: string]: unknown
}

export async function getAllProducts(): Promise<Product[]> {
    if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.products
    if (catalogRequest) return catalogRequest

    catalogRequest = storeClient.get<Product[]>('/products').then(response => {
        const products = response.data.map(customerProduct)
        catalogCache = { products, expiresAt: Date.now() + catalogCacheDurationMs }
        return products
    }).finally(() => {
        catalogRequest = null
    })
    return catalogRequest
}

export async function getOneProduct(productId: string): Promise<Product> {
    const response = await storeClient.get<Product>(`/products/${productId}`)
    return customerProduct(response.data)
}

export async function getAIProducts(): Promise<Product[]> {
    const response = await storeClient.get<Product[]>('/products/ai-customizable')
    return response.data.map(customerProduct)
}

export function clearCatalogCache() {
    catalogCache = null
    catalogRequest = null
}


export async function getPayPalClientId(): Promise<string> {
    const response = await storeClient.get<{ clientId: string }>('/payments/paypal/client-id')
    return response.data.clientId
}

export async function createPayPalOrder(input: { productId: string; variantId: string; shippingAddress: ShippingAddress; shippingQuoteId: string; shippingOptionId: string; quantity?: number } | { orderId: number }) {
    const response = await storeClient.post<{ id: string; orderId: number; orderNumber: string }>('/payments/paypal/create-order', input)
    return response.data
}

export async function capturePayPalOrder(providerOrderId: string, orderId: number): Promise<PayPalCapture> {
    const response = await storeClient.post<PayPalCapture>(`/payments/paypal/${providerOrderId}/capture`, { orderId })
    return response.data
}

export async function recoverPayPalOrder(providerOrderId: string, orderId: number): Promise<PayPalCapture> {
    const response = await storeClient.post<PayPalCapture>(`/payments/paypal/${providerOrderId}/recover`, { orderId })
    return response.data
}

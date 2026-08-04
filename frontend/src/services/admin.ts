import axios from 'axios'
import type { AdminDashboardData, AdminReview } from '../models/AdminReview'
import type { AdminUserCredits } from '../models/Credits'
import type { AdminCustomer, AdminCustomerDetails, AdminOrderDetails, AdminOrderSummary, AdminProduct, AdminProductDeletionPlan, Pagination } from '../models/AdminManagement'
import { clearCatalogCache } from './products'
import { customerAssetUrl } from './assets'
import { configureSessionAwareClient } from './session-aware-client'

const baseUrl = import.meta.env.VITE_REST_SERVER_URL || 'http://localhost:3000'
const api = axios.create({ baseURL: baseUrl, withCredentials: true })
configureSessionAwareClient(api)

export async function getAdminDashboard() {
    const response = await api.get<{ dashboard: AdminDashboardData }>('/admin/dashboard')
    return response.data.dashboard
}

export async function getAdminReviews(params: Record<string, string | number | undefined> = {}) {
    const response = await api.get<{ reviews: AdminReview[]; pagination: Pagination }>('/admin/ai-reviews', { params })
    return response.data
}

export async function getAdminReview(itemId: number) {
    const response = await api.get<{ review: AdminReview }>(`/admin/ai-reviews/${itemId}`)
    return response.data.review
}

export async function decideAdminReview(itemId: number, input: { decision: 'approve' | 'reject' | 'changes_requested'; note?: string; internalNote?: string }) {
    const response = await api.post<{ review: AdminReview }>(`/admin/ai-reviews/${itemId}/decision`, input)
    return response.data.review
}

export async function retryAdminFulfillment(itemId: number) {
    await api.post(`/admin/ai-reviews/${itemId}/fulfillment/retry`)
    return getAdminReview(itemId)
}

export async function syncAdminFulfillment(itemId: number) {
    await api.post(`/admin/ai-reviews/${itemId}/fulfillment/sync`)
    return getAdminReview(itemId)
}

export async function getAdminUserCredits(userId: number) {
    const response = await api.get<AdminUserCredits>(`/admin/credits/users/${userId}`)
    return response.data
}

export async function adjustAdminCredits(userId: number, amount: number, reason: string) {
    const response = await api.post<{ balance: number }>(`/admin/credits/users/${userId}/adjustments`, { amount, reason })
    return response.data
}

export function adminAssetUrl(path?: string) {
    return customerAssetUrl(path)
}

export function normalizeAdminAssetEndpoint(value: string) {
    let path = value.trim()
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname
    path = path.replace(/^\/admin\/reviews\//, '/admin/ai-reviews/')
    if (!path.startsWith('/admin/ai-reviews/') && !path.startsWith('/admin/orders/')) {
        throw new Error('Invalid protected admin media endpoint.')
    }
    return path
}

export async function getAdminAssetBlob(endpoint: string) {
    const response = await api.get<Blob>(normalizeAdminAssetEndpoint(endpoint), { responseType: 'blob' })
    return response.data
}

function normalizeAdminProduct(product: AdminProduct): AdminProduct {
    return {
        ...product,
        image: customerAssetUrl(product.image),
        storefrontImage: customerAssetUrl(product.storefrontImage),
        printifyImage: customerAssetUrl(product.printifyImage),
        images: product.images?.map(image => ({ ...image, src: customerAssetUrl(image.src) })),
        variants: product.variants.map(variant => ({ ...variant, image: customerAssetUrl(variant.image) }))
    }
}

export function adminErrorMessage(error: unknown, fallback: string) {
    if (!axios.isAxiosError<{ message?: string }>(error)) return fallback
    return error.response?.data?.message || fallback
}

export async function getAdminCustomers(params: Record<string, string | number | undefined>) {
    const response = await api.get<{ customers: AdminCustomer[]; pagination: Pagination }>('/admin/customers', { params })
    return response.data
}
export async function getAdminCustomer(userId: number) {
    const response = await api.get<AdminCustomerDetails>(`/admin/customers/${userId}`)
    return response.data
}
export async function setAdminCustomerStatus(userId: number, status: string) {
    await api.patch(`/admin/customers/${userId}/status`, { status })
    return getAdminCustomer(userId)
}
export async function addAdminCustomerNote(userId: number, note: string) {
    await api.post(`/admin/customers/${userId}/notes`, { note })
    return getAdminCustomer(userId)
}
export async function getAdminOrders(params: Record<string, string | number | undefined>) {
    const response = await api.get<{ orders: AdminOrderSummary[]; pagination: Pagination }>('/admin/orders', { params })
    return response.data
}
export async function getAdminOrder(orderId: number) {
    const response = await api.get<{ order: AdminOrderDetails }>(`/admin/orders/${orderId}`)
    return response.data.order
}
export async function retryAdminOrder(orderId: number) { await api.post(`/admin/orders/${orderId}/fulfillment/retry`); return getAdminOrder(orderId) }
export async function syncAdminOrder(orderId: number) { await api.post(`/admin/orders/${orderId}/fulfillment/sync`); return getAdminOrder(orderId) }
export async function addAdminOrderNote(orderId: number, note: string) { await api.post(`/admin/orders/${orderId}/notes`, { note }); return getAdminOrder(orderId) }
export async function getAdminProducts() {
    const response = await api.get<{ products: AdminProduct[] }>('/admin/products')
    return response.data.products.map(normalizeAdminProduct)
}
export async function updateAdminProduct(productId: number, input: object) {
    const response = await api.put<{ product: AdminProduct }>(`/admin/products/${productId}`, input)
    clearCatalogCache()
    return normalizeAdminProduct(response.data.product)
}
export async function syncAdminCatalog() {
    const response = await api.post<{ message: string; data: object }>('/products/sync')
    clearCatalogCache()
    return response.data
}
export async function getAdminProductDeletionPlan(productId: number) {
    const response = await api.get<{ plan: AdminProductDeletionPlan }>(`/admin/products/${productId}/deletion-preview`)
    return response.data.plan
}
export async function deleteAdminProduct(productId: number, confirmation: string) {
    const response = await api.delete<{ success: true; action: 'deleted' | 'archived'; reason?: string; alreadyProcessed?: boolean; historyPreserved?: boolean }>(`/admin/products/${productId}`, { data: { confirmation } })
    clearCatalogCache()
    return response.data
}

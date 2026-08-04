import axios from 'axios'
import type { CreditHistory, CreditPackage, CreditPurchase } from '../models/Credits'
import { configureSessionAwareClient } from './session-aware-client'

const api = axios.create({
    baseURL: import.meta.env.VITE_REST_SERVER_URL || 'http://localhost:3000',
    withCredentials: true
})
configureSessionAwareClient(api)

export async function getCreditPackages() {
    const response = await api.get<{ packages: CreditPackage[] }>('/credits/packages')
    return response.data.packages
}

export async function getCreditHistory() {
    const response = await api.get<CreditHistory>('/credits/history')
    return response.data
}

export async function createCreditPurchase(packageId: string, idempotencyKey: string) {
    const response = await api.post<{ purchase: CreditPurchase }>('/credits/purchases', { packageId, idempotencyKey })
    return response.data.purchase
}

export async function captureCreditPurchase(purchaseId: number, paypalOrderId: string) {
    const response = await api.post<{ purchase: CreditPurchase; balance: number; idempotent: boolean }>(`/credits/purchases/${purchaseId}/capture`, { paypalOrderId })
    return response.data
}

export async function cancelCreditPurchase(purchaseId: number, paypalOrderId?: string) {
    const response = await api.post<{ purchase: CreditPurchase }>(`/credits/purchases/${purchaseId}/cancel`, { paypalOrderId })
    return response.data.purchase
}

export function creditErrorMessage(error: unknown, fallback: string) {
    if (!axios.isAxiosError<{ message?: string }>(error)) return fallback
    return error.response?.data?.message || fallback
}

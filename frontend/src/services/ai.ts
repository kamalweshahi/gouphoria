import axios from 'axios'
import type AIDesign from '../models/AIDesign'
import { configureSessionAwareClient } from './session-aware-client'

const baseUrl = import.meta.env.VITE_REST_SERVER_URL || 'http://localhost:3000'
const aiClient = axios.create({ baseURL: baseUrl, withCredentials: true })
configureSessionAwareClient(aiClient)

export interface CreateAIDesignInput {
    productId: string
    variantId: string
    prompt: string
    ownershipConfirmed: boolean
}

export async function createAIDesign(input: CreateAIDesignInput) {
    const response = await aiClient.post<{ design: AIDesign }>('/ai/designs', input)
    return response.data.design
}

export async function uploadAIDesignImages(designId: number, files: File[]) {
    const form = new FormData()
    files.forEach(file => form.append('images', file))
    const response = await aiClient.post<{ design: AIDesign }>(`/ai/designs/${designId}/uploads`, form)
    return response.data.design
}

export async function generateAIDesign(designId: number, idempotencyKey: string) {
    const response = await aiClient.post<{ design: AIDesign; credits: { balance: number }; idempotent: boolean }>(
        `/ai/designs/${designId}/generate`,
        { idempotencyKey }
    )
    return response.data
}

export async function reviseAIDesign(designId: number, instructions: string, idempotencyKey: string) {
    const response = await aiClient.post<{ design: AIDesign; credits: { balance: number }; idempotent: boolean }>(
        `/ai/designs/${designId}/revise`,
        { instructions, idempotencyKey }
    )
    return response.data
}

export async function approveAIDesign(designId: number) {
    const response = await aiClient.post<{ design: AIDesign }>(`/ai/designs/${designId}/approve`)
    return response.data.design
}

export async function changeAIDesignVariant(designId: number, productId: string, variantId: string) {
    const response = await aiClient.patch<{ design: AIDesign; credits: { balance: number }; creditConsumed: false }>(
        `/ai/designs/${designId}/variant`,
        { productId, variantId }
    )
    return response.data
}

export async function getMyDesigns() {
    const response = await aiClient.get<{ designs: AIDesign[]; credits: { balance: number } }>('/ai/designs')
    return response.data
}

export async function getAIDesign(designId: number) {
    const response = await aiClient.get<{ design: AIDesign }>(`/ai/designs/${designId}`)
    return response.data.design
}

export function aiAssetUrl(path?: string) {
    if (!path) return undefined
    return `${baseUrl}${path}`
}

export function aiErrorMessage(error: unknown, fallback: string) {
    if (!axios.isAxiosError<{ message?: string }>(error)) return fallback
    return error.response?.data?.message || fallback
}

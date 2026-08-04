import axios from 'axios'
import type AuthUser from '../models/AuthUser'
import { configureSessionAwareClient } from './session-aware-client'

const authClient = axios.create({
    baseURL: import.meta.env.VITE_REST_SERVER_URL || 'http://localhost:3000',
    withCredentials: true
})
configureSessionAwareClient(authClient)

interface AuthResponse {
    user: AuthUser
}

export interface RegisterInput {
    name: string
    email: string
    password: string
    confirmPassword: string
}

export interface LoginInput {
    email: string
    password: string
}

export async function registerUser(input: RegisterInput) {
    const response = await authClient.post<AuthResponse>('/auth/register', input)
    return response.data.user
}

export async function loginUser(input: LoginInput) {
    const response = await authClient.post<AuthResponse>('/auth/login', input)
    return response.data.user
}

export async function logoutUser() {
    await authClient.post('/auth/logout')
}

export async function getCurrentUser() {
    const response = await authClient.get<AuthResponse>('/auth/me')
    return response.data.user
}

export function isInvalidSessionError(error: unknown) {
    return axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)
}

export function authErrorMessage(error: unknown, fallback: string) {
    if (!axios.isAxiosError<{ message?: string }>(error)) return fallback
    return error.response?.data?.message || fallback
}

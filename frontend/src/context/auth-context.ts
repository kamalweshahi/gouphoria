import { createContext } from 'react'
import type AuthUser from '../models/AuthUser'
import type { LoginInput, RegisterInput } from '../services/auth'

export interface AuthContextValue {
    user: AuthUser | null
    loading: boolean
    restorationError: string | null
    sessionVersion: number
    register: (input: RegisterInput) => Promise<void>
    login: (input: LoginInput) => Promise<void>
    logout: () => Promise<void>
    refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

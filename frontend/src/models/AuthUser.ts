export type UserRole = 'user' | 'admin'

export default interface AuthUser {
    id: number
    name: string
    email: string
    role: UserRole
    status: string
    credits: {
        balance: number
        freeProjectAvailable: boolean
    }
    createdAt: string
    lastLoginAt?: string
}

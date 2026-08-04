import { User } from '../database/models/user'
import { UserSession } from '../database/models/user-session'

declare global {
    namespace Express {
        interface Request {
            authUser?: User
            authSession?: UserSession
        }
    }
}

export interface PublicUser {
    id: number
    name: string
    email: string
    role: string
    status: string
    credits: {
        balance: number
        freeProjectAvailable: boolean
    }
    createdAt: Date
    lastLoginAt?: Date
}

import { createHash, randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { Op, UniqueConstraintError } from 'sequelize'
import { CreditAccount } from '../database/models/credit-account'
import { CreditTransaction } from '../database/models/credit-transaction'
import { CreditTransactionReason, UserStatus } from '../database/models/model-enums'
import { User } from '../database/models/user'
import { UserSession } from '../database/models/user-session'
import { getDatabase } from '../database/database'
import HttpError from '../errors/http-error'
import type { PublicUser } from '../types/auth'

export const SESSION_COOKIE_NAME = 'case_store_session'
export const FREE_AI_ALLOWANCE = 2

interface RegisterInput {
    name: string
    email: string
    password: string
}

interface LoginInput {
    email: string
    password: string
}

interface AuthResult {
    user: PublicUser
    sessionToken: string
    expiresAt: Date
}

function normalizeEmail(email: string) {
    return email.trim().toLowerCase()
}

function sessionTokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex')
}

function sessionDurationMs() {
    const days = Number(process.env.AUTH_SESSION_DAYS ?? 7)
    if (!Number.isFinite(days) || days <= 0 || days > 90) {
        throw new Error('AUTH_SESSION_DAYS must be between 1 and 90')
    }
    return days * 24 * 60 * 60 * 1000
}

async function createSession(userId: number, metadata?: { ipAddress?: string; userAgent?: string }) {
    const sessionToken = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + sessionDurationMs())

    await UserSession.destroy({
        where: {
            userId,
            expiresAt: { [Op.lt]: new Date() }
        }
    })

    await UserSession.create({
        userId,
        tokenHash: sessionTokenHash(sessionToken),
        expiresAt,
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent?.slice(0, 500)
    })

    return { sessionToken, expiresAt }
}

export function sessionCookieOptions(expiresAt?: Date) {
    const secure = process.env.NODE_ENV === 'production'
    const domain = process.env.AUTH_COOKIE_DOMAIN?.trim()
    return {
        httpOnly: true,
        secure,
        sameSite: 'lax' as const,
        path: '/',
        ...(domain ? { domain } : {}),
        ...(expiresAt ? { expires: expiresAt } : {})
    }
}

export function publicUser(user: User): PublicUser {
    const creditAccount = user.creditAccount
    return {
        id: Number(user.id),
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        credits: {
            balance: creditAccount?.balance ?? 0,
            freeProjectAvailable: !(creditAccount?.freeProjectUsed ?? false)
        },
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
    }
}

async function loadPublicUser(userId: number) {
    const user = await User.findByPk(userId, { include: [CreditAccount] })
    if (!user) throw new HttpError(404, 'User account not found.')
    return publicUser(user)
}

export async function registerUser(input: RegisterInput, metadata?: { ipAddress?: string; userAgent?: string }): Promise<AuthResult> {
    const database = getDatabase()
    const email = normalizeEmail(input.email)
    const passwordHash = await bcrypt.hash(input.password, Number(process.env.AUTH_BCRYPT_ROUNDS ?? 12))

    let userId: number
    try {
        userId = await database.transaction(async transaction => {
            const existing = await User.findOne({ where: { email }, transaction })
            if (existing) throw new HttpError(409, 'An account with this email already exists.')

            const user = await User.create({
                name: input.name.trim(),
                email,
                passwordHash
            }, { transaction })

            const creditAccount = await CreditAccount.create({
                userId: user.id,
                balance: FREE_AI_ALLOWANCE,
                freeProjectUsed: false
            }, { transaction })

            await CreditTransaction.create({
                creditAccountId: creditAccount.id,
                userId: user.id,
                amount: FREE_AI_ALLOWANCE,
                balanceBefore: 0,
                balanceAfter: FREE_AI_ALLOWANCE,
                reason: CreditTransactionReason.FREE_PROJECT,
                referenceId: `registration:${user.id}`,
                metadata: { description: 'Free AI project allowance' }
            }, { transaction })

            return Number(user.id)
        })
    } catch (error) {
        if (error instanceof UniqueConstraintError) {
            throw new HttpError(409, 'An account with this email already exists.')
        }
        throw error
    }

    const session = await createSession(userId, metadata)
    return {
        user: await loadPublicUser(userId),
        ...session
    }
}

export async function loginUser(input: LoginInput, metadata?: { ipAddress?: string; userAgent?: string }): Promise<AuthResult> {
    const user = await User.scope('withPassword').findOne({
        where: { email: normalizeEmail(input.email) },
        include: [CreditAccount]
    })

    const passwordMatches = user?.passwordHash
        ? await bcrypt.compare(input.password, user.passwordHash)
        : false

    if (!user || !passwordMatches) {
        throw new HttpError(401, 'Email or password is incorrect.')
    }
    if (user.status !== UserStatus.ACTIVE) {
        throw new HttpError(403, 'This account is not currently active.')
    }

    user.lastLoginAt = new Date()
    await user.save({ fields: ['lastLoginAt'] })

    const session = await createSession(Number(user.id), metadata)
    return {
        user: await loadPublicUser(Number(user.id)),
        ...session
    }
}

export async function authenticateSession(sessionToken: string) {
    const session = await UserSession.findOne({
        where: {
            tokenHash: sessionTokenHash(sessionToken),
            expiresAt: { [Op.gt]: new Date() }
        },
        include: [{ model: User, include: [CreditAccount] }]
    })

    if (!session?.user) return undefined
    if (session.user.status !== UserStatus.ACTIVE) {
        throw new HttpError(403, 'This account has been disabled. Contact support if you believe this is an error.', 'ACCOUNT_DISABLED')
    }
    if (session.revokedAt) return undefined
    return session
}

export async function revokeSession(sessionToken: string | undefined) {
    if (!sessionToken) return
    await UserSession.update(
        { revokedAt: new Date() },
        { where: { tokenHash: sessionTokenHash(sessionToken), revokedAt: null } }
    )
}

export async function getPublicUserById(userId: number) {
    return loadPublicUser(userId)
}

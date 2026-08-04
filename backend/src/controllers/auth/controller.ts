import type { NextFunction, Request, Response } from 'express'
import {
    getPublicUserById,
    loginUser,
    publicUser,
    registerUser,
    revokeSession,
    SESSION_COOKIE_NAME,
    sessionCookieOptions
} from '../../services/auth'
import HttpError from '../../errors/http-error'

interface RegisterBody {
    name: string
    email: string
    password: string
    confirmPassword: string
}

interface LoginBody {
    email: string
    password: string
}

function requestMetadata(request: Request) {
    return {
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
    }
}

export async function register(request: Request<{}, {}, RegisterBody>, response: Response, next: NextFunction) {
    try {
        const result = await registerUser(request.body, requestMetadata(request))
        response.cookie(SESSION_COOKIE_NAME, result.sessionToken, sessionCookieOptions(result.expiresAt))
        response.status(201).json({ user: result.user })
    } catch (error) {
        next(error)
    }
}

export async function login(request: Request<{}, {}, LoginBody>, response: Response, next: NextFunction) {
    try {
        const result = await loginUser(request.body, requestMetadata(request))
        response.cookie(SESSION_COOKIE_NAME, result.sessionToken, sessionCookieOptions(result.expiresAt))
        response.json({ user: result.user })
    } catch (error) {
        next(error)
    }
}

export async function logout(request: Request, response: Response, next: NextFunction) {
    try {
        await revokeSession(request.cookies?.[SESSION_COOKIE_NAME])
        response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions())
        response.status(204).send()
    } catch (error) {
        next(error)
    }
}

export function currentUser(request: Request, response: Response, next: NextFunction) {
    if (!request.authUser) return next(new HttpError(401, 'Please log in to continue.'))
    response.json({ user: publicUser(request.authUser) })
}

export async function getUserProfile(request: Request<{ userId: string }>, response: Response, next: NextFunction) {
    try {
        const user = await getPublicUserById(Number(request.params.userId))
        response.json({ user })
    } catch (error) {
        next(error)
    }
}

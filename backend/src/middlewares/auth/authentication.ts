import type { NextFunction, Request, Response } from 'express'
import { authenticateSession, SESSION_COOKIE_NAME, sessionCookieOptions } from '../../services/auth'
import HttpError from '../../errors/http-error'

export default async function requireAuthentication(request: Request, response: Response, next: NextFunction) {
    try {
        const sessionToken = request.cookies?.[SESSION_COOKIE_NAME]
        if (!sessionToken) throw new HttpError(401, 'Please log in to continue.')

        const session = await authenticateSession(sessionToken)
        if (!session?.user) throw new HttpError(401, 'Your session has expired. Please log in again.')

        request.authSession = session
        request.authUser = session.user
        next()
    } catch (error) {
        if (error instanceof HttpError && [401, 403].includes(error.status)) {
            response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions())
        }
        next(error)
    }
}

import type { NextFunction, Request, Response } from 'express'
import { UserRole } from '../../database/models/model-enums'
import HttpError from '../../errors/http-error'

export function authorizeRoles(...roles: UserRole[]) {
    return (request: Request, response: Response, next: NextFunction) => {
        if (!request.authUser) return next(new HttpError(401, 'Please log in to continue.'))
        if (!roles.includes(request.authUser.role)) {
            return next(new HttpError(403, 'You do not have permission to access this resource.'))
        }
        next()
    }
}

export function authorizeSelfOrRoles(paramName: string, ...roles: UserRole[]) {
    return (request: Request, response: Response, next: NextFunction) => {
        if (!request.authUser) return next(new HttpError(401, 'Please log in to continue.'))

        const requestedUserId = Number(request.params[paramName])
        const isSelf = Number(request.authUser.id) === requestedUserId
        const hasRole = roles.includes(request.authUser.role)
        if (!isSelf && !hasRole) {
            return next(new HttpError(403, 'You cannot access another user’s information.'))
        }
        next()
    }
}

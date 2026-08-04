import type { NextFunction, Request, Response } from "express";
import HttpError from '../errors/http-error'

export default function notFound(request: Request, response: Response, next: NextFunction) {
    next(new HttpError(404, 'The requested resource was not found.'))
}

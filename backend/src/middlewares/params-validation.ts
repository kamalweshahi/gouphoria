import type { NextFunction, Request, Response } from "express";
import { ObjectSchema } from "joi";
import HttpError from '../errors/http-error'

export default function paramsValidation(validator: ObjectSchema) {
    return async (request: Request, response: Response, next: NextFunction) => {
        try {
            // we push the validation result back into the request
            // because the validation may contain transformations 
            // (.e.g. uppercase)
            request.params = await validator.validateAsync(request.params)
            next()
        } catch (error: any) {
            next(new HttpError(422, error?.message || 'The requested identifier is invalid.'))
        }
    }    
}

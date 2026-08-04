import type { NextFunction, Request, Response } from "express";
import { ObjectSchema } from "joi";
import HttpError from '../errors/http-error'

export default function bodyValidation(validator: ObjectSchema, source: 'body' | 'query' = 'body') {
    return async (request: Request, response: Response, next: NextFunction) => {
        try {
            // we push the validation result back into the request
            // because the validation may contain transformations 
            // (.e.g. uppercase)
            const validated = await validator.validateAsync(source === 'query' ? request.query : request.body)
            if (source === 'query') (request as any).validatedQuery = validated
            else request.body = validated
            next()
        } catch (error: any) {
            next(new HttpError(422, error?.message || 'The submitted information is invalid.'))
        }
    }    
}

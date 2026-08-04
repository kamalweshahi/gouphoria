import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import HttpError from '../errors/http-error'
import { MAX_AI_UPLOADS } from '../services/ai-designs'
import { maxUploadBytes } from '../services/ai-images'

const uploader = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: maxUploadBytes(),
        files: MAX_AI_UPLOADS,
        fields: 2
    }
}).array('images', MAX_AI_UPLOADS)

export default function aiUpload(request: Request, response: Response, next: NextFunction) {
    uploader(request, response, error => {
        if (!error) return next()
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
            return next(new HttpError(413, `Each image must be ${process.env.AI_UPLOAD_MAX_MB ?? 8} MB or smaller.`))
        }
        if (error instanceof multer.MulterError && ['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(error.code)) {
            return next(new HttpError(422, `You may upload up to ${MAX_AI_UPLOADS} reference images per design.`))
        }
        next(new HttpError(422, 'The reference images could not be uploaded.'))
    })
}

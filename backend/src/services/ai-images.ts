import { createHash } from 'crypto'
import { basename, extname } from 'path'
import sharp from 'sharp'
import HttpError from '../errors/http-error'

export { createPhoneCaseMockup } from './mockup-templates'

export const SUPPORTED_UPLOAD_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export function maxUploadBytes() {
    const megabytes = Number(process.env.AI_UPLOAD_MAX_MB ?? 8)
    if (!Number.isFinite(megabytes) || megabytes < 1 || megabytes > 25) {
        throw new Error('AI_UPLOAD_MAX_MB must be between 1 and 25')
    }
    return Math.floor(megabytes * 1024 * 1024)
}

function uploadDimensionRules() {
    const minimum = Number(process.env.AI_UPLOAD_MIN_DIMENSION ?? 64)
    const maximum = Number(process.env.AI_UPLOAD_MAX_DIMENSION ?? 12000)
    const maxPixels = Number(process.env.AI_UPLOAD_MAX_PIXELS ?? 40000000)
    if (!Number.isInteger(minimum) || minimum < 1 || minimum > 2000) throw new Error('AI_UPLOAD_MIN_DIMENSION is invalid')
    if (!Number.isInteger(maximum) || maximum < minimum || maximum > 20000) throw new Error('AI_UPLOAD_MAX_DIMENSION is invalid')
    if (!Number.isInteger(maxPixels) || maxPixels < 1000000 || maxPixels > 100000000) throw new Error('AI_UPLOAD_MAX_PIXELS is invalid')
    return { minimum, maximum, maxPixels }
}

function detectedSignature(buffer: Buffer) {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return { mimeType: 'image/png', extension: 'png' }
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { mimeType: 'image/jpeg', extension: 'jpg' }
    }
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
        return { mimeType: 'image/webp', extension: 'webp' }
    }
    return undefined
}

function declaredExtension(filename: string) {
    const extension = extname(basename(filename)).toLowerCase().replace('.', '')
    return extension === 'jpeg' ? 'jpg' : extension
}

export async function validateUploadedImage(file: Express.Multer.File) {
    if (!file?.buffer?.length) throw new HttpError(422, 'Choose a valid image file.')
    if (file.size > maxUploadBytes()) throw new HttpError(413, `Each image must be ${process.env.AI_UPLOAD_MAX_MB ?? 8} MB or smaller.`)

    const signature = detectedSignature(file.buffer)
    if (!signature) throw new HttpError(422, 'Only valid PNG, JPG, JPEG, or WEBP images are supported.')
    const extension = declaredExtension(file.originalname)
    if (!['png', 'jpg', 'webp'].includes(extension)) {
        throw new HttpError(422, 'The image filename must end in PNG, JPG, JPEG, or WEBP.')
    }
    if (!SUPPORTED_UPLOAD_MIME_TYPES.includes(file.mimetype as any) || file.mimetype !== signature.mimeType || extension !== signature.extension) {
        throw new HttpError(422, 'The image type does not match its filename or file contents.')
    }

    const rules = uploadDimensionRules()
    let metadata: { width?: number; height?: number; pages?: number }
    try {
        metadata = await sharp(file.buffer, { failOn: 'error', limitInputPixels: rules.maxPixels, sequentialRead: true }).metadata()
    } catch {
        throw new HttpError(422, 'This image appears to be malformed or unreadable.')
    }
    if (!metadata.width || !metadata.height
        || metadata.width < rules.minimum || metadata.height < rules.minimum
        || metadata.width > rules.maximum || metadata.height > rules.maximum
        || metadata.width * metadata.height > rules.maxPixels) {
        throw new HttpError(422, 'This image has unsupported dimensions.')
    }
    if ((metadata.pages ?? 1) > 1) throw new HttpError(422, 'Animated images are not supported.')

    let sanitizedBytes: Buffer
    try {
        const image = sharp(file.buffer, { failOn: 'error', limitInputPixels: rules.maxPixels, sequentialRead: true }).rotate()
        sanitizedBytes = signature.extension === 'jpg'
            ? await image.jpeg({ quality: 95, mozjpeg: true }).toBuffer()
            : signature.extension === 'webp'
                ? await image.webp({ quality: 95 }).toBuffer()
                : await image.png({ compressionLevel: 9 }).toBuffer()
    } catch {
        throw new HttpError(422, 'This image could not be processed safely.')
    }
    if (!sanitizedBytes.length || sanitizedBytes.length > maxUploadBytes()) {
        throw new HttpError(422, 'This image could not be stored safely within the upload limit.')
    }

    return {
        mimeType: signature.mimeType,
        extension: signature.extension,
        checksumSha256: createHash('sha256').update(sanitizedBytes).digest('hex'),
        width: metadata.width,
        height: metadata.height,
        sanitizedBytes
    }
}

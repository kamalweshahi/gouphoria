import { createHash } from 'crypto'
import { basename, extname } from 'path'
import sharp from 'sharp'
import HttpError from '../errors/http-error'

export { createPhoneCaseMockup } from './mockup-templates'

export const SUPPORTED_UPLOAD_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'] as const
export const AI_REFERENCE_WIDTH = 1024
export const AI_REFERENCE_HEIGHT = 1536

export function maxUploadBytes() {
    const megabytes = Number(process.env.AI_UPLOAD_MAX_MB ?? 25)
    if (!Number.isFinite(megabytes) || megabytes < 1 || megabytes > 25) {
        throw new Error('AI_UPLOAD_MAX_MB must be between 1 and 25')
    }
    return Math.floor(megabytes * 1024 * 1024)
}

function uploadDimensionRules() {
    const minimum = Number(process.env.AI_UPLOAD_MIN_DIMENSION ?? 64)
    const maximum = Number(process.env.AI_UPLOAD_MAX_DIMENSION ?? 16000)
    const maxPixels = Number(process.env.AI_UPLOAD_MAX_PIXELS ?? 64000000)
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
    if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
        const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase()
        if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
            return { mimeType: 'image/heic', extension: 'heic' }
        }
    }
    return undefined
}

function declaredExtension(filename: string) {
    const extension = extname(basename(filename)).toLowerCase().replace('.', '')
    if (extension === 'jpeg') return 'jpg'
    if (extension === 'heif') return 'heic'
    return extension
}

export async function validateUploadedImage(file: Express.Multer.File) {
    if (!file?.buffer?.length) throw new HttpError(422, 'Choose a valid image file.')
    if (file.size > maxUploadBytes()) throw new HttpError(413, `Each image must be ${process.env.AI_UPLOAD_MAX_MB ?? 25} MB or smaller.`)

    const signature = detectedSignature(file.buffer)
    if (!signature) throw new HttpError(422, 'Only valid PNG, JPG, JPEG, WEBP, HEIC, or HEIF images are supported.')
    const extension = declaredExtension(file.originalname)
    if (!['png', 'jpg', 'webp', 'heic'].includes(extension)) {
        throw new HttpError(422, 'The image filename must end in PNG, JPG, JPEG, WEBP, HEIC, or HEIF.')
    }
    const declaredMime = file.mimetype === 'image/heif' ? 'image/heic' : file.mimetype
    if (!SUPPORTED_UPLOAD_MIME_TYPES.includes(file.mimetype as any) || declaredMime !== signature.mimeType || extension !== signature.extension) {
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
        sanitizedBytes = await sharp(file.buffer, { failOn: 'error', limitInputPixels: rules.maxPixels, sequentialRead: true })
            .rotate()
            .resize(AI_REFERENCE_WIDTH, AI_REFERENCE_HEIGHT, {
                fit: 'contain',
                position: 'centre',
                background: { r: 244, g: 242, b: 237, alpha: 1 }
            })
            .flatten({ background: { r: 244, g: 242, b: 237 } })
            .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' })
            .toBuffer()
    } catch {
        throw new HttpError(422, 'This image could not be processed safely.')
    }
    if (!sanitizedBytes.length || sanitizedBytes.length > maxUploadBytes()) {
        throw new HttpError(422, 'This image could not be stored safely within the upload limit.')
    }

    return {
        mimeType: 'image/jpeg' as const,
        extension: 'jpg' as const,
        checksumSha256: createHash('sha256').update(sanitizedBytes).digest('hex'),
        width: AI_REFERENCE_WIDTH,
        height: AI_REFERENCE_HEIGHT,
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        sanitizedBytes
    }
}

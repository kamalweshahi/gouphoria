import sharp, { type Metadata } from 'sharp'
import HttpError from '../errors/http-error'

export const PHONE_CASE_ARTWORK_WIDTH = 1024
export const PHONE_CASE_ARTWORK_HEIGHT = 1536
export const PHONE_CASE_PROVIDER_SIZE = '1024x1536' as const
export const PHONE_CASE_ARTWORK_ASPECT_RATIO = PHONE_CASE_ARTWORK_WIDTH / PHONE_CASE_ARTWORK_HEIGHT
export const PHONE_CASE_COMPOSITION_VERSION = 'phone-case-print-v1'

export const PHONE_CASE_SAFE_AREA = {
    left: 0.12,
    right: 0.88,
    top: 0.32,
    bottom: 0.88,
    cameraReserveBottom: 0.30
} as const

interface PhoneCasePromptInput {
    userPrompt: string
    phoneModel: string
    revisionInstructions?: string
}

export function buildPhoneCaseArtworkPrompt(input: PhoneCasePromptInput) {
    const customerRequest = input.revisionInstructions
        ? `Original design request:\n${input.userPrompt}\n\nRevision instructions:\n${input.revisionInstructions}\n\nUse the current artwork as the primary source. Preserve its concept and requested style except for the requested revision.`
        : input.userPrompt

    return `${customerRequest}

Internal phone-case production directions — do not render or quote these directions:
- Return one flat, print-ready artwork only. Do not show a phone, phone case, product mockup, hand, room, display scene, camera cutout, packaging, poster, canvas, background card, watermark, or presentation frame.
- Compose vertically at a 2:3 aspect ratio for a 1024 × 1536 print file targeting ${input.phoneModel}. The background, color, or intended texture must continue naturally to every edge for bleed; never add white borders, blank margins, poster edges, or framing.
- Keep every important subject, face, logo, focal detail, and readable text inside the central safe area: approximately 12%–88% horizontally and 32%–88% vertically.
- Treat the upper 30% as the camera and top-corner reserve. Continue only nonessential background there; keep faces, text, and focal objects below it. Leave comfortable breathing room at both side edges and the bottom edge.
- Preserve the customer's requested concept and style while adapting placement, scale, and spacing to this phone-case print area.
- For text-based work, use only the requested wording; make it large, correctly spelled, readable, centered, and safely inside the central area. Avoid tiny type, warped lettering, duplicate characters, or malformed words.
- Within the requested style, favor convincing depth, natural lighting, believable materials, clean edges, coherent anatomy and objects, and premium commercial-art finish.
- Avoid artificial texture, plastic-looking detail, excessive glow, muddy edges, distorted objects, malformed faces or hands, illegible text, repeated elements, and obvious AI artifacts.
- The output is artwork, not a product photograph. Do not draw the phone-case outline or reserve a visible blank hole for the camera.`
}

interface RegionStats {
    average: [number, number, number]
    standardDeviation: number
    nearWhiteRatio: number
}

function regionStats(data: Buffer, width: number, height: number, channels: number, include: (x: number, y: number) => boolean): RegionStats {
    let count = 0
    let white = 0
    const sum = [0, 0, 0]
    const square = [0, 0, 0]
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (!include(x, y)) continue
            const offset = (y * width + x) * channels
            const values = [data[offset], data[offset + 1], data[offset + 2]]
            count += 1
            if (values.every(value => value >= 244)) white += 1
            for (let channel = 0; channel < 3; channel += 1) {
                sum[channel] += values[channel]
                square[channel] += values[channel] * values[channel]
            }
        }
    }
    if (!count) return { average: [0, 0, 0], standardDeviation: 0, nearWhiteRatio: 0 }
    const average = sum.map(value => value / count) as [number, number, number]
    const variance = square.reduce((total, value, channel) => total + Math.max(0, value / count - average[channel] ** 2), 0) / 3
    return { average, standardDeviation: Math.sqrt(variance), nearWhiteRatio: white / count }
}

function colorDistance(first: [number, number, number], second: [number, number, number]) {
    return Math.sqrt(first.reduce((total, value, channel) => total + (value - second[channel]) ** 2, 0))
}

export interface GeneratedArtworkInspection {
    width: number
    height: number
    aspectRatio: number
    sourceWidth: number
    sourceHeight: number
    normalized: boolean
    minimumResolutionSatisfied: true
    aspectRatioSatisfied: true
    visibleBorderDetected: false
    safeArea: typeof PHONE_CASE_SAFE_AREA
    compositionVersion: typeof PHONE_CASE_COMPOSITION_VERSION
    contentGuardrails: ['flat-artwork-only', 'no-phone-mockup', 'no-camera-cutout', 'central-safe-area']
}

export async function normalizeGeneratedPhoneCaseArtwork(bytes: Buffer): Promise<{ bytes: Buffer; inspection: GeneratedArtworkInspection }> {
    if (!bytes.length) throw new HttpError(502, 'The image service returned an empty artwork file. No credit was used.')

    let metadata: Metadata
    try {
        metadata = await sharp(bytes, { failOn: 'error' }).metadata()
    } catch {
        throw new HttpError(502, 'The generated artwork was unreadable. No credit was used; please try again.')
    }
    const sourceWidth = metadata.width ?? 0
    const sourceHeight = metadata.height ?? 0
    if (sourceWidth < 768 || sourceHeight < 1152) {
        throw new HttpError(502, `The generated artwork was below the minimum safe print resolution. No credit was used; please try again.`)
    }
    const sourceAspectRatio = sourceWidth / sourceHeight
    if (Math.abs(sourceAspectRatio - PHONE_CASE_ARTWORK_ASPECT_RATIO) > 0.075) {
        throw new HttpError(502, 'The generated artwork did not use the required vertical phone-case aspect ratio. No credit was used; please try again.')
    }

    let normalizedBytes: Buffer
    try {
        normalizedBytes = await sharp(bytes, { failOn: 'error' })
            .rotate()
            .resize(PHONE_CASE_ARTWORK_WIDTH, PHONE_CASE_ARTWORK_HEIGHT, { fit: 'cover', position: 'centre' })
            .png({ compressionLevel: 9 })
            .toBuffer()
    } catch {
        throw new HttpError(502, 'The generated artwork could not be prepared safely for printing. No credit was used; please try again.')
    }

    const sampleWidth = 192
    const sampleHeight = 288
    const { data, info } = await sharp(normalizedBytes, { failOn: 'error' })
        .resize(sampleWidth, sampleHeight, { fit: 'fill' })
        .flatten({ background: '#ffffff' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
    const band = 6
    const edge = regionStats(data, info.width, info.height, info.channels, (x, y) => x < band || y < band || x >= info.width - band || y >= info.height - band)
    const interior = regionStats(data, info.width, info.height, info.channels, (x, y) => x >= band * 3 && y >= band * 3 && x < info.width - band * 3 && y < info.height - band * 3)
    const obviousWhiteFrame = edge.nearWhiteRatio >= 0.92 && interior.nearWhiteRatio < 0.72
    const uniformContrastingFrame = edge.standardDeviation < 7 && colorDistance(edge.average, interior.average) > 42
    if (obviousWhiteFrame || uniformContrastingFrame) {
        throw new HttpError(502, 'The generated artwork contained a visible border or frame. No credit was used; please try again.')
    }

    const inspection: GeneratedArtworkInspection = {
        width: PHONE_CASE_ARTWORK_WIDTH,
        height: PHONE_CASE_ARTWORK_HEIGHT,
        aspectRatio: PHONE_CASE_ARTWORK_ASPECT_RATIO,
        sourceWidth,
        sourceHeight,
        normalized: sourceWidth !== PHONE_CASE_ARTWORK_WIDTH || sourceHeight !== PHONE_CASE_ARTWORK_HEIGHT || metadata.format !== 'png',
        minimumResolutionSatisfied: true,
        aspectRatioSatisfied: true,
        visibleBorderDetected: false,
        safeArea: PHONE_CASE_SAFE_AREA,
        compositionVersion: PHONE_CASE_COMPOSITION_VERSION,
        contentGuardrails: ['flat-artwork-only', 'no-phone-mockup', 'no-camera-cutout', 'central-safe-area']
    }
    return { bytes: normalizedBytes, inspection }
}

export async function validateGeneratedPhoneCaseArtwork(bytes: Buffer): Promise<GeneratedArtworkInspection> {
    return (await normalizeGeneratedPhoneCaseArtwork(bytes)).inspection
}

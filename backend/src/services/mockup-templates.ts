import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import HttpError from '../errors/http-error'
import {
    requirePhoneModelMockup,
    resolvePhoneModelMockup,
    type PhoneModelMockupConfiguration
} from './phone-model-mockups'

export const MAGNETIC_TOUGH_CASE_TEMPLATE_ID = 'magnetic-tough-iphone-v1'
export const PU_LEATHER_IPHONE_TEMPLATE_ID = 'pu-leather-iphone-v1'
export const GENERIC_IPHONE_CASE_TEMPLATE_ID = 'iphone-case-studio-v1'
export const SMOOTH_STUDIO_IPHONE_TEMPLATE_ID = 'smooth-studio-iphone-v2'
export const FULL_BLEED_STUDIO_IPHONE_TEMPLATE_ID = 'full-bleed-studio-iphone-v3'
export const REFERENCE_PHOTO_IPHONE_TEMPLATE_ID = 'reference-photo-full-bleed-v8'

export interface ArtworkPlacement {
    left: number
    top: number
    width: number
    height: number
    fit: 'cover'
    position: 'centre'
    crop: { left: number; top: number; width: number; height: number }
    perspectiveCorners?: Array<{ x: number; y: number }>
    bleed?: number
    focalPoint?: { x: number; y: number }
    printableMaskId?: string
    safeArea?: { left: number; top: number; width: number; height: number }
    buttonExclusionZones?: Array<{ side: 'left' | 'right'; top: number; height: number; inset: number }>
    review?: ArtworkPlacementReview
}

export interface ArtworkPlacementReview {
    status: 'ready' | 'needs-review'
    reasons: string[]
    horizontalCropRatio: number
    verticalCropRatio: number
}

export interface MockupVariantDescriptor {
    phoneModel: string
    caseType: string
    productTitle?: string
    mockupTemplateId?: string
}

export interface MockupTemplate {
    id: string
    name: string
    output: { width: number; height: number }
    artworkPlacement: ArtworkPlacement
    sourceCrop?: { left: number; top: number; width: number; height: number }
    supports: (variant: MockupVariantDescriptor) => boolean
    baseMockupImage: (variant: MockupVariantDescriptor) => Buffer
    printableAreaMask: (variant: MockupVariantDescriptor) => Promise<Buffer>
    materialShadingMask?: (variant: MockupVariantDescriptor) => Promise<Buffer>
    cameraCutoutOverlay: (variant: MockupVariantDescriptor) => Buffer
    shadowLayer: (variant: MockupVariantDescriptor) => Buffer
    highlightLayer: (variant: MockupVariantDescriptor) => Buffer
    shellFinishLayer?: (variant: MockupVariantDescriptor, accent: MockupAccentColor) => Buffer
}

interface MockupAccentColor {
    red: number
    green: number
    blue: number
    css: string
    lightCss: string
    darkCss: string
}

export interface ComposedMockup {
    bytes: Buffer
    templateId: string
    placement: ArtworkPlacement
    normalizedPhoneModel: string
    cameraTemplateId: string
    shellTemplateId: string
    placementReview: ArtworkPlacementReview
}

export type MockupPreviewStatus = {
    status: 'supported'
    requestedPhoneModel: string
    normalizedPhoneModel: string
    mockupTemplateId: string
    cameraTemplateId: string
    shellTemplateId: string
} | {
    status: 'unsupported-model'
    requestedPhoneModel: string
}

const output = { width: 900, height: 1200 }
const referencePhoto = readFileSync(resolve(__dirname, '../../assets/mockups/iphone-reference.jpg'))
const referencePhotoPlacement: ArtworkPlacement = {
    left: 220,
    top: 48,
    width: 500,
    height: 1088,
    fit: 'cover',
    position: 'centre',
    crop: { left: 12, top: 16, width: 476, height: 1056 },
    perspectiveCorners: [
        { x: 220, y: 48 },
        { x: 720, y: 48 },
        { x: 720, y: 1136 },
        { x: 220, y: 1136 }
    ]
}
const artworkPlacement: ArtworkPlacement = {
    left: 192,
    top: 140,
    width: 524,
    height: 824,
    fit: 'cover',
    position: 'centre',
    // Production-safe coordinates are metadata only. They never inset the
    // rendered artwork, which remains full bleed across the back shell.
    crop: { left: 12, top: 16, width: 500, height: 792 },
    perspectiveCorners: [
        { x: 258, y: 140 },
        { x: 626, y: 158 },
        { x: 653, y: 960 },
        { x: 256, y: 932 }
    ]
}

const outerCasePath = 'M 258 140 C 235 143 222 164 220 194 L 194 850 C 192 897 218 927 256 932 L 653 960 C 690 962 715 935 712 897 L 681 210 C 679 178 658 160 626 158 Z'
const backShellMaskPath = 'M 66 0 C 43 3 30 24 28 54 L 2 710 C 0 757 26 787 64 792 L 461 820 C 498 822 523 795 520 757 L 489 70 C 487 38 466 20 434 18 Z'

function cameraGeometry(phoneModel: string) {
    const camera = requirePhoneModelMockup(phoneModel).camera
    return {
        left: camera.left,
        top: camera.top,
        width: camera.width,
        height: camera.height,
        radius: camera.cornerRadius,
        lensCenters: camera.lenses.map(lens => ({ x: camera.left + lens.x, y: camera.top + lens.y }))
    }
}

function svg(value: string) {
    return Buffer.from(value)
}

function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(minimum, value))
}

function mixChannel(value: number, target: number, amount: number) {
    return Math.round(value + (target - value) * amount)
}

async function artworkAccentColor(artwork: Buffer): Promise<MockupAccentColor> {
    const { dominant } = await sharp(artwork).removeAlpha().stats()
    const red = clamp(dominant.r, 22, 224)
    const green = clamp(dominant.g, 22, 224)
    const blue = clamp(dominant.b, 22, 224)
    const css = `rgb(${red} ${green} ${blue})`
    const lightCss = `rgb(${mixChannel(red, 255, 0.34)} ${mixChannel(green, 255, 0.34)} ${mixChannel(blue, 255, 0.34)})`
    const darkCss = `rgb(${mixChannel(red, 0, 0.42)} ${mixChannel(green, 0, 0.42)} ${mixChannel(blue, 0, 0.42)})`
    return { red, green, blue, css, lightCss, darkCss }
}

async function fitArtworkToPrintablePanel(
    artwork: Buffer,
    placement: ArtworkPlacement,
    configuration: PhoneModelMockupConfiguration
) {
    const normalizedArtwork = await sharp(artwork, { failOn: 'error' }).rotate().ensureAlpha().png().toBuffer()
    const metadata = await sharp(normalizedArtwork).metadata()
    const sourceWidth = metadata.width ?? 0
    const sourceHeight = metadata.height ?? 0
    if (!sourceWidth || !sourceHeight) throw new HttpError(422, 'Printable artwork dimensions are unavailable for preview generation.')

    const bleed = configuration.shell.bleed
    const coveredWidth = placement.width + bleed * 2
    const coveredHeight = placement.height + bleed * 2
    const scale = Math.max(coveredWidth / sourceWidth, coveredHeight / sourceHeight)
    const resizedWidth = Math.max(coveredWidth, Math.ceil(sourceWidth * scale))
    const resizedHeight = Math.max(coveredHeight, Math.ceil(sourceHeight * scale))
    const focalPoint = configuration.shell.artworkFocalPoint
    const extractLeft = clamp(
        Math.round(resizedWidth * focalPoint.x - coveredWidth / 2),
        0,
        resizedWidth - coveredWidth
    )
    const extractTop = clamp(
        Math.round(resizedHeight * focalPoint.y - coveredHeight / 2),
        0,
        resizedHeight - coveredHeight
    )
    const horizontalCropRatio = (resizedWidth - coveredWidth) / resizedWidth
    const verticalCropRatio = (resizedHeight - coveredHeight) / resizedHeight
    const reasons: string[] = []
    if (horizontalCropRatio > 0.42 || verticalCropRatio > 0.42) reasons.push('substantial-cover-crop')
    const review: ArtworkPlacementReview = {
        status: reasons.length ? 'needs-review' : 'ready',
        reasons,
        horizontalCropRatio,
        verticalCropRatio
    }

    const fittedArtwork = await sharp(normalizedArtwork)
        .resize(resizedWidth, resizedHeight, { fit: 'cover', position: 'centre' })
        .extract({
            left: extractLeft + bleed,
            top: extractTop + bleed,
            width: placement.width,
            height: placement.height
        })
        .png()
        .toBuffer()
    return { fittedArtwork, review }
}

function placementForConfiguration(template: MockupTemplate, configuration: PhoneModelMockupConfiguration): ArtworkPlacement {
    const base = template.artworkPlacement
    return {
        ...base,
        crop: { ...configuration.shell.safeArea },
        perspectiveCorners: base.perspectiveCorners?.map(corner => ({ ...corner })),
        bleed: configuration.shell.bleed,
        focalPoint: { ...configuration.shell.artworkFocalPoint },
        printableMaskId: configuration.shell.templateId,
        safeArea: { ...configuration.shell.safeArea },
        buttonExclusionZones: configuration.shell.buttonExclusionZones.map(zone => ({ ...zone }))
    }
}

function renderModelCameraOverlay(configuration: PhoneModelMockupConfiguration, placement: ArtworkPlacement) {
    const camera = configuration.camera
    const left = placement.left + camera.left
    const top = placement.top + camera.top
    const lenses = camera.lenses.map((lens, index) => {
        const x = left + lens.x
        const y = top + lens.y
        return `<g data-lens-index="${index}">
            <circle cx="${x}" cy="${y}" r="${lens.radius + 5}" fill="url(#metal-ring)"/>
            <circle cx="${x}" cy="${y}" r="${lens.radius}" fill="url(#lens-glass)"/>
            <ellipse cx="${x - lens.radius * 0.24}" cy="${y - lens.radius * 0.27}" rx="${lens.radius * 0.2}" ry="${lens.radius * 0.25}" fill="#badcf2" opacity="0.34"/>
        </g>`
    }).join('')
    const sensor = camera.sensor
        ? `<circle cx="${left + camera.sensor.x}" cy="${top + camera.sensor.y}" r="9" fill="#080a0d" stroke="#5f666b" stroke-width="3"/>`
        : ''
    const cameraHousing = camera.shape === 'individual-lenses' ? '' : `
        <rect x="${left}" y="${top}" width="${camera.width}" height="${camera.height}" rx="${camera.cornerRadius}" fill="url(#camera-shell)" stroke="#aeb2b0" stroke-width="3" filter="url(#camera-depth)"/>
        <rect x="${left + 7}" y="${top + 7}" width="${camera.width - 14}" height="${camera.height - 14}" rx="${Math.max(1, camera.cornerRadius - 7)}" fill="url(#camera-island)"/>`
    return svg(`<svg width="${output.width}" height="${output.height}" xmlns="http://www.w3.org/2000/svg" data-normalized-phone-model="${configuration.normalizedPhoneModel}" data-camera-template-id="${configuration.cameraTemplateId}">
        <defs>
            <linearGradient id="camera-shell" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset="0.52" stop-color="#e9eae8"/><stop offset="1" stop-color="#c4c7c6"/></linearGradient>
            <linearGradient id="camera-island" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#34373a"/><stop offset="0.38" stop-color="#111315"/><stop offset="1" stop-color="#050607"/></linearGradient>
            <radialGradient id="lens-glass" cx="38%" cy="32%"><stop stop-color="#7598b1"/><stop offset="0.2" stop-color="#263c4e"/><stop offset="0.55" stop-color="#070a0d"/><stop offset="0.84" stop-color="#010203"/><stop offset="1" stop-color="#252c31"/></radialGradient>
            <linearGradient id="metal-ring" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dadbd9"/><stop offset="0.22" stop-color="#5d6265"/><stop offset="0.52" stop-color="#151719"/><stop offset="0.8" stop-color="#989d9e"/><stop offset="1" stop-color="#34383a"/></linearGradient>
            <radialGradient id="flash"><stop stop-color="#fffdeb"/><stop offset="0.5" stop-color="#ded8bf"/><stop offset="1" stop-color="#77756c"/></radialGradient>
            <filter id="camera-depth" x="-30%" y="-30%" width="170%" height="180%"><feDropShadow dx="3" dy="7" stdDeviation="6" flood-color="#111315" flood-opacity="0.52"/></filter>
        </defs>
        ${cameraHousing}
        ${lenses}
        <circle cx="${left + camera.flash.x}" cy="${top + camera.flash.y}" r="12" fill="url(#flash)" stroke="#5f6467" stroke-width="3"/>
        ${sensor}
    </svg>`)
}

function baseMockupImage(variant: MockupVariantDescriptor) {
    const rim = /brown/i.test(variant.caseType) ? '#4a2d20' : /navy/i.test(variant.caseType) ? '#101c32' : '#161719'
    return svg(`<svg width="${output.width}" height="${output.height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#f8f6f1"/><stop offset="0.55" stop-color="#e8e4dc"/><stop offset="1" stop-color="#d6d1c8"/>
            </linearGradient>
            <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#5e6269"/><stop offset="0.18" stop-color="${rim}"/><stop offset="0.82" stop-color="#090b0e"/><stop offset="1" stop-color="#555a61"/>
            </linearGradient>
            <filter id="ground-shadow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="28"/>
            </filter>
            <filter id="device-shadow" x="-40%" y="-30%" width="180%" height="180%">
                <feDropShadow dx="10" dy="28" stdDeviation="25" flood-color="#16191d" flood-opacity="0.43"/>
            </filter>
            <pattern id="grain" width="9" height="9" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="2" r="0.7" fill="#fff" opacity="0.18"/><circle cx="7" cy="6" r="0.6" fill="#6b665e" opacity="0.12"/>
            </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#background)"/>
        <rect width="100%" height="100%" fill="url(#grain)" opacity="0.65"/>
        <ellipse cx="466" cy="1052" rx="285" ry="55" fill="#343638" opacity="0.28" filter="url(#ground-shadow)"/>
        <rect x="178" y="93" width="544" height="964" rx="94" fill="url(#edge)" filter="url(#device-shadow)"/>
        <rect x="184" y="99" width="532" height="952" rx="88" fill="#0e1115"/>
        <rect x="711" y="302" width="18" height="154" rx="8" fill="#1b1e23"/>
        <rect x="171" y="285" width="17" height="91" rx="8" fill="#24282e"/>
        <rect x="171" y="397" width="17" height="91" rx="8" fill="#24282e"/>
    </svg>`)
}

async function printableAreaMask(variant: MockupVariantDescriptor) {
    const camera = cameraGeometry(variant.phoneModel)
    const body = svg(`<svg width="${artworkPlacement.width}" height="${artworkPlacement.height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" rx="82" fill="#fff"/>
    </svg>`)
    const cutout = svg(`<svg width="${camera.width}" height="${camera.height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" rx="${camera.radius}" fill="#fff"/>
    </svg>`)
    return sharp(body)
        .ensureAlpha()
        .composite([{ input: cutout, left: camera.left, top: camera.top, blend: 'dest-out' }])
        .png()
        .toBuffer()
}

function cameraCutoutOverlay(variant: MockupVariantDescriptor) {
    const camera = cameraGeometry(variant.phoneModel)
    const left = artworkPlacement.left + camera.left
    const top = artworkPlacement.top + camera.top
    const lenses = camera.lensCenters.map((lens, index) => `
        <circle cx="${artworkPlacement.left + lens.x}" cy="${artworkPlacement.top + lens.y}" r="31" fill="#080a0d" stroke="#aeb5bd" stroke-width="5"/>
        <circle cx="${artworkPlacement.left + lens.x}" cy="${artworkPlacement.top + lens.y}" r="22" fill="url(#lens-${index})"/>
        <circle cx="${artworkPlacement.left + lens.x - 7}" cy="${artworkPlacement.top + lens.y - 8}" r="6" fill="#bde1f5" opacity="0.5"/>`).join('')
    const lensGradients = camera.lensCenters.map((_, index) => `<radialGradient id="lens-${index}" cx="38%" cy="32%"><stop offset="0" stop-color="#4f6b7b"/><stop offset="0.34" stop-color="#142431"/><stop offset="0.72" stop-color="#05070a"/><stop offset="1" stop-color="#202831"/></radialGradient>`).join('')
    return svg(`<svg width="${output.width}" height="${output.height}" xmlns="http://www.w3.org/2000/svg">
        <defs>${lensGradients}<linearGradient id="island" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#2f3339"/><stop offset="0.45" stop-color="#111419"/><stop offset="1" stop-color="#3e434a"/></linearGradient><filter id="camera-shadow"><feDropShadow dx="3" dy="7" stdDeviation="7" flood-opacity="0.55"/></filter></defs>
        <rect x="${left}" y="${top}" width="${camera.width}" height="${camera.height}" rx="${camera.radius}" fill="url(#island)" stroke="#7f858c" stroke-width="4" filter="url(#camera-shadow)"/>
        ${lenses}
        <circle cx="${left + camera.width - 29}" cy="${top + camera.height - 31}" r="9" fill="#e7dfc6" stroke="#545960" stroke-width="3"/>
    </svg>`)
}

function shadowLayer() {
    const { left, top, width, height } = artworkPlacement
    return svg(`<svg width="${output.width}" height="${output.height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="edge-shadow-x"><stop stop-color="#000" stop-opacity="0.3"/><stop offset="0.07" stop-opacity="0"/><stop offset="0.9" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.38"/></linearGradient>
            <linearGradient id="edge-shadow-y" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#000" stop-opacity="0.18"/><stop offset="0.12" stop-opacity="0"/><stop offset="0.82" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.4"/></linearGradient>
            <clipPath id="case"><rect x="${left}" y="${top}" width="${width}" height="${height}" rx="82"/></clipPath>
        </defs>
        <g clip-path="url(#case)"><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="url(#edge-shadow-x)"/><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="url(#edge-shadow-y)"/></g>
        <rect x="${left + 4}" y="${top + 4}" width="${width - 8}" height="${height - 8}" rx="78" fill="none" stroke="#000" stroke-opacity="0.34" stroke-width="8"/>
    </svg>`)
}

function renderHighlightLayer(includeLeatherFinish: boolean) {
    const { left, top, width, height } = artworkPlacement
    const leatherFinish = includeLeatherFinish ? `
        <rect x="${left + 22}" y="${top + 22}" width="${width - 44}" height="${height - 44}" rx="64" fill="none" stroke="#e7d5b8" stroke-opacity="0.64" stroke-width="3" stroke-dasharray="3 10"/>
        <g opacity="0.12" fill="#17120e">
            <circle cx="${left + 285}" cy="${top + 260}" r="1.2"/><circle cx="${left + 355}" cy="${top + 431}" r="1"/><circle cx="${left + 238}" cy="${top + 612}" r="1.3"/><circle cx="${left + 403}" cy="${top + 752}" r="1.1"/><circle cx="${left + 121}" cy="${top + 538}" r="1"/>
        </g>` : ''
    return svg(`<svg width="${output.width}" height="${output.height}" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="shine" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity="0.62"/><stop offset="0.38" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="case"><rect x="${left}" y="${top}" width="${width}" height="${height}" rx="82"/></clipPath></defs>
        <g clip-path="url(#case)"><path d="M ${left + 43} ${top + 55} C ${left + 116} ${top + 25}, ${left + 208} ${top + 24}, ${left + 303} ${top + 59} C ${left + 205} ${top + 93}, ${left + 127} ${top + 154}, ${left + 53} ${top + 261} Z" fill="url(#shine)" opacity="0.33"/><path d="M ${left + width - 18} ${top + 186} C ${left + width - 55} ${top + 369}, ${left + width - 47} ${top + 630}, ${left + width - 19} ${top + 782}" fill="none" stroke="#fff" stroke-opacity="0.38" stroke-width="12" stroke-linecap="round"/></g>
        <rect x="${left + 10}" y="${top + 10}" width="${width - 20}" height="${height - 20}" rx="73" fill="none" stroke="#fff" stroke-opacity="0.26" stroke-width="4"/>
        ${leatherFinish}
    </svg>`)
}

function leatherHighlightLayer() {
    return renderHighlightLayer(true)
}

function smoothHighlightLayer() {
    return renderHighlightLayer(false)
}

function smoothStudioBaseMockupImage() {
    return svg(`<svg width="${output.width}" height="${output.height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="studio-background" cx="44%" cy="28%" r="80%"><stop stop-color="#f4f4f2"/><stop offset="0.58" stop-color="#e5e6e5"/><stop offset="1" stop-color="#cfd1d1"/></radialGradient>
            <linearGradient id="studio-floor" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e2e3e2" stop-opacity="0"/><stop offset="1" stop-color="#c8cac9"/></linearGradient>
            <linearGradient id="pedestal-top" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f0f0ed"/><stop offset="0.55" stop-color="#d3d4d1"/><stop offset="1" stop-color="#b9bbb8"/></linearGradient>
            <linearGradient id="pedestal-front" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#c1c3c0"/><stop offset="0.48" stop-color="#e1e1de"/><stop offset="1" stop-color="#adb0ad"/></linearGradient>
            <linearGradient id="shell" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffff"/><stop offset="0.42" stop-color="#f3f3f1"/><stop offset="0.78" stop-color="#d9dbd9"/><stop offset="1" stop-color="#bfc2c1"/></linearGradient>
            <linearGradient id="thickness" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#34383a"/><stop offset="0.48" stop-color="#171a1c"/><stop offset="1" stop-color="#090b0c"/></linearGradient>
            <filter id="soft-shadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="25"/></filter>
            <filter id="case-shadow" x="-40%" y="-30%" width="190%" height="190%"><feDropShadow dx="22" dy="28" stdDeviation="22" flood-color="#303334" flood-opacity="0.38"/></filter>
            <pattern id="concrete" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M2 7h3M17 4h2M10 18h4M21 15h1" stroke="#727572" stroke-opacity="0.13" stroke-width="1"/></pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#studio-background)"/>
        <rect y="650" width="900" height="550" fill="url(#studio-floor)"/>
        <ellipse cx="475" cy="921" rx="280" ry="52" fill="#555958" opacity="0.28" filter="url(#soft-shadow)"/>
        <path d="M 138 907 C 150 874 207 856 284 856 L 682 876 C 754 881 782 908 762 936 L 720 989 L 169 966 Z" fill="url(#pedestal-top)" stroke="#b8bab7" stroke-width="2"/>
        <path d="M 169 966 L 720 989 L 720 1090 C 720 1115 700 1131 674 1129 L 197 1108 C 175 1107 161 1091 161 1069 Z" fill="url(#pedestal-front)"/>
        <path d="M 169 966 L 720 989 L 720 1090 C 720 1115 700 1131 674 1129 L 197 1108 C 175 1107 161 1091 161 1069 Z" fill="url(#concrete)"/>
        <ellipse cx="475" cy="926" rx="210" ry="25" fill="#202324" opacity="0.42" filter="url(#soft-shadow)"/>
        <path d="M 276 149 C 252 151 239 171 237 201 L 211 856 C 210 904 236 936 274 941 L 671 968 C 708 970 734 943 731 904 L 700 217 C 698 185 677 167 644 165 Z" fill="url(#thickness)" opacity="0.98"/>
        <path d="${outerCasePath}" fill="url(#shell)" filter="url(#case-shadow)"/>
    </svg>`)
}

async function smoothStudioPrintableAreaMask(variant: MockupVariantDescriptor) {
    const camera = cameraGeometry(variant.phoneModel)
    const body = svg(`<svg width="${artworkPlacement.width}" height="${artworkPlacement.height}" xmlns="http://www.w3.org/2000/svg"><path d="${backShellMaskPath}" fill="#fff"/></svg>`)
    const cutout = svg(`<svg width="${camera.width}" height="${camera.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" rx="${camera.radius}" fill="#fff"/></svg>`)
    return sharp(body).ensureAlpha().composite([{ input: cutout, left: camera.left, top: camera.top, blend: 'dest-out' }]).png().toBuffer()
}

function smoothStudioCameraOverlay(variant: MockupVariantDescriptor) {
    return renderModelCameraOverlay(requirePhoneModelMockup(variant.phoneModel), artworkPlacement)
}

function smoothStudioShadowLayer() {
    return svg(`<svg width="${output.width}" height="${output.height}" xmlns="http://www.w3.org/2000/svg">
        <path d="${outerCasePath}" fill="none" stroke="#171a1c" stroke-opacity="0.84" stroke-width="9"/>
        <path d="${outerCasePath}" fill="none" stroke="#f8f8f6" stroke-opacity="0.68" stroke-width="3" transform="translate(-2 -2)"/>
        <path d="M 696 326 L 706 329 L 712 458 L 702 455 Z" fill="#15191b"/>
        <path d="M 202 324 L 213 319 L 209 398 L 198 404 Z" fill="#25292b"/>
        <path d="M 198 420 L 209 415 L 205 501 L 194 507 Z" fill="#25292b"/>
        <path d="M 252 927 C 359 943 541 950 652 955" fill="none" stroke="#080a0b" stroke-opacity="0.3" stroke-width="8"/>
        <path d="M 262 151 C 344 141 493 150 618 164" fill="none" stroke="#fff" stroke-opacity="0.28" stroke-width="4" stroke-linecap="round"/>
        <path d="M 226 203 C 216 374 210 619 203 805" fill="none" stroke="#fff" stroke-opacity="0.13" stroke-width="4" stroke-linecap="round"/>
    </svg>`)
}

function smoothStudioHighlightLayer() {
    return svg(`<svg width="${output.width}" height="${output.height}" xmlns="http://www.w3.org/2000/svg"><defs>
        <linearGradient id="matte" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity="0.09"/><stop offset="0.42" stop-color="#fff" stop-opacity="0.015"/><stop offset="1" stop-color="#000" stop-opacity="0.045"/></linearGradient>
        <pattern id="matte-grain" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r="0.45" fill="#fff" opacity="0.13"/><circle cx="6" cy="6" r="0.4" fill="#111" opacity="0.07"/></pattern>
    </defs>
        <path d="${outerCasePath}" fill="url(#matte)"/>
        <path d="${outerCasePath}" fill="url(#matte-grain)" opacity="0.22"/>
    </svg>`)
}

async function referencePhotoPrintableAreaMask(variant: MockupVariantDescriptor) {
    const configuration = requirePhoneModelMockup(variant.phoneModel)
    const camera = configuration.camera
    const { width, height } = referencePhotoPlacement
    const body = svg(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <path d="${configuration.shell.printablePath}" fill="#fff"/>
    </svg>`)
    const cameraOpening = camera.shape === 'individual-lenses'
        ? svg(`<svg width="${camera.width}" height="${camera.height}" xmlns="http://www.w3.org/2000/svg">
            ${camera.lenses.map(lens => `<circle cx="${lens.x}" cy="${lens.y}" r="${lens.radius + 7}" fill="#fff"/>`).join('')}
            <circle cx="${camera.flash.x}" cy="${camera.flash.y}" r="16" fill="#fff"/>
        </svg>`)
        : svg(`<svg width="${camera.width}" height="${camera.height}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${camera.width}" height="${camera.height}" rx="${camera.cornerRadius}" fill="#fff"/>
        </svg>`)
    return sharp(body).ensureAlpha().composite([{
        input: cameraOpening,
        left: camera.left,
        top: camera.top,
        blend: 'dest-out'
    }]).png().toBuffer()
}

function referencePhotoSurfaceLayer(variant: MockupVariantDescriptor) {
    const configuration = requirePhoneModelMockup(variant.phoneModel)
    const path = configuration.shell.printablePath
    const { left, top } = referencePhotoPlacement
    return svg(`<svg width="${output.width}" height="${output.height}" xmlns="http://www.w3.org/2000/svg" data-surface-template-id="${configuration.shell.templateId}">
        <defs>
            <clipPath id="printable-panel"><path d="${path}" transform="translate(${left} ${top})"/></clipPath>
            <linearGradient id="panel-edge-x"><stop stop-color="#000" stop-opacity="0.14"/><stop offset="0.07" stop-opacity="0.015"/><stop offset="0.91" stop-opacity="0.01"/><stop offset="1" stop-color="#000" stop-opacity="0.16"/></linearGradient>
            <linearGradient id="panel-edge-y" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity="0.11"/><stop offset="0.13" stop-opacity="0.01"/><stop offset="0.86" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.14"/></linearGradient>
            <linearGradient id="soft-reflection" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity="0.08"/><stop offset="0.42" stop-color="#fff" stop-opacity="0.015"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
            <pattern id="matte-texture" width="11" height="11" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r="0.45" fill="#fff" opacity="0.13"/><circle cx="8" cy="7" r="0.4" fill="#111" opacity="0.08"/></pattern>
        </defs>
        <g clip-path="url(#printable-panel)">
            <rect x="${left}" y="${top}" width="${configuration.shell.width}" height="${configuration.shell.height}" fill="url(#panel-edge-x)"/>
            <rect x="${left}" y="${top}" width="${configuration.shell.width}" height="${configuration.shell.height}" fill="url(#panel-edge-y)"/>
            <rect x="${left}" y="${top}" width="${configuration.shell.width}" height="${configuration.shell.height}" fill="url(#matte-texture)" opacity="0.16"/>
            <path d="M ${left + 38} ${top + 82} C ${left + 145} ${top + 35}, ${left + 310} ${top + 42}, ${left + 430} ${top + 110} C ${left + 305} ${top + 138}, ${left + 164} ${top + 210}, ${left + 55} ${top + 330} Z" fill="url(#soft-reflection)"/>
        </g>
        <path d="${path}" transform="translate(${left} ${top})" fill="none" stroke="#111" stroke-opacity="0.18" stroke-width="2"/>
    </svg>`)
}

function referencePhotoShellFinishLayer(
    variant: MockupVariantDescriptor,
    accent: MockupAccentColor
) {
    const configuration = requirePhoneModelMockup(variant.phoneModel)
    const { left, top, width, height } = referencePhotoPlacement
    const panelPath = configuration.shell.printablePath
    const outerLeft = left - 12
    const outerTop = top - 10
    const outerWidth = width + 24
    const outerHeight = height + 20
    const outerRadius = configuration.shell.cornerRadius + 15
    const outerPath = `M ${outerLeft + outerRadius} ${outerTop}
        H ${outerLeft + outerWidth - outerRadius}
        C ${outerLeft + outerWidth - 20} ${outerTop} ${outerLeft + outerWidth} ${outerTop + 20} ${outerLeft + outerWidth} ${outerTop + outerRadius}
        V ${outerTop + outerHeight - outerRadius}
        C ${outerLeft + outerWidth} ${outerTop + outerHeight - 20} ${outerLeft + outerWidth - 20} ${outerTop + outerHeight} ${outerLeft + outerWidth - outerRadius} ${outerTop + outerHeight}
        H ${outerLeft + outerRadius}
        C ${outerLeft + 20} ${outerTop + outerHeight} ${outerLeft} ${outerTop + outerHeight - 20} ${outerLeft} ${outerTop + outerHeight - outerRadius}
        V ${outerTop + outerRadius}
        C ${outerLeft} ${outerTop + 20} ${outerLeft + 20} ${outerTop} ${outerLeft + outerRadius} ${outerTop} Z`
    return svg(`<svg width="${output.width}" height="${output.height}" xmlns="http://www.w3.org/2000/svg" data-shell-finish-template-id="${configuration.shell.templateId}" data-artwork-accent="${accent.red},${accent.green},${accent.blue}">
        <defs>
            <linearGradient id="adaptive-rim" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="${accent.lightCss}"/>
                <stop offset="0.24" stop-color="${accent.css}"/>
                <stop offset="0.76" stop-color="${accent.darkCss}"/>
                <stop offset="1" stop-color="#171a1f"/>
            </linearGradient>
            <linearGradient id="rim-highlight" x1="0" y1="0" x2="1" y2="1">
                <stop stop-color="#fff" stop-opacity="0.42"/>
                <stop offset="0.34" stop-color="#fff" stop-opacity="0.08"/>
                <stop offset="0.8" stop-color="#000" stop-opacity="0.08"/>
                <stop offset="1" stop-color="#000" stop-opacity="0.34"/>
            </linearGradient>
            <filter id="premium-product-shadow" x="-70%" y="-40%" width="240%" height="210%">
                <feDropShadow dx="14" dy="22" stdDeviation="18" flood-color="#222936" flood-opacity="0.3"/>
            </filter>
            <filter id="rim-softness" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="0.45"/>
            </filter>
            <mask id="physical-rim">
                <path d="${outerPath}" fill="#fff"/>
                <path d="${panelPath}" transform="translate(${left} ${top})" fill="#000"/>
            </mask>
        </defs>
        <path d="${outerPath}" fill="#171a1f" fill-opacity="0.012" filter="url(#premium-product-shadow)"/>
        <path d="${outerPath}" fill="url(#adaptive-rim)" mask="url(#physical-rim)"/>
        <path d="${outerPath}" fill="none" stroke="url(#rim-highlight)" stroke-width="5" filter="url(#rim-softness)"/>
        <path d="${panelPath}" transform="translate(${left} ${top})" fill="none" stroke="${accent.darkCss}" stroke-opacity="0.42" stroke-width="3"/>
        <path d="M ${outerLeft + outerRadius} ${outerTop + 4} H ${outerLeft + outerWidth - outerRadius - 8}" fill="none" stroke="#fff" stroke-opacity="0.34" stroke-width="4" stroke-linecap="round"/>
        <path d="M ${outerLeft + outerWidth - 3} ${outerTop + outerRadius + 25} V ${outerTop + outerHeight - outerRadius - 30}" fill="none" stroke="#050609" stroke-opacity="0.36" stroke-width="5" stroke-linecap="round"/>
    </svg>`)
}

async function referencePhotoMaterialShadingMask() {
    const { width, height } = referencePhotoPlacement
    // The source photograph's material pixels include its fixed camera bar.
    // Reusing any rectangular subset would reveal a panel boundary, so the
    // supplied-photo template keeps its shell/rim from the base and leaves the
    // full-bleed artwork itself visually uniform.
    return sharp({
        create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    }).png().toBuffer()
}

function referencePhotoCameraOverlay(variant: MockupVariantDescriptor) {
    return renderModelCameraOverlay(requirePhoneModelMockup(variant.phoneModel), referencePhotoPlacement)
}

function transparentReferenceLayer() {
    return svg(`<svg width="${output.width}" height="${output.height}" xmlns="http://www.w3.org/2000/svg"/>`)
}

const puLeatherIPhoneTemplate: MockupTemplate = {
    id: PU_LEATHER_IPHONE_TEMPLATE_ID,
    name: 'PU leather iPhone case — stitched studio back view',
    output,
    artworkPlacement,
    supports: variant => Boolean(resolvePhoneModelMockup(variant.phoneModel)) && /\bleather\b/i.test(variant.productTitle ?? ''),
    baseMockupImage,
    printableAreaMask,
    cameraCutoutOverlay,
    shadowLayer,
    highlightLayer: leatherHighlightLayer
}

const magneticToughCaseTemplate: MockupTemplate = {
    id: MAGNETIC_TOUGH_CASE_TEMPLATE_ID,
    name: 'Magnetic/tough iPhone case — studio back view',
    output,
    artworkPlacement,
    supports: variant => Boolean(resolvePhoneModelMockup(variant.phoneModel)) && /tough|magnetic|durable|sport/i.test(variant.productTitle ?? ''),
    baseMockupImage,
    printableAreaMask,
    cameraCutoutOverlay,
    shadowLayer,
    highlightLayer: smoothHighlightLayer
}

const genericIPhoneCaseTemplate: MockupTemplate = {
    id: GENERIC_IPHONE_CASE_TEMPLATE_ID,
    name: 'Smooth iPhone case — studio back view',
    output,
    artworkPlacement,
    supports: variant => Boolean(resolvePhoneModelMockup(variant.phoneModel)),
    baseMockupImage,
    printableAreaMask,
    cameraCutoutOverlay,
    shadowLayer,
    highlightLayer: smoothHighlightLayer
}

const fullBleedStudioIPhoneTemplate: MockupTemplate = {
    id: FULL_BLEED_STUDIO_IPHONE_TEMPLATE_ID,
    name: 'Full-bleed iPhone case — angled studio pedestal',
    output,
    artworkPlacement,
    supports: variant => Boolean(resolvePhoneModelMockup(variant.phoneModel)),
    baseMockupImage: smoothStudioBaseMockupImage,
    printableAreaMask: smoothStudioPrintableAreaMask,
    cameraCutoutOverlay: smoothStudioCameraOverlay,
    shadowLayer: smoothStudioShadowLayer,
    highlightLayer: smoothStudioHighlightLayer
}

const referencePhotoIPhoneTemplate: MockupTemplate = {
    id: REFERENCE_PHOTO_IPHONE_TEMPLATE_ID,
    name: 'Customer-supplied phone-case product photo',
    output,
    sourceCrop: { left: 276, top: 60, width: 1425, height: 1900 },
    artworkPlacement: referencePhotoPlacement,
    supports: variant => Boolean(resolvePhoneModelMockup(variant.phoneModel)),
    baseMockupImage: () => referencePhoto,
    printableAreaMask: referencePhotoPrintableAreaMask,
    materialShadingMask: referencePhotoMaterialShadingMask,
    // The supplied photograph remains the shell/background source. Its fixed
    // camera is covered by full-bleed artwork, then the exact selected model's
    // registered camera layer is composited above it.
    cameraCutoutOverlay: referencePhotoCameraOverlay,
    shadowLayer: transparentReferenceLayer,
    highlightLayer: referencePhotoSurfaceLayer,
    shellFinishLayer: referencePhotoShellFinishLayer
}

// Legacy definitions remain available to old migration code, but all newly
// resolved previews use the supplied-photo shell plus exact model registry.
void puLeatherIPhoneTemplate
void magneticToughCaseTemplate
void genericIPhoneCaseTemplate
void fullBleedStudioIPhoneTemplate
const templates: MockupTemplate[] = [referencePhotoIPhoneTemplate]

export function mockupTemplateIdForVariant(variant: MockupVariantDescriptor) {
    if (variant.mockupTemplateId && templates.some(template => template.id === variant.mockupTemplateId && template.supports(variant))) {
        return variant.mockupTemplateId
    }
    return templates.find(template => template.supports(variant))?.id
}

export function mockupPreviewStatusForVariant(variant: MockupVariantDescriptor): MockupPreviewStatus {
    const configuration = resolvePhoneModelMockup(variant.phoneModel)
    if (!configuration) return { status: 'unsupported-model', requestedPhoneModel: variant.phoneModel }
    const mockupTemplateId = mockupTemplateIdForVariant(variant)
    if (!mockupTemplateId) return { status: 'unsupported-model', requestedPhoneModel: variant.phoneModel }
    return {
        status: 'supported',
        requestedPhoneModel: variant.phoneModel,
        normalizedPhoneModel: configuration.normalizedPhoneModel,
        mockupTemplateId,
        cameraTemplateId: configuration.cameraTemplateId,
        shellTemplateId: configuration.shell.templateId
    }
}

export function getMockupTemplate(variant: MockupVariantDescriptor) {
    const templateId = mockupTemplateIdForVariant(variant)
    const template = templates.find(candidate => candidate.id === templateId)
    if (!template) throw new HttpError(422, `A realistic preview template is not available for ${variant.phoneModel}.`)
    return template
}

export function listMockupTemplates() {
    return templates.map(template => ({ id: template.id, name: template.name, output: template.output }))
}

export async function composeMockupPreview(artwork: Buffer, variant: MockupVariantDescriptor): Promise<ComposedMockup> {
    if (!artwork.length) throw new HttpError(422, 'Printable artwork is unavailable for preview generation.')
    const phoneConfiguration = requirePhoneModelMockup(variant.phoneModel)
    const template = getMockupTemplate(variant)
    const placement = placementForConfiguration(template, phoneConfiguration)
    const { fittedArtwork, review } = await fitArtworkToPrintablePanel(artwork, placement, phoneConfiguration)
    const accent = await artworkAccentColor(fittedArtwork)
    placement.review = review
    const mask = await template.printableAreaMask(variant)
    const materialMask = template.materialShadingMask ? await template.materialShadingMask(variant) : mask
    const clippedArtwork = await sharp(fittedArtwork)
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer()
    let basePipeline = sharp(template.baseMockupImage(variant), { failOn: 'error' })
    if (template.sourceCrop) basePipeline = basePipeline.extract(template.sourceCrop)
    const base = await basePipeline.resize(template.output.width, template.output.height, { fit: 'fill' }).ensureAlpha().png().toBuffer()
    const photographedMaterial = await sharp(base)
        .extract({ left: placement.left, top: placement.top, width: placement.width, height: placement.height })
        .composite([{ input: materialMask, blend: 'dest-in' }])
        .png()
        .toBuffer()
    const bytes = await sharp(base)
        .composite([
            { input: clippedArtwork, left: placement.left, top: placement.top },
            { input: photographedMaterial, left: placement.left, top: placement.top, blend: 'multiply' },
            { input: template.highlightLayer(variant), left: 0, top: 0 },
            ...(template.shellFinishLayer ? [{ input: template.shellFinishLayer(variant, accent), left: 0, top: 0 }] : []),
            { input: template.cameraCutoutOverlay(variant), left: 0, top: 0 },
            { input: template.shadowLayer(variant), left: 0, top: 0 }
        ])
        .png({ compressionLevel: 9 })
        .toBuffer()
    return {
        bytes,
        templateId: template.id,
        placement,
        normalizedPhoneModel: phoneConfiguration.normalizedPhoneModel,
        cameraTemplateId: phoneConfiguration.cameraTemplateId,
        shellTemplateId: phoneConfiguration.shell.templateId,
        placementReview: review
    }
}

export async function createPhoneCaseMockup(artwork: Buffer, phoneModel: string, caseType: string) {
    return (await composeMockupPreview(artwork, { phoneModel, caseType })).bytes
}

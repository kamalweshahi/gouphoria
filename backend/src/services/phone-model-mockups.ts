import HttpError from '../errors/http-error'

export type CameraModuleShape = 'square' | 'vertical-pill' | 'wide-bar' | 'individual-lenses'

export interface CameraPoint {
    x: number
    y: number
}

export interface PhoneCameraGeometry {
    shape: CameraModuleShape
    left: number
    top: number
    width: number
    height: number
    cornerRadius: number
    lenses: Array<CameraPoint & { radius: number }>
    flash: CameraPoint
    sensor?: CameraPoint
}

export interface PhoneShellGeometry {
    templateId: string
    left: number
    top: number
    width: number
    height: number
    cornerRadius: number
    printablePath: string
    bleed: number
    artworkFocalPoint: CameraPoint
    safeArea: { left: number; top: number; width: number; height: number }
    buttonExclusionZones: Array<{
        side: 'left' | 'right'
        top: number
        height: number
        inset: number
    }>
}

export interface PhoneModelMockupConfiguration {
    normalizedPhoneModel: string
    displayName: string
    cameraTemplateId: string
    camera: PhoneCameraGeometry
    shell: PhoneShellGeometry
}

const shellSurface = { left: 0, top: 0, width: 500, height: 1088, cornerRadius: 58 } as const

interface ShellProfile {
    topRadius: number
    bottomRadius: number
    safeTop: number
    safeSide: number
    safeBottom: number
    focalX: number
    focalY: number
}

function shellProfile(profile: ShellProfile): Omit<PhoneShellGeometry, 'templateId'> {
    const width = shellSurface.width
    const height = shellSurface.height
    const right = width
    const bottom = height
    const { topRadius, bottomRadius } = profile
    return {
        ...shellSurface,
        printablePath: `M ${topRadius} 0 H ${right - topRadius} C ${right - 18} 0 ${right} 18 ${right} ${topRadius} L ${right} ${bottom - bottomRadius} C ${right} ${bottom - 20} ${right - 20} ${bottom} ${right - bottomRadius} ${bottom} H ${bottomRadius} C 20 ${bottom} 0 ${bottom - 20} 0 ${bottom - bottomRadius} L 0 ${topRadius} C 0 18 18 0 ${topRadius} 0 Z`,
        bleed: 18,
        artworkFocalPoint: { x: profile.focalX, y: profile.focalY },
        safeArea: {
            left: profile.safeSide,
            top: profile.safeTop,
            width: width - profile.safeSide * 2,
            height: height - profile.safeTop - profile.safeBottom
        },
        buttonExclusionZones: [
            { side: 'left', top: 270, height: 230, inset: 34 },
            { side: 'right', top: 300, height: 190, inset: 34 }
        ]
    }
}

function standardShell() {
    return shellProfile({ topRadius: 54, bottomRadius: 62, safeTop: 270, safeSide: 48, safeBottom: 82, focalX: 0.5, focalY: 0.47 })
}

function plusShell() {
    return shellProfile({ topRadius: 58, bottomRadius: 66, safeTop: 270, safeSide: 50, safeBottom: 88, focalX: 0.5, focalY: 0.47 })
}

function proShell() {
    return shellProfile({ topRadius: 56, bottomRadius: 64, safeTop: 286, safeSide: 52, safeBottom: 84, focalX: 0.5, focalY: 0.47 })
}

function proMaxShell() {
    return shellProfile({ topRadius: 60, bottomRadius: 68, safeTop: 292, safeSide: 54, safeBottom: 90, focalX: 0.5, focalY: 0.47 })
}

function wideCameraShell() {
    return shellProfile({ topRadius: 60, bottomRadius: 68, safeTop: 302, safeSide: 54, safeBottom: 90, focalX: 0.5, focalY: 0.47 })
}

function airShell() {
    return shellProfile({ topRadius: 52, bottomRadius: 60, safeTop: 218, safeSide: 46, safeBottom: 80, focalX: 0.5, focalY: 0.47 })
}

function samsungShell() {
    return shellProfile({ topRadius: 58, bottomRadius: 58, safeTop: 300, safeSide: 50, safeBottom: 84, focalX: 0.5, focalY: 0.47 })
}

function configuration(
    normalizedPhoneModel: string,
    displayName: string,
    camera: PhoneCameraGeometry,
    shell: Omit<PhoneShellGeometry, 'templateId'>
): PhoneModelMockupConfiguration {
    return {
        normalizedPhoneModel,
        displayName,
        cameraTemplateId: `camera-${normalizedPhoneModel}-v1`,
        camera: {
            ...camera,
            lenses: camera.lenses.map(lens => ({ ...lens })),
            flash: { ...camera.flash },
            sensor: camera.sensor ? { ...camera.sensor } : undefined
        },
        shell: {
            templateId: `reference-shell-${normalizedPhoneModel}-v2`,
            ...shell,
            artworkFocalPoint: { ...shell.artworkFocalPoint },
            safeArea: { ...shell.safeArea },
            buttonExclusionZones: shell.buttonExclusionZones.map(zone => ({ ...zone }))
        }
    }
}

function dualVertical(): PhoneCameraGeometry {
    return {
        shape: 'square', left: 34, top: 34, width: 174, height: 190, cornerRadius: 38,
        lenses: [{ x: 55, y: 55, radius: 38 }, { x: 116, y: 133, radius: 38 }],
        flash: { x: 139, y: 54 }
    }
}

function dualSquare(): PhoneCameraGeometry {
    return {
        shape: 'square', left: 34, top: 34, width: 178, height: 184, cornerRadius: 40,
        lenses: [{ x: 56, y: 57, radius: 38 }, { x: 120, y: 128, radius: 38 }],
        flash: { x: 143, y: 55 }
    }
}

function dualDiagonal(): PhoneCameraGeometry {
    return {
        shape: 'square', left: 34, top: 34, width: 178, height: 180, cornerRadius: 40,
        lenses: [{ x: 54, y: 53, radius: 38 }, { x: 124, y: 127, radius: 38 }],
        flash: { x: 143, y: 53 }
    }
}

function tripleSquare(): PhoneCameraGeometry {
    return {
        shape: 'square', left: 32, top: 32, width: 222, height: 218, cornerRadius: 43,
        lenses: [{ x: 62, y: 59, radius: 39 }, { x: 148, y: 88, radius: 39 }, { x: 66, y: 158, radius: 39 }],
        flash: { x: 174, y: 166 },
        sensor: { x: 177, y: 48 }
    }
}

function dualPill(): PhoneCameraGeometry {
    return {
        shape: 'vertical-pill', left: 38, top: 34, width: 96, height: 216, cornerRadius: 48,
        lenses: [{ x: 48, y: 57, radius: 38 }, { x: 48, y: 158, radius: 38 }],
        flash: { x: 78, y: 108 }
    }
}

function singlePill(): PhoneCameraGeometry {
    return {
        shape: 'vertical-pill', left: 38, top: 34, width: 96, height: 134, cornerRadius: 48,
        lenses: [{ x: 48, y: 62, radius: 39 }],
        flash: { x: 48, y: 111 }
    }
}

function wideProBar(): PhoneCameraGeometry {
    return {
        shape: 'wide-bar', left: 28, top: 30, width: 444, height: 214, cornerRadius: 42,
        lenses: [{ x: 67, y: 60, radius: 39 }, { x: 151, y: 91, radius: 39 }, { x: 70, y: 164, radius: 39 }],
        flash: { x: 376, y: 65 },
        sensor: { x: 377, y: 157 }
    }
}

function samsungContourTriple(): PhoneCameraGeometry {
    return {
        shape: 'vertical-pill', left: 34, top: 32, width: 126, height: 258, cornerRadius: 35,
        lenses: [{ x: 55, y: 52, radius: 35 }, { x: 55, y: 129, radius: 35 }, { x: 55, y: 206, radius: 35 }],
        flash: { x: 104, y: 129 }
    }
}

function samsungIndividualTriple(generation: number): PhoneCameraGeometry {
    const horizontalOffset = generation >= 25 ? 3 : generation >= 24 ? 2 : 0
    return {
        shape: 'individual-lenses', left: 34 + horizontalOffset, top: 30, width: 150, height: 270, cornerRadius: 0,
        lenses: [{ x: 47, y: 48, radius: 35 }, { x: 47, y: 132, radius: 35 }, { x: 47, y: 216, radius: 35 }],
        flash: { x: 112, y: 91 }
    }
}

// Each entry is an exact model mapping. No camera layout is inferred from
// partial words such as "Pro" or "Max".
export const PHONE_MODEL_MOCKUP_REGISTRY: Readonly<Record<string, PhoneModelMockupConfiguration>> = Object.freeze({
    'iphone-11': configuration('iphone-11', 'iPhone 11', dualSquare(), standardShell()),
    'iphone-11-pro': configuration('iphone-11-pro', 'iPhone 11 Pro', tripleSquare(), proShell()),
    'iphone-11-pro-max': configuration('iphone-11-pro-max', 'iPhone 11 Pro Max', tripleSquare(), proMaxShell()),
    'iphone-12': configuration('iphone-12', 'iPhone 12', dualVertical(), standardShell()),
    'iphone-12-mini': configuration('iphone-12-mini', 'iPhone 12 Mini', dualVertical(), standardShell()),
    'iphone-12-pro': configuration('iphone-12-pro', 'iPhone 12 Pro', tripleSquare(), proShell()),
    'iphone-12-pro-max': configuration('iphone-12-pro-max', 'iPhone 12 Pro Max', tripleSquare(), proMaxShell()),
    'iphone-13': configuration('iphone-13', 'iPhone 13', dualDiagonal(), standardShell()),
    'iphone-13-mini': configuration('iphone-13-mini', 'iPhone 13 Mini', dualDiagonal(), standardShell()),
    'iphone-13-pro': configuration('iphone-13-pro', 'iPhone 13 Pro', tripleSquare(), proShell()),
    'iphone-13-pro-max': configuration('iphone-13-pro-max', 'iPhone 13 Pro Max', tripleSquare(), proMaxShell()),
    'iphone-14': configuration('iphone-14', 'iPhone 14', dualDiagonal(), standardShell()),
    'iphone-14-plus': configuration('iphone-14-plus', 'iPhone 14 Plus', dualDiagonal(), plusShell()),
    'iphone-14-pro': configuration('iphone-14-pro', 'iPhone 14 Pro', tripleSquare(), proShell()),
    'iphone-14-pro-max': configuration('iphone-14-pro-max', 'iPhone 14 Pro Max', tripleSquare(), proMaxShell()),
    'iphone-15': configuration('iphone-15', 'iPhone 15', dualDiagonal(), standardShell()),
    'iphone-15-plus': configuration('iphone-15-plus', 'iPhone 15 Plus', dualDiagonal(), plusShell()),
    'iphone-15-pro': configuration('iphone-15-pro', 'iPhone 15 Pro', tripleSquare(), proShell()),
    'iphone-15-pro-max': configuration('iphone-15-pro-max', 'iPhone 15 Pro Max', tripleSquare(), proMaxShell()),
    'iphone-16': configuration('iphone-16', 'iPhone 16', dualPill(), standardShell()),
    'iphone-16-plus': configuration('iphone-16-plus', 'iPhone 16 Plus', dualPill(), plusShell()),
    'iphone-16-pro': configuration('iphone-16-pro', 'iPhone 16 Pro', tripleSquare(), proShell()),
    'iphone-16-pro-max': configuration('iphone-16-pro-max', 'iPhone 16 Pro Max', tripleSquare(), proMaxShell()),
    'iphone-17': configuration('iphone-17', 'iPhone 17', dualPill(), standardShell()),
    'iphone-air': configuration('iphone-air', 'iPhone Air', singlePill(), airShell()),
    'iphone-17-air': configuration('iphone-17-air', 'iPhone 17 Air', singlePill(), airShell()),
    'iphone-17-pro': configuration('iphone-17-pro', 'iPhone 17 Pro', wideProBar(), wideCameraShell()),
    'iphone-17-pro-max': configuration('iphone-17-pro-max', 'iPhone 17 Pro Max', wideProBar(), wideCameraShell()),
    'samsung-galaxy-s21': configuration('samsung-galaxy-s21', 'Samsung Galaxy S21', samsungContourTriple(), samsungShell()),
    'samsung-galaxy-s22': configuration('samsung-galaxy-s22', 'Samsung Galaxy S22', samsungContourTriple(), samsungShell()),
    'samsung-galaxy-s23': configuration('samsung-galaxy-s23', 'Samsung Galaxy S23', samsungIndividualTriple(23), samsungShell()),
    'samsung-galaxy-s24': configuration('samsung-galaxy-s24', 'Samsung Galaxy S24', samsungIndividualTriple(24), samsungShell()),
    'samsung-galaxy-s25': configuration('samsung-galaxy-s25', 'Samsung Galaxy S25', samsungIndividualTriple(25), samsungShell()),
    'samsung-galaxy-s26': configuration('samsung-galaxy-s26', 'Samsung Galaxy S26', samsungIndividualTriple(26), samsungShell())
})

const exactModelIdentifiers = new Map(
    Object.values(PHONE_MODEL_MOCKUP_REGISTRY).map(entry => [entry.displayName.toLocaleLowerCase('en-US'), entry.normalizedPhoneModel])
)

export function normalizeMockupPhoneModel(value: string) {
    const exactName = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
    return exactModelIdentifiers.get(exactName)
}

export function resolvePhoneModelMockup(value: string) {
    const normalizedPhoneModel = normalizeMockupPhoneModel(value)
    return normalizedPhoneModel ? PHONE_MODEL_MOCKUP_REGISTRY[normalizedPhoneModel] : undefined
}

export function requirePhoneModelMockup(value: string) {
    const configuration = resolvePhoneModelMockup(value)
    if (!configuration) {
        throw new HttpError(422, `A realistic preview is not supported for the exact phone model "${value}".`)
    }
    return configuration
}

export function listSupportedMockupPhoneModels() {
    return Object.values(PHONE_MODEL_MOCKUP_REGISTRY).map(entry => ({
        normalizedPhoneModel: entry.normalizedPhoneModel,
        displayName: entry.displayName,
        cameraTemplateId: entry.cameraTemplateId,
        shellTemplateId: entry.shell.templateId
    }))
}

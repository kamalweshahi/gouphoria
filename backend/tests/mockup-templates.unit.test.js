const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const sharp = require('sharp')
const {
    composeMockupPreview,
    getMockupTemplate,
    listMockupTemplates,
    mockupPreviewStatusForVariant,
    REFERENCE_PHOTO_IPHONE_TEMPLATE_ID
} = require('../dist/services/mockup-templates')
const {
    PHONE_MODEL_MOCKUP_REGISTRY,
    normalizeMockupPhoneModel,
    resolvePhoneModelMockup
} = require('../dist/services/phone-model-mockups')

test('exact phone-model registry selects generation-specific camera geometry', () => {
    const expected = [
        ['iPhone 14', 'iphone-14', 'square', 2],
        ['iPhone 14 Pro Max', 'iphone-14-pro-max', 'square', 3],
        ['iPhone 15 Pro', 'iphone-15-pro', 'square', 3],
        ['iPhone 16 Pro Max', 'iphone-16-pro-max', 'square', 3],
        ['iPhone 17 Pro', 'iphone-17-pro', 'wide-bar', 3]
    ]
    for (const [displayName, normalized, shape, lensCount] of expected) {
        const configuration = resolvePhoneModelMockup(displayName)
        assert.equal(normalizeMockupPhoneModel(displayName), normalized)
        assert.equal(configuration.normalizedPhoneModel, normalized)
        assert.equal(configuration.camera.shape, shape)
        assert.equal(configuration.camera.lenses.length, lensCount)
        assert.equal(configuration.cameraTemplateId, `camera-${normalized}-v1`)
        assert.equal(configuration.shell.templateId, `reference-shell-${normalized}-v2`)
        assert.match(configuration.shell.printablePath, /^M /)
        assert.equal(configuration.shell.printablePath.includes('<rect'), false)
        assert.equal(configuration.shell.safeArea.width < configuration.shell.width, true)
        assert.equal(configuration.shell.safeArea.height < configuration.shell.height, true)
        assert.equal(configuration.shell.bleed > 0, true)
    }
    assert.equal(PHONE_MODEL_MOCKUP_REGISTRY['iphone-14-pro-max'].camera.width < 300, true)
    assert.equal(PHONE_MODEL_MOCKUP_REGISTRY['iphone-17-pro'].camera.width > PHONE_MODEL_MOCKUP_REGISTRY['iphone-17-pro'].camera.height * 2, true)
    assert.equal(PHONE_MODEL_MOCKUP_REGISTRY['iphone-16'].camera.shape, 'vertical-pill')
    assert.equal(PHONE_MODEL_MOCKUP_REGISTRY['iphone-air'].camera.lenses.length, 1)
    assert.notDeepEqual(
        PHONE_MODEL_MOCKUP_REGISTRY['iphone-14'].shell.safeArea,
        PHONE_MODEL_MOCKUP_REGISTRY['iphone-14-pro-max'].shell.safeArea
    )
    assert.deepEqual(PHONE_MODEL_MOCKUP_REGISTRY['iphone-14-pro-max'].camera, {
        shape: 'square', left: 32, top: 32, width: 222, height: 218, cornerRadius: 43,
        lenses: [{ x: 62, y: 59, radius: 39 }, { x: 148, y: 88, radius: 39 }, { x: 66, y: 158, radius: 39 }],
        flash: { x: 174, y: 166 }, sensor: { x: 177, y: 48 }
    })
    assert.deepEqual(PHONE_MODEL_MOCKUP_REGISTRY['iphone-17-pro'].camera, {
        shape: 'wide-bar', left: 28, top: 30, width: 444, height: 214, cornerRadius: 42,
        lenses: [{ x: 67, y: 60, radius: 39 }, { x: 151, y: 91, radius: 39 }, { x: 70, y: 164, radius: 39 }],
        flash: { x: 376, y: 65 }, sensor: { x: 377, y: 157 }
    })
})

test('every currently offered iPhone and Samsung model has an exact camera template', () => {
    const catalogModels = [
        'iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max',
        'iPhone 12', 'iPhone 12 Mini', 'iPhone 12 Pro', 'iPhone 12 Pro Max',
        'iPhone 13', 'iPhone 13 Mini', 'iPhone 13 Pro', 'iPhone 13 Pro Max',
        'iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max',
        'iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max',
        'iPhone 16', 'iPhone 16 Plus', 'iPhone 16 Pro', 'iPhone 16 Pro Max',
        'iPhone 17', 'iPhone 17 Air', 'iPhone 17 Pro', 'iPhone 17 Pro Max',
        'Samsung Galaxy S21', 'Samsung Galaxy S22', 'Samsung Galaxy S23',
        'Samsung Galaxy S24', 'Samsung Galaxy S25', 'Samsung Galaxy S26'
    ]
    for (const phoneModel of catalogModels) {
        const configuration = resolvePhoneModelMockup(phoneModel)
        assert.ok(configuration, `${phoneModel} should have an exact mockup configuration`)
        assert.equal(configuration.displayName, phoneModel)
        assert.match(configuration.cameraTemplateId, /^camera-/)
    }

    assert.equal(resolvePhoneModelMockup('Samsung Galaxy S21').camera.shape, 'vertical-pill')
    assert.equal(resolvePhoneModelMockup('Samsung Galaxy S24').camera.shape, 'individual-lenses')
    assert.equal(resolvePhoneModelMockup('Samsung Galaxy S24').camera.lenses.length, 3)
    assert.notEqual(
        resolvePhoneModelMockup('Samsung Galaxy S24').cameraTemplateId,
        resolvePhoneModelMockup('iPhone 14 Pro Max').cameraTemplateId
    )
})

test('model resolution never infers a camera from partial Pro or Max words', () => {
    assert.equal(resolvePhoneModelMockup('iPhone 14 Pro Max').normalizedPhoneModel, 'iphone-14-pro-max')
    assert.equal(resolvePhoneModelMockup('  iPhone   14 Pro Max  ').normalizedPhoneModel, 'iphone-14-pro-max')
    assert.equal(resolvePhoneModelMockup('iPhone 14 Pro Max Case'), undefined)
    assert.equal(resolvePhoneModelMockup('Mystery Pro Max'), undefined)
    assert.deepEqual(mockupPreviewStatusForVariant({ phoneModel: 'Mystery Pro Max', caseType: 'Glossy' }), {
        status: 'unsupported-model',
        requestedPhoneModel: 'Mystery Pro Max'
    })
})

test('realistic template composition preserves artwork and protects the camera opening', async () => {
    const artwork = await sharp({
        create: { width: 600, height: 1000, channels: 4, background: { r: 238, g: 24, b: 34, alpha: 1 } }
    }).png().toBuffer()
    const beforeHash = createHash('sha256').update(artwork).digest('hex')
    const variant = { phoneModel: 'iPhone 15 Pro', caseType: 'Midnight Navy', productTitle: 'Custom phone case' }
    const template = getMockupTemplate(variant)

    assert.equal(template.id, REFERENCE_PHOTO_IPHONE_TEMPLATE_ID)
    assert.equal(
        createHash('sha256').update(template.baseMockupImage(variant)).digest('hex'),
        '6e7ef75e12c24a4555f2ad801a1036e52182b26307a63e6d81959b68f1aec5ef',
        'the supplied customer reference photo must remain the template source'
    )
    assert.deepEqual(Object.keys(template).filter(key => /Image|Mask|Overlay|Layer/.test(key)).sort(), [
        'baseMockupImage', 'cameraCutoutOverlay', 'highlightLayer', 'materialShadingMask', 'printableAreaMask', 'shadowLayer', 'shellFinishLayer'
    ])
    assert.equal(listMockupTemplates().length >= 1, true)

    const result = await composeMockupPreview(artwork, variant)
    assert.equal(createHash('sha256').update(artwork).digest('hex'), beforeHash)
    assert.notEqual(createHash('sha256').update(result.bytes).digest('hex'), beforeHash)
    assert.equal(result.templateId, REFERENCE_PHOTO_IPHONE_TEMPLATE_ID)
    assert.equal(result.normalizedPhoneModel, 'iphone-15-pro')
    assert.equal(result.cameraTemplateId, 'camera-iphone-15-pro-v1')
    assert.equal(result.shellTemplateId, 'reference-shell-iphone-15-pro-v2')
    assert.equal(result.placement.fit, 'cover')
    assert.equal(result.placement.crop.left > 0, true)
    assert.equal(result.placement.crop.width < result.placement.width, true)
    assert.equal(result.placement.perspectiveCorners.length, 4)
    assert.equal(result.placement.bleed, 18)
    assert.equal(result.placement.printableMaskId, 'reference-shell-iphone-15-pro-v2')
    assert.deepEqual(result.placement.safeArea, { left: 52, top: 286, width: 396, height: 718 })
    assert.equal(result.placement.buttonExclusionZones.length, 2)
    assert.equal(result.placementReview.status, 'ready')
    const metadata = await sharp(result.bytes).metadata()
    assert.equal(metadata.width, 900)
    assert.equal(metadata.height, 1200)

    const { data, info } = await sharp(result.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const pixel = (x, y) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 4))
    const artworkPixel = pixel(450, 620)
    const leftBleedPixel = pixel(225, 700)
    const rightBleedPixel = pixel(680, 700)
    const bottomBleedPixel = pixel(450, 1120)
    const topRightBleedPixel = pixel(685, 90)
    const roundedCornerOutsidePixel = pixel(222, 50)
    const cameraLensPixel = pixel(314, 139)
    const studioBackgroundPixel = pixel(30, 30)
    assert.equal(artworkPixel[0] > artworkPixel[1] * 2, true, 'artwork should cover the printable case area')
    assert.equal(leftBleedPixel[0] > leftBleedPixel[1] * 2, true, 'artwork should bleed to the left physical rim')
    assert.equal(rightBleedPixel[0] > rightBleedPixel[1] * 2, true, 'artwork should bleed to the right physical rim')
    assert.equal(bottomBleedPixel[0] > bottomBleedPixel[1] * 2, true, 'artwork should bleed to the bottom physical rim')
    assert.equal(topRightBleedPixel[0] > topRightBleedPixel[1] * 2, true, 'artwork should cover the top panel outside the camera')
    assert.equal(roundedCornerOutsidePixel[0] > roundedCornerOutsidePixel[1] * 2, false, 'artwork must follow the rounded panel corner')
    assert.equal(cameraLensPixel[0] < 100 && cameraLensPixel[1] < 120, true, 'camera lens must remain visible above artwork')
    assert.equal(studioBackgroundPixel[0] > 245 && studioBackgroundPixel[1] > 245, true, 'the supplied reference-photo background must remain visible')

    const highlights = template.highlightLayer(variant).toString('utf8')
    assert.equal(/stitch|dasharray|leather/i.test(highlights), false)
    assert.equal(/stroke-width="12"/.test(highlights), false)
    const cameraOverlay = template.cameraCutoutOverlay(variant).toString('utf8')
    assert.match(cameraOverlay, /data-normalized-phone-model="iphone-15-pro"/)
    assert.match(cameraOverlay, /data-camera-template-id="camera-iphone-15-pro-v1"/)
    assert.equal((cameraOverlay.match(/data-lens-index=/g) ?? []).length, 3)
    const surfaceLayer = template.highlightLayer(variant).toString('utf8')
    assert.match(surfaceLayer, /clipPath id="printable-panel"/)
    assert.match(surfaceLayer, /data-surface-template-id="reference-shell-iphone-15-pro-v2"/)
    assert.match(surfaceLayer, /matte-texture/)
    const shellFinish = template.shellFinishLayer(variant, {
        red: 238,
        green: 24,
        blue: 34,
        css: 'rgb(238 24 34)',
        lightCss: 'rgb(244 103 109)',
        darkCss: 'rgb(138 14 20)'
    }).toString('utf8')
    assert.match(shellFinish, /data-shell-finish-template-id="reference-shell-iphone-15-pro-v2"/)
    assert.match(shellFinish, /data-artwork-accent="238,24,34"/)
    assert.match(shellFinish, /premium-product-shadow/)
    assert.match(shellFinish, /mask id="physical-rim"/)

    const basePipeline = sharp(template.baseMockupImage(variant), { failOn: 'error' })
    if (template.sourceCrop) basePipeline.extract(template.sourceCrop)
    const base = await basePipeline.resize(900, 1200, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const baseButtonOffset = (400 * base.info.width + 739) * base.info.channels
    const outputButtonOffset = (400 * info.width + 739) * info.channels
    const outputButton = Array.from(data.subarray(outputButtonOffset, outputButtonOffset + 4))
    const baseButton = Array.from(base.data.subarray(baseButtonOffset, baseButtonOffset + 4))
    assert.equal(
        outputButton.slice(0, 3).every((channel, index) => Math.abs(channel - baseButton[index]) <= 3),
        true,
        'the physical side button may receive the product shadow but must remain separate from artwork'
    )
})

test('extreme artwork uses proportional cover crop and is flagged instead of being altered', async () => {
    const panoramic = await sharp({ create: { width: 2400, height: 300, channels: 3, background: '#7c35b8' } }).png().toBuffer()
    const beforeHash = createHash('sha256').update(panoramic).digest('hex')
    const result = await composeMockupPreview(panoramic, { phoneModel: 'iPhone 16 Pro Max', caseType: 'Glossy' })
    assert.equal(createHash('sha256').update(panoramic).digest('hex'), beforeHash)
    assert.equal(result.placement.fit, 'cover')
    assert.equal(result.placementReview.status, 'needs-review')
    assert.equal(result.placementReview.reasons.includes('substantial-cover-crop'), true)
    assert.equal(result.placementReview.horizontalCropRatio > 0.8, true)
    assert.equal(result.placementReview.verticalCropRatio, 0)
})

test('cover crop keeps central artwork visually centered after bleed extraction', async () => {
    const yellowPanel = await sharp({ create: { width: 600, height: 420, channels: 3, background: '#ffd65a' } }).png().toBuffer()
    const greenCenter = await sharp({ create: { width: 320, height: 220, channels: 3, background: '#31a66a' } }).png().toBuffer()
    const artwork = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: '#2d65b5' } })
        .composite([{ input: yellowPanel, left: 212, top: 540 }, { input: greenCenter, left: 352, top: 640 }])
        .png()
        .toBuffer()
    const result = await composeMockupPreview(artwork, { phoneModel: 'iPhone 14 Pro Max', caseType: 'Glossy' })
    const { data, info } = await sharp(result.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const pixel = (x, y) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3))
    const leftPanel = pixel(275, 550)
    const center = pixel(470, 550)
    const rightPanel = pixel(665, 550)
    assert.equal(leftPanel[0] > 180 && leftPanel[1] > 140 && leftPanel[2] < 150, true)
    assert.equal(center[1] > center[0] && center[1] > center[2], true)
    assert.equal(rightPanel[0] > 180 && rightPanel[1] > 140 && rightPanel[2] < 150, true)
})

test('iPhone 14 Pro Max and iPhone 17 Pro compose different validated camera templates', async () => {
    const artwork = await sharp({ create: { width: 600, height: 1000, channels: 4, background: '#275ea8' } }).png().toBuffer()
    const traditional = await composeMockupPreview(artwork, { phoneModel: 'iPhone 14 Pro Max', caseType: 'Glossy' })
    const wide = await composeMockupPreview(artwork, { phoneModel: 'iPhone 17 Pro', caseType: 'Glossy' })
    assert.equal(traditional.cameraTemplateId, 'camera-iphone-14-pro-max-v1')
    assert.equal(wide.cameraTemplateId, 'camera-iphone-17-pro-v1')
    assert.notEqual(createHash('sha256').update(traditional.bytes).digest('hex'), createHash('sha256').update(wide.bytes).digest('hex'))
})

test('Samsung artwork receives the selected Galaxy camera frame without an iPhone fallback', async () => {
    const artwork = await sharp({ create: { width: 900, height: 1500, channels: 4, background: '#356aa4' } }).png().toBuffer()
    const result = await composeMockupPreview(artwork, { phoneModel: 'Samsung Galaxy S24', caseType: 'Glossy' })
    assert.equal(result.normalizedPhoneModel, 'samsung-galaxy-s24')
    assert.equal(result.cameraTemplateId, 'camera-samsung-galaxy-s24-v1')
    assert.equal(result.shellTemplateId, 'reference-shell-samsung-galaxy-s24-v2')

    const template = getMockupTemplate({ phoneModel: 'Samsung Galaxy S24', caseType: 'Glossy' })
    const overlay = template.cameraCutoutOverlay({ phoneModel: 'Samsung Galaxy S24', caseType: 'Glossy' }).toString('utf8')
    assert.match(overlay, /data-normalized-phone-model="samsung-galaxy-s24"/)
    assert.equal((overlay.match(/data-lens-index=/g) ?? []).length, 3)
    assert.doesNotMatch(overlay, /camera-iphone-/)
})

test('unsupported models fail safely instead of receiving a fictional template', async () => {
    const artwork = await sharp({ create: { width: 20, height: 20, channels: 4, background: '#fff' } }).png().toBuffer()
    await assert.rejects(composeMockupPreview(artwork, { phoneModel: 'Unsupported Phone 99', caseType: 'Glossy' }), /not supported for the exact phone model/i)
})

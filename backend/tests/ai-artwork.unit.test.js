const { test } = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const {
    PHONE_CASE_ARTWORK_HEIGHT,
    PHONE_CASE_ARTWORK_WIDTH,
    PHONE_CASE_PROVIDER_SIZE,
    PHONE_CASE_SAFE_AREA,
    buildPhoneCaseArtworkPrompt,
    validateGeneratedPhoneCaseArtwork
} = require('../dist/services/ai-artwork')

async function solidArtwork(width = PHONE_CASE_ARTWORK_WIDTH, height = PHONE_CASE_ARTWORK_HEIGHT) {
    return sharp({
        create: { width, height, channels: 3, background: { r: 34, g: 82, b: 151 } }
    }).png().toBuffer()
}

test('phone-case prompt adds private composition constraints without changing the customer request', () => {
    const customerPrompt = 'A cinematic cedar forest with a small gold title'
    const prompt = buildPhoneCaseArtworkPrompt({ userPrompt: customerPrompt, phoneModel: 'iPhone 16 Pro' })

    assert.ok(prompt.startsWith(customerPrompt))
    assert.match(prompt, /flat, print-ready artwork only/i)
    assert.match(prompt, /2:3 aspect ratio/)
    assert.match(prompt, /1024 × 1536/)
    assert.match(prompt, /central safe area/i)
    assert.match(prompt, /12%–88% horizontally and 32%–88% vertically/)
    assert.match(prompt, /upper 30% as the camera and top-corner reserve/i)
    assert.match(prompt, /breathing room at both side edges and the bottom edge/i)
    assert.match(prompt, /do not show a phone, phone case, product mockup/i)
    assert.match(prompt, /never add white borders, blank margins, poster edges, or framing/i)
    assert.match(prompt, /natural lighting, believable materials/i)
    assert.match(prompt, /obvious AI artifacts/i)
    assert.match(prompt, /large, correctly spelled, readable, centered/i)
    assert.match(prompt, /iPhone 16 Pro/)
    assert.equal(PHONE_CASE_PROVIDER_SIZE, '1024x1536')
    assert.deepEqual(PHONE_CASE_SAFE_AREA, {
        left: 0.12,
        right: 0.88,
        top: 0.32,
        bottom: 0.88,
        cameraReserveBottom: 0.30
    })
})

test('revision prompt preserves the original concept and receives the same hidden print constraints', () => {
    const prompt = buildPhoneCaseArtworkPrompt({
        userPrompt: 'A realistic desert sunrise',
        revisionInstructions: 'Make the sky warmer',
        phoneModel: 'iPhone 15'
    })
    assert.match(prompt, /Original design request:\nA realistic desert sunrise/)
    assert.match(prompt, /Revision instructions:\nMake the sky warmer/)
    assert.match(prompt, /current artwork as the primary source/i)
    assert.match(prompt, /flat, print-ready artwork only/i)
})

test('print-ready artwork passes aspect, resolution, border, and declared content guardrails', async () => {
    const inspection = await validateGeneratedPhoneCaseArtwork(await solidArtwork())
    assert.equal(inspection.width, 1024)
    assert.equal(inspection.height, 1536)
    assert.equal(inspection.aspectRatioSatisfied, true)
    assert.equal(inspection.minimumResolutionSatisfied, true)
    assert.equal(inspection.visibleBorderDetected, false)
    assert.deepEqual(inspection.safeArea, PHONE_CASE_SAFE_AREA)
    assert.equal(inspection.contentGuardrails.includes('flat-artwork-only'), true)
    assert.equal(inspection.contentGuardrails.includes('no-phone-mockup'), true)
})

test('artwork below print resolution is rejected', async () => {
    await assert.rejects(
        validateGeneratedPhoneCaseArtwork(await solidArtwork(512, 768)),
        /below the required 1024 × 1536 print resolution/i
    )
})

test('artwork with the wrong phone-case aspect ratio is rejected', async () => {
    await assert.rejects(
        validateGeneratedPhoneCaseArtwork(await solidArtwork(1536, 1536)),
        /required vertical phone-case aspect ratio/i
    )
})

test('artwork with an obvious built-in white frame is rejected', async () => {
    const inset = await sharp({
        create: { width: 884, height: 1396, channels: 3, background: { r: 25, g: 75, b: 150 } }
    }).png().toBuffer()
    const framed = await sharp({
        create: { width: 1024, height: 1536, channels: 3, background: { r: 255, g: 255, b: 255 } }
    }).composite([{ input: inset, left: 70, top: 70 }]).png().toBuffer()

    await assert.rejects(validateGeneratedPhoneCaseArtwork(framed), /visible border or frame/i)
})

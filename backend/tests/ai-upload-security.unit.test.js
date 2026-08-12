const test = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const { AI_REFERENCE_HEIGHT, AI_REFERENCE_WIDTH, validateUploadedImage } = require('../dist/services/ai-images')
const { LocalPrivateStorage } = require('../dist/services/ai-storage')

function uploadFile(buffer, filename = 'reference.png', type = 'image/png') {
    return {
        fieldname: 'images',
        originalname: filename,
        encoding: '7bit',
        mimetype: type,
        size: buffer.length,
        buffer
    }
}

test('AI upload validation rejects spoofed, malformed, unsafe, and oversized images', async t => {
    const png = await sharp({
        create: {
            width: 256,
            height: 384,
            channels: 4,
            background: { r: 18, g: 72, b: 140, alpha: 1 }
        }
    }).withMetadata({ density: 144 }).png().toBuffer()

    await t.test('portrait phone images are oriented, normalized, and stripped of metadata', async () => {
        const validated = await validateUploadedImage(uploadFile(png))
        assert.equal(validated.mimeType, 'image/jpeg')
        assert.equal(validated.extension, 'jpg')
        assert.equal(validated.originalWidth, 256)
        assert.equal(validated.originalHeight, 384)
        assert.equal(validated.width, AI_REFERENCE_WIDTH)
        assert.equal(validated.height, AI_REFERENCE_HEIGHT)
        assert.match(validated.checksumSha256, /^[a-f0-9]{64}$/)
        const metadata = await sharp(validated.sanitizedBytes).metadata()
        assert.equal(metadata.width, 1024)
        assert.equal(metadata.height, 1536)
        assert.equal(metadata.exif, undefined)
        assert.equal(metadata.icc, undefined)
    })

    await t.test('large landscape phone photos are resized without stretching', async () => {
        const landscape = await sharp({ create: { width: 4032, height: 3024, channels: 3, background: '#285a90' } }).jpeg().toBuffer()
        const validated = await validateUploadedImage(uploadFile(landscape, 'camera.jpg', 'image/jpeg'))
        assert.equal(validated.originalWidth, 4032)
        assert.equal(validated.originalHeight, 3024)
        assert.equal(validated.width, 1024)
        assert.equal(validated.height, 1536)
        assert.ok(validated.sanitizedBytes.length < landscape.length)
    })

    await t.test('filename, MIME type, and signature must agree', async () => {
        await assert.rejects(
            validateUploadedImage(uploadFile(png, 'spoofed.jpg', 'image/jpeg')),
            /does not match/i
        )
        await assert.rejects(
            validateUploadedImage(uploadFile(Buffer.from('not-an-image'), 'fake.png', 'image/png')),
            /valid PNG/i
        )
        await assert.rejects(
            validateUploadedImage(uploadFile(Buffer.alloc(0), 'empty.png', 'image/png')),
            /valid image/i
        )
        await assert.rejects(
            validateUploadedImage(uploadFile(Buffer.concat([
                Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
                Buffer.from('corrupt')
            ]), 'corrupt.png', 'image/png')),
            /malformed or unreadable/i
        )
        await assert.rejects(
            validateUploadedImage(uploadFile(png, '../unsafe.svg', 'image/svg+xml')),
            /filename must end/i
        )
    })

    await t.test('dimensions and pixel count are bounded before storage', async () => {
        const tiny = await sharp({
            create: { width: 32, height: 32, channels: 3, background: 'red' }
        }).png().toBuffer()
        await assert.rejects(validateUploadedImage(uploadFile(tiny)), /unsupported dimensions/i)

        const previousMaxPixels = process.env.AI_UPLOAD_MAX_PIXELS
        process.env.AI_UPLOAD_MAX_PIXELS = '1000000'
        try {
            const tooManyPixels = await sharp({
                create: { width: 1100, height: 1100, channels: 3, background: 'blue' }
            }).png().toBuffer()
            await assert.rejects(validateUploadedImage(uploadFile(tooManyPixels)), /malformed|unsupported dimensions/i)
        } finally {
            if (previousMaxPixels === undefined) delete process.env.AI_UPLOAD_MAX_PIXELS
            else process.env.AI_UPLOAD_MAX_PIXELS = previousMaxPixels
        }
    })

    await t.test('private storage refuses traversal and unsupported extensions', async () => {
        const storage = new LocalPrivateStorage()
        assert.throws(() => storage.read('../outside.png'), /Invalid private storage key/)
        await assert.rejects(storage.write('uploads', png, 'svg'), /Invalid private image extension/)
        await assert.rejects(storage.write('../uploads', png, 'png'), /Invalid private storage namespace/)
    })
})

const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash, randomUUID } = require('node:crypto')
const mysql = require('mysql2/promise')
const sharp = require('sharp')
const { connectDatabase, disconnectDatabase } = require('../dist/database/database')
const {
    AIDesign,
    AIGeneration,
    CreditAccount,
    CreditTransaction,
    Product,
    ProductVariant,
    UploadedImage
} = require('../dist/database/models')
const {
    addAIDesignUploads,
    assertAIDesignTransition,
    changeAIDesignVariant,
    createAIDesign,
    generateInitialArtwork,
    reviseArtwork
} = require('../dist/services/ai-designs')
const { privateStorage } = require('../dist/services/ai-storage')

const baseUrl = process.env.AI_TEST_BASE_URL || 'http://localhost:3000'
const password = 'PhaseSix9Secure'
const createdUserIds = []
const localStorageKeys = []

async function databaseConnection() {
    return mysql.createConnection({
        host: process.env.DB_HOST || 'mysql',
        port: Number(process.env.DB_PORT || 3306),
        database: process.env.DB_NAME || 'case_store',
        user: process.env.DB_USER || 'case_store',
        password: process.env.DB_PASSWORD || 'case_store_dev'
    })
}

async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) }
    let body
    if (options.json !== undefined) {
        headers['content-type'] = 'application/json'
        body = JSON.stringify(options.json)
    } else if (options.form) {
        body = options.form
    }
    if (options.cookie) headers.cookie = options.cookie
    const response = await fetch(`${baseUrl}${path}`, { method: options.method || 'GET', headers, body })
    const contentType = response.headers.get('content-type') || ''
    const responseBody = contentType.includes('application/json') ? await response.json() : await response.arrayBuffer()
    return { response, body: responseBody }
}

async function register(label) {
    const email = `phase6-${label}-${Date.now()}-${randomUUID().slice(0, 6)}@example.com`
    const result = await request('/auth/register', {
        method: 'POST',
        json: { name: `Phase 6 ${label}`, email, password, confirmPassword: password }
    })
    assert.equal(result.response.status, 201)
    createdUserIds.push(result.body.user.id)
    return { user: result.body.user, cookie: result.response.headers.get('set-cookie').split(';')[0] }
}

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

function uploadForm(files) {
    const form = new FormData()
    for (const file of files) form.append('images', new Blob([file.buffer], { type: file.type }), file.name)
    return form
}

class MemoryStorage {
    constructor() { this.assets = new Map(); this.counter = 0; this.prefix = randomUUID() }
    async write(namespace, bytes, extension) {
        const key = `${namespace}/${this.prefix}-memory-${++this.counter}.${extension}`
        this.assets.set(key, Buffer.from(bytes))
        return key
    }
    async read(key) {
        const value = this.assets.get(key)
        if (!value) throw new Error(`Missing memory asset ${key}`)
        return Buffer.from(value)
    }
    async remove(key) { this.assets.delete(key) }
}

class FakeProvider {
    constructor(bytes, options = {}) {
        this.bytes = bytes
        this.options = options
        this.generateCalls = 0
        this.reviseCalls = 0
        this.moderationPrompt = undefined
        this.generatePrompt = undefined
        this.revisePrompt = undefined
    }
    async moderate(prompt) {
        this.moderationPrompt = prompt
        return { flagged: Boolean(this.options.flagged) }
    }
    async generate(prompt) {
        this.generatePrompt = prompt
        this.generateCalls += 1
        if (this.options.failGenerate) throw new Error('deterministic temporary provider failure')
        return { bytes: this.bytes, provider: 'deterministic', model: 'phase6-test', requestId: 'test-initial', metadata: { usage: { test: true } } }
    }
    async revise(prompt) {
        this.revisePrompt = prompt
        this.reviseCalls += 1
        if (this.options.failRevision) throw new Error('deterministic revision failure')
        return { bytes: this.bytes, provider: 'deterministic', model: 'phase6-test', requestId: 'test-revision' }
    }
}

let owner
let outsider
let product
let variant
let alternativeVariant
let png
let originalProductConfiguration
let originalVariantStorefrontEnabled
let originalAlternativeVariantStorefrontEnabled

before(async () => {
    process.env.DB_ENABLED = 'true'
    process.env.DB_REQUIRED = 'true'
    await connectDatabase()
    owner = await register('owner')
    outsider = await register('outsider')
    const products = await Product.findAll({
        where: { status: 'active', visible: true },
        include: [{ model: ProductVariant, where: { available: true, isEnabled: true }, required: true }]
    })
    product = products.find(value => /^\d+$/.test(value.blueprintId || '') && /^\d+$/.test(value.printProviderId || '')
        && (value.variants ?? []).some(candidate => candidate.phoneModel === 'iPhone 14 Pro Max' && /^\d+$/.test(candidate.printifyVariantId))
        && (value.variants ?? []).some(candidate => candidate.phoneModel === 'iPhone 17 Pro' && /^\d+$/.test(candidate.printifyVariantId)))
    variant = product?.variants?.find(value => value.phoneModel === 'iPhone 14 Pro Max' && /^\d+$/.test(value.printifyVariantId))
    alternativeVariant = product?.variants?.find(value => value.phoneModel === 'iPhone 17 Pro' && /^\d+$/.test(value.printifyVariantId))
    assert.ok(product && variant && alternativeVariant)
    originalProductConfiguration = {
        isVisible: product.isVisible,
        isActive: product.isActive,
        allowAiCustomization: product.allowAiCustomization
    }
    originalVariantStorefrontEnabled = variant.isStorefrontEnabled
    originalAlternativeVariantStorefrontEnabled = alternativeVariant.isStorefrontEnabled
    await product.update({ isVisible: true, isActive: true, allowAiCustomization: true })
    await variant.update({ isStorefrontEnabled: true })
    await alternativeVariant.update({ isStorefrontEnabled: true })
    png = await sharp({ create: { width: 1024, height: 1536, channels: 4, background: { r: 30, g: 80, b: 160, alpha: 1 } } }).png().toBuffer()
})

after(async () => {
    const database = await databaseConnection()
    if (createdUserIds.length) {
        const placeholders = createdUserIds.map(() => '?').join(',')
        const [uploads] = await database.execute(`SELECT storage_key FROM uploaded_images WHERE user_id IN (${placeholders})`, createdUserIds)
        const [designAssets] = await database.execute(`SELECT original_artwork_key,current_artwork_key,mockup_key FROM ai_designs WHERE user_id IN (${placeholders})`, createdUserIds)
        for (const row of uploads) localStorageKeys.push(row.storage_key)
        for (const row of designAssets) localStorageKeys.push(row.original_artwork_key, row.current_artwork_key, row.mockup_key)
        await database.execute(`DELETE FROM commerce_audits WHERE actor_user_id IN (${placeholders}) OR ai_design_id IN (SELECT id FROM ai_designs WHERE user_id IN (${placeholders}))`, [...createdUserIds, ...createdUserIds])
        await database.execute(`DELETE FROM uploaded_images WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM credit_transactions WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM ai_generations WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM ai_designs WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM user_sessions WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM credit_accounts WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds)
    }
    await database.end()
    await Promise.all(localStorageKeys.filter(Boolean).map(key => privateStorage.remove(key)))
    if (product && originalProductConfiguration) await product.update(originalProductConfiguration)
    if (variant && originalVariantStorefrontEnabled !== undefined) {
        await variant.update({ isStorefrontEnabled: originalVariantStorefrontEnabled })
    }
    if (alternativeVariant && originalAlternativeVariantStorefrontEnabled !== undefined) {
        await alternativeVariant.update({ isStorefrontEnabled: originalAlternativeVariantStorefrontEnabled })
    }
    await disconnectDatabase()
})

test('AI design generation, private uploads, credits, idempotency, and ownership', async t => {
    await t.test('anonymous access is rejected and project input is backend validated', async () => {
        const anonymous = await request('/ai/designs')
        assert.equal(anonymous.response.status, 401)

        const missingRights = await request('/ai/designs', {
            method: 'POST', cookie: owner.cookie,
            json: { productId: product.printifyProductId, variantId: variant.printifyVariantId, prompt: 'A meaningful midnight garden design', ownershipConfirmed: false }
        })
        assert.equal(missingRights.response.status, 422)
        assert.match(missingRights.body.message, /own the rights/i)

        for (const prompt of ['', 'too short', 'x'.repeat(1001)]) {
            const invalidPrompt = await request('/ai/designs', {
                method: 'POST', cookie: owner.cookie,
                json: { productId: product.printifyProductId, variantId: variant.printifyVariantId, prompt, ownershipConfirmed: true }
            })
            assert.equal(invalidPrompt.response.status, 422)
        }

        const invalidCombination = await request('/ai/designs', {
            method: 'POST', cookie: owner.cookie,
            json: { productId: product.printifyProductId, variantId: '999999999', prompt: 'A meaningful midnight garden design', ownershipConfirmed: true }
        })
        assert.equal(invalidCombination.response.status, 422)
        assert.match(invalidCombination.body.message, /available phone model/i)
    })

    let apiDesign
    await t.test('valid project creation and strict private upload validation', async () => {
        const created = await request('/ai/designs', {
            method: 'POST', cookie: owner.cookie,
            json: {
                productId: product.printifyProductId,
                variantId: variant.printifyVariantId,
                prompt: 'A luminous blue botanical pattern with silver moths',
                ownershipConfirmed: true
            }
        })
        assert.equal(created.response.status, 201)
        apiDesign = created.body.design
        assert.equal(apiDesign.ownershipConfirmed, true)
        assert.equal(apiDesign.variant.id, variant.printifyVariantId)

        const unsupported = await request(`/ai/designs/${apiDesign.id}/uploads`, {
            method: 'POST', cookie: owner.cookie,
            form: uploadForm([{ buffer: Buffer.from('not an image'), name: 'notes.txt', type: 'text/plain' }])
        })
        assert.equal(unsupported.response.status, 422)

        const mismatch = await request(`/ai/designs/${apiDesign.id}/uploads`, {
            method: 'POST', cookie: owner.cookie,
            form: uploadForm([{ buffer: png, name: 'fake.jpg', type: 'image/jpeg' }])
        })
        assert.equal(mismatch.response.status, 422)
        assert.match(mismatch.body.message, /does not match/i)

        const oversized = Buffer.alloc(25 * 1024 * 1024 + 1)
        png.copy(oversized, 0, 0, Math.min(png.length, oversized.length))
        const tooLarge = await request(`/ai/designs/${apiDesign.id}/uploads`, {
            method: 'POST', cookie: owner.cookie,
            form: uploadForm([{ buffer: oversized, name: 'large.png', type: 'image/png' }])
        })
        assert.equal(tooLarge.response.status, 413)

        const valid = await request(`/ai/designs/${apiDesign.id}/uploads`, {
            method: 'POST', cookie: owner.cookie,
            form: uploadForm([{ buffer: png, name: 'real-reference.png', type: 'image/png' }])
        })
        assert.equal(valid.response.status, 201)
        assert.equal(valid.body.design.uploads.length, 1)
        assert.equal('storageKey' in valid.body.design.uploads[0], false)

        const tooMany = await request(`/ai/designs/${apiDesign.id}/uploads`, {
            method: 'POST', cookie: owner.cookie,
            form: uploadForm([
                { buffer: png, name: 'second.png', type: 'image/png' },
                { buffer: png, name: 'third.png', type: 'image/png' }
            ])
        })
        assert.equal(tooMany.response.status, 422)
        assert.match(tooMany.body.message, /up to 2/i)
    })

    await t.test('a failed multi-file upload leaves no database rows or storage orphans', async () => {
        const project = await createAIDesign(owner.user.id, {
            productId: product.printifyProductId,
            variantId: variant.printifyVariantId,
            prompt: 'A secure upload rollback test with two valid reference images',
            ownershipConfirmed: true
        })
        class FailingStorage extends MemoryStorage {
            async write(namespace, bytes, extension) {
                if (this.counter === 1) throw new Error('deterministic storage failure')
                return super.write(namespace, bytes, extension)
            }
        }
        const storage = new FailingStorage()
        await assert.rejects(
            addAIDesignUploads(
                owner.user.id,
                project.id,
                [uploadFile(png, 'first.png'), uploadFile(png, 'second.png')],
                storage
            ),
            /deterministic storage failure/
        )
        assert.equal(await UploadedImage.count({ where: { userId: owner.user.id, aiDesignId: project.id } }), 0)
        assert.equal(storage.assets.size, 0)
    })

    await t.test('uploaded assets and design details are strictly owner scoped', async () => {
        const ownerView = await request(`/ai/designs/${apiDesign.id}`, { cookie: owner.cookie })
        assert.equal(ownerView.response.status, 200)
        const uploadId = ownerView.body.design.uploads[0].id
        const ownerAsset = await request(`/ai/assets/uploads/${uploadId}`, { cookie: owner.cookie })
        assert.equal(ownerAsset.response.status, 200)
        assert.equal(ownerAsset.response.headers.get('cache-control').startsWith('private'), true)
        assert.equal(ownerAsset.response.headers.get('x-content-type-options'), 'nosniff')
        assert.equal((await request(`/ai/assets/uploads/${uploadId}`, { cookie: outsider.cookie })).response.status, 404)
        assert.equal((await request(`/ai/assets/uploads/${uploadId}`)).response.status, 401)
        assert.equal((await request(`/ai/designs/${apiDesign.id}`, { cookie: outsider.cookie })).response.status, 404)
    })

    let generatedDesign
    await t.test('initial and revision spend exactly one immutable credit each and remain idempotent', async () => {
        const memory = new MemoryStorage()
        const provider = new FakeProvider(png)
        const project = await createAIDesign(owner.user.id, {
            productId: product.printifyProductId,
            variantId: variant.printifyVariantId,
            prompt: 'An elegant midnight garden with silver moths',
            ownershipConfirmed: true
        })
        await addAIDesignUploads(owner.user.id, project.id, [uploadFile(png)], memory)

        const initialKey = `initial_${randomUUID()}`
        const initial = await generateInitialArtwork(owner.user.id, project.id, initialKey, provider, memory)
        generatedDesign = initial.design
        assert.equal(initial.credits.balance, 1)
        assert.equal(initial.design.creditsUsed, 1)
        assert.equal(initial.design.generationCount, 1)
        assert.equal(initial.design.revisionAvailable, true)
        assert.ok(initial.design.artwork.originalUrl)
        assert.ok(initial.design.artwork.currentUrl)
        assert.ok(initial.design.artwork.mockupUrl)
        assert.match(provider.generatePrompt, /flat, print-ready artwork only/i)
        assert.match(provider.generatePrompt, /2:3 aspect ratio/i)
        assert.match(provider.generatePrompt, /central safe area/i)
        assert.match(provider.generatePrompt, /upper 30%/i)
        assert.match(provider.generatePrompt, /do not show a phone, phone case, product mockup/i)
        assert.match(provider.generatePrompt, new RegExp(variant.phoneModel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
        const storedInitial = await AIDesign.findByPk(project.id)
        assert.equal(storedInitial.originalArtworkKey, storedInitial.currentArtworkKey)
        assert.notEqual(storedInitial.currentArtworkKey, storedInitial.mockupKey)
        assert.ok(storedInitial.mockupTemplateId)
        assert.ok(storedInitial.artworkPlacement)
        assert.ok(storedInitial.mockupGeneratedAt)
        assert.equal(storedInitial.generationMetadata.printReadiness.width, 1024)
        assert.equal(storedInitial.generationMetadata.printReadiness.height, 1536)
        assert.equal(storedInitial.generationMetadata.printReadiness.visibleBorderDetected, false)
        assert.equal(storedInitial.generationMetadata.normalizedPhoneModel, 'iphone-14-pro-max')
        assert.equal(storedInitial.generationMetadata.cameraTemplateId, 'camera-iphone-14-pro-max-v1')
        const initialGeneration = await AIGeneration.findOne({ where: { aiDesignId: project.id, kind: 'initial', status: 'succeeded' } })
        assert.equal(initialGeneration.prompt, 'An elegant midnight garden with silver moths')
        assert.equal(initialGeneration.prompt.includes('Internal phone-case production directions'), false)
        assert.equal(initialGeneration.metadata.printReadiness.contentGuardrails.includes('no-phone-mockup'), true)

        const artworkHash = createHash('sha256').update(await memory.read(storedInitial.currentArtworkKey)).digest('hex')
        const previousArtworkKey = storedInitial.currentArtworkKey
        const previousMockupKey = storedInitial.mockupKey
        const creditTransactionsBeforeChange = await CreditTransaction.count({ where: { aiDesignId: project.id } })
        const changed = await changeAIDesignVariant(owner.user.id, project.id, {
            productId: product.printifyProductId,
            variantId: alternativeVariant.printifyVariantId
        }, memory)
        generatedDesign = changed.design
        assert.equal(changed.creditConsumed, false)
        assert.equal(changed.credits.balance, 1)
        assert.equal(changed.design.variant.id, alternativeVariant.printifyVariantId)
        assert.match(changed.design.mockupPreviewUrl, /\/mockup\?v=/)
        const storedChanged = await AIDesign.findByPk(project.id)
        assert.equal(storedChanged.currentArtworkKey, previousArtworkKey)
        assert.notEqual(storedChanged.mockupKey, previousMockupKey)
        assert.equal(createHash('sha256').update(await memory.read(storedChanged.currentArtworkKey)).digest('hex'), artworkHash)
        assert.equal(await CreditTransaction.count({ where: { aiDesignId: project.id } }), creditTransactionsBeforeChange)
        assert.equal(storedChanged.creditsUsed, 1)
        assert.equal(storedChanged.generationCount, 1)
        assert.equal(storedChanged.generationMetadata.latestMockup.normalizedPhoneModel, 'iphone-17-pro')
        assert.equal(storedChanged.generationMetadata.latestMockup.cameraTemplateId, 'camera-iphone-17-pro-v1')

        await assert.rejects(
            changeAIDesignVariant(outsider.user.id, project.id, { productId: product.printifyProductId, variantId: variant.printifyVariantId }, memory),
            /not found/i
        )

        const repeated = await generateInitialArtwork(owner.user.id, project.id, initialKey, provider, memory)
        assert.equal(repeated.idempotent, true)
        assert.equal(repeated.credits.balance, 1)
        assert.equal(provider.generateCalls, 1)
        assert.equal(await CreditTransaction.count({ where: { aiDesignId: project.id } }), 1)

        const originalKey = storedInitial.originalArtworkKey
        const revisionKey = `revision_${randomUUID()}`
        const revised = await reviseArtwork(owner.user.id, project.id, 'Make the flowers brighter but preserve the style', revisionKey, provider, memory)
        assert.equal(revised.credits.balance, 0)
        assert.equal(revised.design.creditsUsed, 2)
        assert.equal(revised.design.generationCount, 2)
        assert.equal(revised.design.revisionAvailable, false)
        const storedRevision = await AIDesign.findByPk(project.id)
        assert.equal(storedRevision.originalArtworkKey, originalKey)
        assert.notEqual(storedRevision.currentArtworkKey, originalKey)
        assert.notEqual(storedRevision.currentArtworkKey, storedRevision.mockupKey)
        assert.equal(provider.reviseCalls, 1)
        assert.match(provider.revisePrompt, /Make the flowers brighter but preserve the style/)
        assert.match(provider.revisePrompt, /flat, print-ready artwork only/i)
        const revisionGeneration = await AIGeneration.findOne({ where: { aiDesignId: project.id, kind: 'revision', status: 'succeeded' } })
        assert.equal(revisionGeneration.prompt, 'Make the flowers brighter but preserve the style')
        assert.equal(revisionGeneration.prompt.includes('Internal phone-case production directions'), false)

        const transactions = await CreditTransaction.findAll({ where: { aiDesignId: project.id }, order: [['createdAt', 'ASC']] })
        assert.deepEqual(transactions.map(tx => [tx.amount, tx.balanceBefore, tx.balanceAfter, tx.reason]), [
            [-1, 2, 1, 'generation'],
            [-1, 1, 0, 'revision']
        ])
        await assert.rejects(
            reviseArtwork(owner.user.id, project.id, 'Try a third change', `third_${randomUUID()}`, provider, memory),
            /revision cannot be used|not enough/i
        )
        assert.equal((await CreditAccount.findOne({ where: { userId: owner.user.id } })).balance, 0)
        assert.equal((await CreditAccount.findOne({ where: { userId: owner.user.id } })).balance >= 0, true)
    })

    await t.test('insufficient credits block another project without a negative balance', async () => {
        const memory = new MemoryStorage()
        const project = await createAIDesign(owner.user.id, {
            productId: product.printifyProductId,
            variantId: variant.printifyVariantId,
            prompt: 'A geometric copper and black abstract pattern', ownershipConfirmed: true
        })
        await addAIDesignUploads(owner.user.id, project.id, [uploadFile(png)], memory)
        await assert.rejects(generateInitialArtwork(owner.user.id, project.id, `empty_${randomUUID()}`, new FakeProvider(png), memory), /enough AI credits/i)
        assert.equal((await CreditAccount.findOne({ where: { userId: owner.user.id } })).balance, 0)
        assert.equal(await CreditTransaction.count({ where: { aiDesignId: project.id } }), 0)
    })

    await t.test('provider failure and moderation rejection consume no credit and allow a safe retry', async () => {
        const memory = new MemoryStorage()
        const project = await createAIDesign(outsider.user.id, {
            productId: product.printifyProductId,
            variantId: variant.printifyVariantId,
            prompt: 'A soft watercolor coastal landscape for a phone case', ownershipConfirmed: true
        })
        await addAIDesignUploads(outsider.user.id, project.id, [uploadFile(png)], memory)
        await assert.rejects(
            generateInitialArtwork(outsider.user.id, project.id, `failure_${randomUUID()}`, new FakeProvider(png, { failGenerate: true }), memory),
            /work is saved.*try again/i
        )
        assert.equal((await CreditAccount.findOne({ where: { userId: outsider.user.id } })).balance, 2)
        assert.equal(await CreditTransaction.count({ where: { aiDesignId: project.id } }), 0)
        assert.equal((await AIDesign.findByPk(project.id)).status, 'failed')
        assert.equal(await AIGeneration.count({ where: { aiDesignId: project.id, status: 'failed' } }), 1)

        const retried = await generateInitialArtwork(outsider.user.id, project.id, `retry_${randomUUID()}`, new FakeProvider(png), memory)
        assert.equal(retried.credits.balance, 1)
        assert.equal(retried.design.generationCount, 1)

        const invalidOutputProject = await createAIDesign(outsider.user.id, {
            productId: product.printifyProductId,
            variantId: variant.printifyVariantId,
            prompt: 'A detailed natural stone pattern with quiet photographic depth', ownershipConfirmed: true
        })
        await addAIDesignUploads(outsider.user.id, invalidOutputProject.id, [uploadFile(png)], memory)
        const undersizedArtwork = await sharp({
            create: { width: 512, height: 768, channels: 3, background: { r: 40, g: 90, b: 150 } }
        }).png().toBuffer()
        await assert.rejects(
            generateInitialArtwork(outsider.user.id, invalidOutputProject.id, `invalid-output_${randomUUID()}`, new FakeProvider(undersizedArtwork), memory),
            /below the minimum safe print resolution.*No credit was used/i
        )
        assert.equal((await CreditAccount.findOne({ where: { userId: outsider.user.id } })).balance, 1)
        assert.equal(await CreditTransaction.count({ where: { aiDesignId: invalidOutputProject.id } }), 0)
        assert.equal((await AIDesign.findByPk(invalidOutputProject.id)).status, 'failed')

        const moderationProject = await createAIDesign(outsider.user.id, {
            productId: product.printifyProductId,
            variantId: variant.printifyVariantId,
            prompt: 'A second safe test prompt for moderation behavior', ownershipConfirmed: true
        })
        await addAIDesignUploads(outsider.user.id, moderationProject.id, [uploadFile(png)], memory)
        await assert.rejects(
            generateInitialArtwork(outsider.user.id, moderationProject.id, `moderation_${randomUUID()}`, new FakeProvider(png, { flagged: true }), memory),
            /could not create this design/i
        )
        assert.equal((await CreditAccount.findOne({ where: { userId: outsider.user.id } })).balance, 1)
    })

    await t.test('slow provider work does not hold the design row transaction open', async () => {
        const memory = new MemoryStorage()
        const project = await createAIDesign(outsider.user.id, {
            productId: product.printifyProductId,
            variantId: variant.printifyVariantId,
            prompt: 'A slow-provider transaction-boundary test with soft blue geometric art',
            ownershipConfirmed: true
        })
        await addAIDesignUploads(outsider.user.id, project.id, [uploadFile(png)], memory)
        let releaseProvider
        let providerStarted
        const started = new Promise(resolve => { providerStarted = resolve })
        const released = new Promise(resolve => { releaseProvider = resolve })
        const slowProvider = new FakeProvider(png)
        slowProvider.generate = async function (prompt) {
            this.generatePrompt = prompt
            this.generateCalls += 1
            providerStarted()
            await released
            return { bytes: this.bytes, provider: 'deterministic', model: 'phase6-test', requestId: 'slow-provider' }
        }
        const running = generateInitialArtwork(outsider.user.id, project.id, `slow_${randomUUID()}`, slowProvider, memory)
        await started
        const updatedAt = new Date()
        const startedAt = Date.now()
        await AIDesign.update({ updatedAt }, { where: { id: project.id } })
        assert.ok(Date.now() - startedAt < 1000, 'database update should not wait for external generation')
        releaseProvider()
        const completed = await running
        assert.equal(completed.design.generationCount, 1)
        assert.equal(completed.design.creditsUsed, 1)
    })

    await t.test('My Designs is owner scoped and status transitions reject backwards moves', async () => {
        const forbiddenApproval = await request(`/ai/designs/${generatedDesign.id}/approve`, { method: 'POST', cookie: outsider.cookie })
        assert.equal(forbiddenApproval.response.status, 404)
        const approval = await request(`/ai/designs/${generatedDesign.id}/approve`, { method: 'POST', cookie: owner.cookie })
        assert.equal(approval.response.status, 200)
        assert.equal(approval.body.design.status, 'approved')
        const ownerList = await request('/ai/designs', { cookie: owner.cookie })
        assert.equal(ownerList.response.status, 200)
        assert.equal(ownerList.body.designs.some(design => design.id === generatedDesign.id), true)
        const outsiderList = await request('/ai/designs', { cookie: outsider.cookie })
        assert.equal(outsiderList.response.status, 200)
        assert.equal(outsiderList.body.designs.some(design => design.id === generatedDesign.id), false)
        assert.throws(() => assertAIDesignTransition('approved', 'draft'), /cannot move/i)
    })

    await t.test('AI-specific generation rate limiting does not affect catalog browsing', async () => {
        for (let index = 0; index < 6; index += 1) {
            const attempt = await request(`/ai/designs/${apiDesign.id}/generate`, { method: 'POST', cookie: owner.cookie, json: {} })
            assert.equal(attempt.response.status, 422)
        }
        const limited = await request(`/ai/designs/${apiDesign.id}/generate`, { method: 'POST', cookie: owner.cookie, json: {} })
        assert.equal(limited.response.status, 429)
        const catalog = await request('/products')
        assert.equal(catalog.response.status, 200)
    })
})

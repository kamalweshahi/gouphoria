const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash, randomUUID } = require('node:crypto')
const mysql = require('mysql2/promise')
const sharp = require('sharp')
const { connectDatabase, disconnectDatabase } = require('../dist/database/database')
const {
    AdminNote, AIDesign, Cart, CartItem, CommerceAudit, Order, OrderItem, Payment,
    Product, ProductVariant, UploadedImage
} = require('../dist/database/models')
const { createPayPalOrderForSavedOrder, captureSavedPayPalOrder } = require('../dist/services/payments')
const { fulfillAIOrderItem } = require('../dist/services/ai-fulfillment')
const { privateStorage } = require('../dist/services/ai-storage')
const { readAdminReviewAsset } = require('../dist/services/admin-reviews')
const { retryAdminOrderFulfillment } = require('../dist/services/admin-management')
const { attachMockQuoteToOrder, mockShippingQuote } = require('./shipping-test-helper')

const baseUrl = process.env.AI_COMMERCE_TEST_BASE_URL || 'http://localhost:3000'
const password = 'PhaseSeven9Secure'
const createdUserIds = []
const storageKeys = []
const shipping = {
    firstName: 'Ada', lastName: 'Custom', email: 'ada@example.com', phone: '+1 555 200 3000',
    address1: '17 Artwork Avenue', address2: 'Suite 2', city: 'Austin', state: 'TX', postalCode: '78701', countryCode: 'US'
}

async function databaseConnection() {
    return mysql.createConnection({
        host: process.env.DB_HOST || 'mysql', port: Number(process.env.DB_PORT || 3306),
        database: process.env.DB_NAME || 'case_store', user: process.env.DB_USER || 'case_store',
        password: process.env.DB_PASSWORD || 'case_store_dev'
    })
}

async function request(path, options = {}) {
    const headers = options.json === undefined ? {} : { 'content-type': 'application/json' }
    if (options.cookie) headers.cookie = options.cookie
    const response = await fetch(`${baseUrl}${path}`, {
        method: options.method || 'GET', headers,
        body: options.json === undefined ? undefined : JSON.stringify(options.json)
    })
    const body = (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : await response.arrayBuffer()
    return { response, body }
}

async function register(label) {
    const email = `phase7-${label}-${Date.now()}-${randomUUID().slice(0, 6)}@example.com`
    const result = await request('/auth/register', {
        method: 'POST', json: { name: `Phase 7 ${label}`, email, password, confirmPassword: password }
    })
    assert.equal(result.response.status, 201)
    createdUserIds.push(result.body.user.id)
    return { user: result.body.user, cookie: result.response.headers.get('set-cookie').split(';')[0] }
}

let owner
let outsider
let admin
let product
let variant
let artwork
let mockup
let originalProductConfiguration
let originalVariantStorefrontEnabled

async function createDesign(userId, status = 'approved') {
    const artworkKey = await privateStorage.write('artwork', artwork, 'png')
    const mockupKey = await privateStorage.write('mockups', mockup, 'png')
    storageKeys.push(artworkKey, mockupKey)
    return AIDesign.create({
        userId, productId: product.id, productVariantId: variant.id,
        prompt: 'A precise midnight botanical pattern for a custom case',
        status, approvalStatus: status === 'pending_admin_review' ? 'pending' : 'not_required',
        ownershipConfirmed: true, ownershipConfirmedAt: new Date(), generationCount: 1, creditsUsed: 1,
        originalArtworkKey: artworkKey, currentArtworkKey: artworkKey, mockupKey, generatedAt: new Date()
    })
}

async function createPaidReviewFixture(userId) {
    const design = await createDesign(userId, 'pending_admin_review')
    const order = await Order.create({
        userId, orderNumber: `PHASE7-${randomUUID()}`, status: 'pending_ai_review', paymentStatus: 'captured',
        fulfillmentStatus: 'not_ready', shippingAddressSnapshot: shipping,
        subtotal: '45.00', shippingAmount: '0.00', taxAmount: '0.00', totalAmount: '45.00', currency: 'USD', paidAt: new Date()
    })
    const item = await OrderItem.create({
        orderId: order.id, productId: product.id, productVariantId: variant.id, aiDesignId: design.id,
        itemType: 'ai_custom', status: 'pending_design_review', productTitle: product.title,
        variantTitle: variant.title, phoneModel: variant.phoneModel, caseType: variant.caseType,
        quantity: 2, basePrice: '22.50', unitPrice: '22.50', totalPrice: '45.00', currency: 'USD',
        artworkStorageKey: design.currentArtworkKey, mockupStorageKey: design.mockupKey,
        artworkChecksumSha256: createHash('sha256').update(artwork).digest('hex'),
        printifyProductIdSnapshot: product.printifyProductId, printifyVariantIdSnapshot: variant.printifyVariantId,
        printifyBlueprintIdSnapshot: product.blueprintId, printifyProviderIdSnapshot: product.printProviderId
    })
    await attachMockQuoteToOrder(order, shipping)
    await order.reload()
    await Payment.create({
        orderId: order.id, provider: 'paypal', providerOrderId: `PAYPAL-${randomUUID()}`,
        providerTransactionId: `CAPTURE-${randomUUID()}`, amount: order.totalAmount, currency: 'USD', status: 'captured', capturedAt: new Date()
    })
    return { design, order, item }
}

async function approveFixture(fixture) {
    await fixture.design.update({ status: 'approved_for_print', approvalStatus: 'approved' })
    await fixture.item.update({
        status: 'approved_for_print', approvedArtworkStorageKey: fixture.item.artworkStorageKey,
        reviewedByUserId: admin.user.id, reviewedAt: new Date()
    })
    await fixture.order.update({ status: 'approved', fulfillmentStatus: 'ready' })
}

before(async () => {
    process.env.DB_ENABLED = 'true'
    process.env.DB_REQUIRED = 'true'
    await connectDatabase()
    owner = await register('owner')
    outsider = await register('outsider')
    admin = await register('admin')
    await (await databaseConnection()).end()
    const database = await databaseConnection()
    await database.execute("UPDATE users SET role = 'admin' WHERE id = ?", [admin.user.id])
    await database.end()
    const products = await Product.findAll({
        where: { status: 'active', visible: true },
        include: [{ model: ProductVariant, where: { available: true, isEnabled: true }, required: true }]
    })
    product = products.find(value => /^\d+$/.test(value.blueprintId || '') && /^\d+$/.test(value.printProviderId || ''))
    variant = product?.variants?.find(value => /^\d+$/.test(value.printifyVariantId))
    assert.ok(product && variant && product.blueprintId && product.printProviderId)
    originalProductConfiguration = {
        isVisible: product.isVisible,
        isActive: product.isActive,
        allowDirectPurchase: product.allowDirectPurchase,
        allowAiCustomization: product.allowAiCustomization,
        aiCustomOnly: product.aiCustomOnly
    }
    originalVariantStorefrontEnabled = variant.isStorefrontEnabled
    await product.update({
        isVisible: true,
        isActive: true,
        allowDirectPurchase: true,
        allowAiCustomization: true,
        aiCustomOnly: false
    })
    await variant.update({ isStorefrontEnabled: true })
    artwork = await sharp({ create: { width: 90, height: 140, channels: 4, background: { r: 22, g: 61, b: 98, alpha: 1 } } }).png().toBuffer()
    mockup = await sharp({ create: { width: 120, height: 180, channels: 4, background: { r: 220, g: 190, b: 120, alpha: 1 } } }).png().toBuffer()
})

after(async () => {
    const database = await databaseConnection()
    if (createdUserIds.length) {
        const placeholders = createdUserIds.map(() => '?').join(',')
        const [orders] = await database.execute(`SELECT id FROM orders WHERE user_id IN (${placeholders})`, createdUserIds)
        const orderIds = orders.map(row => row.id)
        const [designs] = await database.execute(`SELECT id FROM ai_designs WHERE user_id IN (${placeholders})`, createdUserIds)
        const designIds = designs.map(row => row.id)
        if (orderIds.length) {
            const values = orderIds.map(() => '?').join(',')
            await database.execute(`DELETE FROM commerce_audits WHERE order_id IN (${values})`, orderIds)
            await database.execute(`DELETE FROM admin_notes WHERE order_id IN (${values})`, orderIds)
            await database.execute(`DELETE FROM payments WHERE order_id IN (${values})`, orderIds)
            await database.execute(`DELETE FROM order_items WHERE order_id IN (${values})`, orderIds)
            await database.execute(`DELETE FROM orders WHERE id IN (${values})`, orderIds)
        }
        if (designIds.length) {
            const values = designIds.map(() => '?').join(',')
            await database.execute(`DELETE FROM commerce_audits WHERE ai_design_id IN (${values})`, designIds)
            await database.execute(`DELETE FROM admin_notes WHERE ai_design_id IN (${values})`, designIds)
            await database.execute(`DELETE FROM uploaded_images WHERE ai_design_id IN (${values})`, designIds)
            await database.execute(`DELETE FROM ai_generations WHERE ai_design_id IN (${values})`, designIds)
        }
        await database.execute(`DELETE FROM shipping_quotes WHERE user_id IN (${placeholders})`, createdUserIds)
        const [carts] = await database.execute(`SELECT id FROM carts WHERE user_id IN (${placeholders})`, createdUserIds)
        const cartIds = carts.map(row => row.id)
        if (cartIds.length) {
            const values = cartIds.map(() => '?').join(',')
            await database.execute(`DELETE FROM cart_items WHERE cart_id IN (${values})`, cartIds)
            await database.execute(`DELETE FROM carts WHERE id IN (${values})`, cartIds)
        }
        await database.execute(`DELETE FROM ai_designs WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM user_sessions WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM addresses WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM credit_transactions WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM credit_accounts WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM commerce_audits WHERE actor_user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds)
    }
    await database.end()
    await Promise.all(storageKeys.map(key => privateStorage.remove(key)))
    if (product && originalProductConfiguration) await product.update(originalProductConfiguration)
    if (variant && originalVariantStorefrontEnabled !== undefined) {
        await variant.update({ isStorefrontEnabled: originalVariantStorefrontEnabled })
    }
    await disconnectDatabase()
})

test('AI design commerce, admin review, mixed payment, and custom fulfillment', async t => {
    let mainDesign
    let savedOrder
    let mainItem
    let mainUpload

    await t.test('only the owner can add an explicitly approved design and pricing is backend controlled', async () => {
        const unapproved = await createDesign(owner.user.id, 'waiting_for_user')
        const blocked = await request(`/cart/ai-designs/${unapproved.id}`, { method: 'POST', cookie: owner.cookie, json: { quantity: 1, unitPrice: 0.01 } })
        assert.equal(blocked.response.status, 409)

        mainDesign = await createDesign(owner.user.id)
        const uploadKey = await privateStorage.write('uploads', artwork, 'png')
        storageKeys.push(uploadKey)
        mainUpload = await UploadedImage.create({
            userId: owner.user.id, aiDesignId: mainDesign.id, originalFilename: 'customer-reference.png',
            storageKey: uploadKey, mimeType: 'image/png', sizeBytes: artwork.length, extension: 'png',
            checksumSha256: createHash('sha256').update(artwork).digest('hex'), width: 90, height: 140
        })
        assert.equal((await request(`/cart/ai-designs/${mainDesign.id}`, { method: 'POST', cookie: outsider.cookie, json: { quantity: 1 } })).response.status, 404)
        const added = await request(`/cart/ai-designs/${mainDesign.id}`, { method: 'POST', cookie: owner.cookie, json: { quantity: 1, unitPrice: 0.01, markup: 0 } })
        assert.equal(added.response.status, 201)
        const custom = added.body.cart.items.find(item => item.aiDesignId === Number(mainDesign.id))
        assert.equal(custom.itemType, 'ai_custom')
        assert.equal(custom.basePrice, Number(variant.price))
        assert.equal(custom.unitPrice, Number(variant.price))
        assert.equal(Object.hasOwn(custom, 'customizationMarkup'), false)
        assert.notEqual(custom.artwork, custom.mockup)

        const duplicate = await request(`/cart/ai-designs/${mainDesign.id}`, { method: 'POST', cookie: owner.cookie, json: { quantity: 1 } })
        assert.equal(duplicate.body.cart.items.filter(item => item.aiDesignId === Number(mainDesign.id)).length, 1)
        assert.equal(await CartItem.count({ where: { aiDesignId: mainDesign.id } }), 1)
    })

    await t.test('mixed cart totals and immutable order snapshots preserve standard and AI items', async () => {
        const standard = await request('/cart/items', {
            method: 'POST', cookie: owner.cookie,
            json: { productId: product.printifyProductId, variantId: variant.printifyVariantId, quantity: 2, price: 0.01 }
        })
        assert.equal(standard.response.status, 201)
        assert.equal(standard.body.cart.items.some(item => item.itemType === 'standard'), true)
        const expected = standard.body.cart.items.reduce((sum, item) => sum + item.lineTotal, 0)
        assert.equal(standard.body.cart.subtotal, Number(expected.toFixed(2)))

        const quote = await mockShippingQuote(owner.user.id, { shippingAddress: shipping })
        const created = await request('/orders', { method: 'POST', cookie: owner.cookie, json: {
            shippingAddress: shipping,
            shippingQuoteId: quote.id,
            shippingOptionId: 'standard',
            total: 0.01,
            shippingPrice: 0.01
        } })
        assert.equal(created.response.status, 201)
        savedOrder = created.body.order
        assert.equal(savedOrder.items.some(item => item.itemType === 'standard'), true)
        assert.equal(savedOrder.items.some(item => item.itemType === 'ai_custom'), true)
        assert.equal(savedOrder.subtotal, standard.body.cart.subtotal)
        assert.equal(savedOrder.shippingAmount, 12.98)
        assert.equal(savedOrder.total, Number((standard.body.cart.subtotal + 12.98).toFixed(2)))
        mainItem = await OrderItem.findOne({ where: { orderId: savedOrder.id, aiDesignId: mainDesign.id } })
        assert.ok(mainItem.artworkStorageKey && mainItem.mockupStorageKey)
        assert.notEqual(mainItem.artworkStorageKey, mainItem.mockupStorageKey)
    })

    await t.test('successful capture sends standard items through the safe path while AI waits for review', async () => {
        const created = await createPayPalOrderForSavedOrder(owner.user.id, savedOrder.id, {
            create: async input => ({ id: 'PHASE7-PAYPAL', status: 'CREATED', purchase_units: [{ reference_id: input.referenceId }] }),
            get: async () => { throw new Error('unused') }, capture: async () => { throw new Error('unused') }
        })
        assert.equal(created.id, 'PHASE7-PAYPAL')
        const completedAt = new Date().toISOString()
        const paypal = {
            create: async () => { throw new Error('unused') },
            get: async () => ({ status: 'APPROVED', purchase_units: [{ reference_id: savedOrder.orderNumber, amount: { value: savedOrder.total.toFixed(2), currency_code: 'USD' } }] }),
            capture: async () => ({ status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'PHASE7-CAPTURE', status: 'COMPLETED', amount: { value: savedOrder.total.toFixed(2), currency_code: 'USD' }, create_time: completedAt }] } }] })
        }
        const captured = await captureSavedPayPalOrder(owner.user.id, savedOrder.id, 'PHASE7-PAYPAL', paypal)
        assert.equal(captured.paymentStatus, 'captured')
        const repeated = await captureSavedPayPalOrder(owner.user.id, savedOrder.id, 'PHASE7-PAYPAL', paypal)
        assert.equal(repeated.idempotent, true)
        const items = await OrderItem.findAll({ where: { orderId: savedOrder.id } })
        assert.equal(items.find(item => item.itemType === 'ai_custom').status, 'pending_design_review')
        assert.equal(items.find(item => item.itemType === 'ai_custom').printifyOrderId, null)
        assert.equal(items.find(item => item.itemType === 'standard').status, 'paid')
        assert.equal((await Order.findByPk(savedOrder.id)).paymentStatus, 'captured')
        assert.equal((await AIDesign.findByPk(mainDesign.id)).status, 'pending_admin_review')
    })

    await t.test('protected review media is admin-only, relationship-scoped, and returned as inline images', async () => {
        const details = await request(`/admin/ai-reviews/${mainItem.id}`, { cookie: admin.cookie })
        assert.equal(details.response.status, 200)
        assert.equal(details.body.review.design.artwork, `/admin/ai-reviews/${mainItem.id}/assets/artwork`)
        assert.equal(details.body.review.design.mockup, `/admin/ai-reviews/${mainItem.id}/assets/mockup`)
        assert.equal(details.body.review.design.uploads[0].url, `/admin/ai-reviews/${mainItem.id}/uploads/${mainUpload.id}`)

        for (const [path, bytes, name] of [
            [`/admin/ai-reviews/${mainItem.id}/assets/artwork`, artwork, 'artwork'],
            [`/admin/ai-reviews/${mainItem.id}/assets/mockup`, mockup, 'mockup'],
            [`/admin/ai-reviews/${mainItem.id}/uploads/${mainUpload.id}`, artwork, 'reference']
        ]) {
            const asset = await request(path, { cookie: admin.cookie })
            assert.equal(asset.response.status, 200, name)
            assert.equal(asset.response.headers.get('content-type'), 'image/png')
            assert.match(asset.response.headers.get('content-disposition') || '', /^inline; filename="gouphoria-/)
            assert.deepEqual(Buffer.from(asset.body), bytes)
            assert.equal((await request(path)).response.status, 401)
            assert.equal((await request(path, { cookie: owner.cookie })).response.status, 403)
            assert.equal((await request(path, { cookie: outsider.cookie })).response.status, 403)
        }

        assert.equal((await request('/admin/ai-reviews/999999999/assets/artwork', { cookie: admin.cookie })).response.status, 404)
        assert.notEqual((await request(`/admin/ai-reviews/${mainItem.id}/uploads/%252e%252e`, { cookie: admin.cookie })).response.status, 200)

        const otherDesign = await createDesign(outsider.user.id)
        const otherUploadKey = await privateStorage.write('uploads', mockup, 'png')
        storageKeys.push(otherUploadKey)
        const otherUpload = await UploadedImage.create({
            userId: outsider.user.id, aiDesignId: otherDesign.id, originalFilename: 'other-reference.png',
            storageKey: otherUploadKey, mimeType: 'image/png', sizeBytes: mockup.length, extension: 'png',
            checksumSha256: createHash('sha256').update(mockup).digest('hex'), width: 120, height: 180
        })
        assert.equal((await request(`/admin/ai-reviews/${mainItem.id}/uploads/${otherUpload.id}`, { cookie: admin.cookie })).response.status, 404)
        assert.equal((await request(`/ai/assets/uploads/${mainUpload.id}`, { cookie: owner.cookie })).response.status, 200)
        assert.equal((await request(`/ai/assets/uploads/${mainUpload.id}`, { cookie: outsider.cookie })).response.status, 404)
        assert.equal((await request(`/ai/assets/uploads/${mainUpload.id}`)).response.status, 401)
    })

    await t.test('missing or unsafe printable files return safe errors and cannot be approved', async () => {
        const fixture = await createPaidReviewFixture(owner.user.id)
        const missingKey = fixture.item.artworkStorageKey
        await privateStorage.remove(missingKey)

        const missing = await request(`/admin/ai-reviews/${fixture.item.id}/assets/artwork`, { cookie: admin.cookie })
        assert.equal(missing.response.status, 404)
        assert.match(missing.body.message, /stored printable artwork file could not be found/i)

        const approval = await request(`/admin/ai-reviews/${fixture.item.id}/decision`, {
            method: 'POST', cookie: admin.cookie, json: { decision: 'approve' }
        })
        assert.equal(approval.response.status, 409)
        assert.match(approval.body.message, /stored printable artwork file could not be found/i)
        assert.equal((await OrderItem.findByPk(fixture.item.id)).status, 'pending_design_review')

        const rejection = await request(`/admin/ai-reviews/${fixture.item.id}/decision`, {
            method: 'POST', cookie: admin.cookie, json: { decision: 'reject', note: 'Printable artwork is unavailable.' }
        })
        assert.equal(rejection.response.status, 200)

        await fixture.item.update({ artworkStorageKey: '../private-file.png' })
        await assert.rejects(readAdminReviewAsset(Number(fixture.item.id), 'artwork'), error => error?.status === 404 && error?.code === 'PRIVATE_ASSET_MISSING')
    })

    await t.test('admin routes are protected and decisions are audited with private notes hidden from customers', async () => {
        assert.equal((await request('/admin/ai-reviews')).response.status, 401)
        assert.equal((await request('/admin/ai-reviews', { cookie: owner.cookie })).response.status, 403)
        const queue = await request('/admin/ai-reviews', { cookie: admin.cookie })
        assert.equal(queue.response.status, 200)
        assert.equal(queue.body.reviews.some(review => review.itemId === Number(mainItem.id)), true)
        const approved = await request(`/admin/ai-reviews/${mainItem.id}/decision`, {
            method: 'POST', cookie: admin.cookie,
            json: { decision: 'approve', note: 'Approved for printing.', internalNote: 'Internal color check passed.' }
        })
        assert.equal(approved.response.status, 200)
        assert.equal(approved.body.review.itemStatus, 'approved_for_print')
        assert.equal(approved.body.fulfillment.submitted, false)
        const repeated = await request(`/admin/ai-reviews/${mainItem.id}/decision`, { method: 'POST', cookie: admin.cookie, json: { decision: 'approve' } })
        assert.equal(repeated.response.status, 200)
        assert.equal(repeated.body.idempotent, true)

        const ownerOrder = await request(`/orders/${savedOrder.id}`, { cookie: owner.cookie })
        const ownerItem = ownerOrder.body.order.items.find(item => item.id === Number(mainItem.id))
        assert.equal(ownerItem.reviewMessage, 'Approved for printing.')
        assert.equal(JSON.stringify(ownerOrder.body).includes('Internal color check passed.'), false)
        assert.equal((await request(`/orders/${savedOrder.id}`, { cookie: outsider.cookie })).response.status, 404)
        assert.ok(await CommerceAudit.count({ where: { orderItemId: mainItem.id } }))
    })

    await t.test('rejection and changes requested require reasons and never submit to Printify', async () => {
        const rejected = await createPaidReviewFixture(owner.user.id)
        const missingReason = await request(`/admin/ai-reviews/${rejected.item.id}/decision`, { method: 'POST', cookie: admin.cookie, json: { decision: 'reject' } })
        assert.equal(missingReason.response.status, 422)
        const rejectedResult = await request(`/admin/ai-reviews/${rejected.item.id}/decision`, { method: 'POST', cookie: admin.cookie, json: { decision: 'reject', note: 'The artwork does not meet print-safety requirements.' } })
        assert.equal(rejectedResult.body.review.itemStatus, 'rejected')
        assert.equal((await OrderItem.findByPk(rejected.item.id)).printifyOrderId, null)

        const changes = await createPaidReviewFixture(owner.user.id)
        const changesResult = await request(`/admin/ai-reviews/${changes.item.id}/decision`, { method: 'POST', cookie: admin.cookie, json: { decision: 'changes_requested', note: 'Please increase contrast around the camera area.' } })
        assert.equal(changesResult.body.review.itemStatus, 'changes_requested')
        assert.equal((await AIDesign.findByPk(changes.design.id)).approvalStatus, 'changes_requested')
        assert.equal((await OrderItem.findByPk(changes.item.id)).printifyOrderId, null)
    })

    await t.test('order-level admin submission rejects unapproved or missing custom artwork before any external call', async () => {
        const unapproved = await createPaidReviewFixture(owner.user.id)
        let externalCalls = 0
        const blockedApi = {
            shopId: () => 'test-shop',
            upload: async () => { externalCalls += 1; throw new Error('must not upload') },
            create: async () => { externalCalls += 1; throw new Error('must not create') },
            get: async () => { externalCalls += 1; throw new Error('must not get') },
            sendToProduction: async () => { externalCalls += 1; throw new Error('must not send') }
        }
        await assert.rejects(
            retryAdminOrderFulfillment(admin.user.id, Number(unapproved.order.id), { aiApi: blockedApi, mode: 'draft', storage: privateStorage }),
            /must be approved/i
        )
        assert.equal(externalCalls, 0)

        const missing = await createPaidReviewFixture(owner.user.id)
        await approveFixture(missing)
        await privateStorage.remove(missing.item.artworkStorageKey)
        await assert.rejects(
            retryAdminOrderFulfillment(admin.user.id, Number(missing.order.id), { aiApi: blockedApi, mode: 'draft', storage: privateStorage }),
            /printable artwork file could not be found/i
        )
        assert.equal(externalCalls, 0)

        const invalidMapping = await createPaidReviewFixture(owner.user.id)
        await approveFixture(invalidMapping)
        await invalidMapping.item.update({ printifyVariantIdSnapshot: null })
        await assert.rejects(
            retryAdminOrderFulfillment(admin.user.id, Number(invalidMapping.order.id), { aiApi: blockedApi, mode: 'draft', storage: privateStorage }),
            /valid Printify product or variant mapping/i
        )
        assert.equal(externalCalls, 0)
    })

    await t.test('order-level admin submission uses immutable artwork and is idempotent for an AI-custom order', async () => {
        const fixture = await createPaidReviewFixture(owner.user.id)
        await approveFixture(fixture)
        let uploadCalls = 0
        let createCalls = 0
        let sendCalls = 0
        let uploadedBytes
        let payload
        const api = {
            shopId: () => 'test-shop',
            upload: async (_name, bytes) => {
                uploadCalls += 1
                uploadedBytes = bytes
                return { id: 'ORDER-ROUTER-UPLOAD', preview_url: 'https://images.printify.test/order-router-artwork.png' }
            },
            create: async input => {
                createCalls += 1
                payload = input
                return { id: 'ORDER-ROUTER-CUSTOM', status: 'pending', created_at: new Date().toISOString() }
            },
            get: async () => ({ id: 'ORDER-ROUTER-CUSTOM', status: 'pending', shipments: [] }),
            sendToProduction: async () => { sendCalls += 1 }
        }
        const first = await retryAdminOrderFulfillment(admin.user.id, Number(fixture.order.id), { aiApi: api, mode: 'draft', storage: privateStorage })
        const repeated = await retryAdminOrderFulfillment(admin.user.id, Number(fixture.order.id), { aiApi: api, mode: 'draft', storage: privateStorage })
        assert.equal(first.orderKind, 'ai_custom')
        assert.equal(first.standard, undefined)
        assert.equal(first.custom[0].printifyOrderId, 'ORDER-ROUTER-CUSTOM')
        assert.equal(repeated.custom[0].idempotent, true)
        assert.equal(uploadCalls, 1)
        assert.equal(createCalls, 1)
        assert.equal(sendCalls, 0)
        assert.deepEqual(uploadedBytes, artwork)
        assert.notDeepEqual(uploadedBytes, mockup)
        assert.equal(payload.line_items[0].print_areas.front, 'https://images.printify.test/order-router-artwork.png')
        assert.equal(JSON.stringify(payload).includes('mockup'), false)
    })

    await t.test('mixed order submission routes standard and approved AI lines through separate existing flows', async () => {
        const fixture = await createPaidReviewFixture(owner.user.id)
        await approveFixture(fixture)
        const standardItem = await OrderItem.create({
            orderId: fixture.order.id, productId: product.id, productVariantId: variant.id,
            itemType: 'standard', status: 'paid', productTitle: product.title, variantTitle: variant.title,
            phoneModel: variant.phoneModel, caseType: variant.caseType, quantity: 1,
            basePrice: variant.price, unitPrice: variant.price, totalPrice: variant.price, currency: 'USD',
            printifyProductIdSnapshot: product.printifyProductId, printifyVariantIdSnapshot: variant.printifyVariantId,
            printifyBlueprintIdSnapshot: product.blueprintId, printifyProviderIdSnapshot: product.printProviderId
        })
        await attachMockQuoteToOrder(fixture.order, shipping)
        let standardCreates = 0
        let customCreates = 0
        let standardPayload
        let customPayload
        const standardApi = {
            shopId: () => 'test-shop',
            create: async input => { standardCreates += 1; standardPayload = input; return { id: 'MIXED-STANDARD', status: 'pending' } },
            get: async () => ({ id: 'MIXED-STANDARD', status: 'pending' }),
            findByExternalReference: async () => undefined,
            sendToProduction: async () => { throw new Error('draft mode must not send') }
        }
        const aiApi = {
            shopId: () => 'test-shop',
            upload: async () => ({ id: 'MIXED-UPLOAD', preview_url: 'https://images.printify.test/mixed-artwork.png' }),
            create: async input => { customCreates += 1; customPayload = input; return { id: 'MIXED-CUSTOM', status: 'pending' } },
            get: async () => ({ id: 'MIXED-CUSTOM', status: 'pending' }),
            findByExternalReference: async () => undefined,
            sendToProduction: async () => { throw new Error('draft mode must not send') }
        }
        const result = await retryAdminOrderFulfillment(admin.user.id, Number(fixture.order.id), {
            standardApi, aiApi, mode: 'draft', storage: privateStorage
        })
        assert.equal(result.orderKind, 'mixed')
        assert.equal(standardCreates, 1)
        assert.equal(customCreates, 1)
        assert.deepEqual(standardPayload.line_items, [{
            product_id: product.printifyProductId,
            variant_id: Number(variant.printifyVariantId),
            quantity: 1,
            external_id: `order-item-${standardItem.id}`
        }])
        assert.equal(customPayload.line_items.length, 1)
        assert.equal(customPayload.line_items[0].external_id, `order-item-${fixture.item.id}`)
        assert.equal(customPayload.line_items[0].print_areas.front, 'https://images.printify.test/mixed-artwork.png')
    })

    await t.test('approved artwork drives the custom Printify payload and fulfillment is idempotent', async () => {
        let uploadCalls = 0
        let createCalls = 0
        let uploadedBytes
        let payload
        const api = {
            shopId: () => 'test-shop',
            upload: async (name, bytes) => { uploadCalls += 1; uploadedBytes = bytes; return { id: 'UPLOAD-1', preview_url: 'https://images.printify.test/approved-artwork.png' } },
            create: async input => { createCalls += 1; payload = input; return { id: 'CUSTOM-ORDER-1', status: 'pending', created_at: new Date().toISOString() } },
            get: async () => ({ status: 'pending', shipments: [] }),
            sendToProduction: async () => ({ status: 'ok' })
        }
        const first = await fulfillAIOrderItem(Number(mainItem.id), admin.user.id, api, 'draft', privateStorage)
        const repeated = await fulfillAIOrderItem(Number(mainItem.id), admin.user.id, api, 'draft', privateStorage)
        assert.equal(first.printifyOrderId, 'CUSTOM-ORDER-1')
        assert.equal(repeated.idempotent, true)
        assert.equal(uploadCalls, 1)
        assert.equal(createCalls, 1)
        assert.deepEqual(uploadedBytes, artwork)
        assert.equal(payload.line_items[0].variant_id, Number(variant.printifyVariantId))
        assert.equal(payload.line_items[0].quantity, mainItem.quantity)
        assert.equal(payload.line_items[0].print_areas.front, 'https://images.printify.test/approved-artwork.png')
        assert.equal(JSON.stringify(payload).includes('mockup'), false)
        assert.equal(JSON.stringify(payload).includes('reference'), false)
        assert.deepEqual(payload.address_to, {
            first_name: shipping.firstName, last_name: shipping.lastName, email: shipping.email, phone: shipping.phone,
            country: shipping.countryCode, region: shipping.state, address1: shipping.address1,
            address2: shipping.address2, city: shipping.city, zip: shipping.postalCode
        })
    })

    await t.test('Printify failure keeps payment and approval intact and remains retryable', async () => {
        const fixture = await createPaidReviewFixture(owner.user.id)
        await request(`/admin/ai-reviews/${fixture.item.id}/decision`, { method: 'POST', cookie: admin.cookie, json: { decision: 'approve' } })
        const failed = await fulfillAIOrderItem(Number(fixture.item.id), admin.user.id, {
            shopId: () => 'test-shop', upload: async () => ({ id: 'FAIL-UPLOAD', preview_url: 'https://images.printify.test/fail.png' }),
            create: async () => { throw new Error('deterministic Printify failure') }, get: async () => ({}), sendToProduction: async () => ({})
        }, 'draft', privateStorage)
        assert.equal(failed.status, 'fulfillment_failed')
        const stored = await OrderItem.findByPk(fixture.item.id)
        assert.equal((await Order.findByPk(fixture.order.id)).paymentStatus, 'captured')
        assert.equal((await Payment.findOne({ where: { orderId: fixture.order.id } })).status, 'captured')
        assert.equal((await AIDesign.findByPk(fixture.design.id)).approvalStatus, 'approved')
        assert.ok(stored.approvedArtworkStorageKey)
    })

    await t.test('a lost custom Printify response is reconciled without another upload or order', async () => {
        const fixture = await createPaidReviewFixture(owner.user.id)
        await request(`/admin/ai-reviews/${fixture.item.id}/decision`, {
            method: 'POST', cookie: admin.cookie, json: { decision: 'approve' }
        })
        let uploadCalls = 0
        let createCalls = 0
        const recovered = await fulfillAIOrderItem(Number(fixture.item.id), admin.user.id, {
            shopId: () => 'test-shop',
            upload: async () => { uploadCalls += 1; throw new Error('must not upload twice') },
            create: async () => { createCalls += 1; throw new Error('must not create twice') },
            findByExternalReference: async (externalId, lineIds) => {
                assert.equal(externalId, `${fixture.order.orderNumber}-AI-${fixture.item.id}`)
                assert.deepEqual(lineIds, [`order-item-${fixture.item.id}`])
                return { id: 'CUSTOM-RECOVERED', status: 'pending', created_at: new Date().toISOString() }
            },
            get: async () => ({ status: 'pending' }),
            sendToProduction: async () => ({ status: 'ok' })
        }, 'draft', privateStorage)
        assert.equal(recovered.printifyOrderId, 'CUSTOM-RECOVERED')
        assert.equal(recovered.reconciled, true)
        assert.equal(recovered.idempotent, true)
        assert.equal(uploadCalls, 0)
        assert.equal(createCalls, 0)
        assert.equal((await OrderItem.findByPk(fixture.item.id)).status, 'sent_to_printify')
    })
})

const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const mysql = require('mysql2/promise')
const { connectDatabase, disconnectDatabase } = require('../dist/database/database')
const {
    AIDesign, Cart, CartItem, CommerceAudit, CreditTransaction, Order, OrderItem,
    Payment, Product, ProductVariant, CatalogProductDeletion
} = require('../dist/database/models')
const { privateStorage } = require('../dist/services/ai-storage')

const baseUrl = process.env.ADMIN_CATALOG_TEST_BASE_URL || 'http://localhost:3000'
const password = 'AdminCatalog9Secure'
const createdUserIds = []
const createdOrderIds = []
const storageKeys = []
let customer
let admin
let product
let variant
let originalProductConfiguration
let originalVariantConfigurations
let design
let paidOrder

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
    const body = (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : undefined
    return { response, body }
}

function cookieFrom(response) {
    const value = response.headers.get('set-cookie')
    assert.ok(value)
    return value.split(';')[0]
}

async function register(label) {
    const email = `admin-catalog-${label}-${Date.now()}-${randomUUID().slice(0, 6)}@example.com`
    const result = await request('/auth/register', {
        method: 'POST', json: { name: `Admin Catalog ${label}`, email, password, confirmPassword: password }
    })
    assert.equal(result.response.status, 201)
    createdUserIds.push(result.body.user.id)
    return { user: result.body.user, email, cookie: cookieFrom(result.response) }
}

function productInput(overrides = {}) {
    return {
        displayName: product.displayName || 'Admin-managed phone case',
        shortDescription: product.shortDescription || 'A concise storefront description.',
        storefrontCategory: product.storefrontCategory || 'Phone case',
        storefrontImage: product.storefrontImage || null,
        isVisible: true,
        isActive: true,
        sortOrder: product.sortOrder || 0,
        allowDirectPurchase: true,
        allowAiCustomization: false,
        aiCustomOnly: false,
        retailPrice: product.retailPrice === undefined || product.retailPrice === null ? null : Number(product.retailPrice),
        blueprintId: product.blueprintId,
        printProviderId: product.printProviderId,
        variants: (product.variants || []).map(item => ({ id: Number(item.id), enabled: item.isStorefrontEnabled })),
        ...overrides
    }
}

before(async () => {
    process.env.DB_ENABLED = 'true'
    process.env.DB_REQUIRED = 'true'
    await connectDatabase()
    customer = await register('customer')
    admin = await register('admin')
    const database = await databaseConnection()
    await database.execute("UPDATE users SET role = 'admin' WHERE id = ?", [admin.user.id])
    await database.end()
    const login = await request('/auth/login', { method: 'POST', json: { email: admin.email, password } })
    assert.equal(login.response.status, 200)
    admin.cookie = cookieFrom(login.response)

    const candidates = await Product.findAll({
        where: { visible: true, status: 'active' },
        include: [{ model: ProductVariant, where: { available: true, isEnabled: true }, required: true }]
    })
    product = candidates.find(item => item.allowDirectPurchase && !item.aiCustomOnly && /^\d+$/.test(item.blueprintId || '') && /^\d+$/.test(item.printProviderId || ''))
    variant = product?.variants?.find(item => /^\d+$/.test(item.printifyVariantId))
    assert.ok(product && variant && /^\d+$/.test(product.blueprintId || '') && /^\d+$/.test(product.printProviderId || ''))
    originalProductConfiguration = {
        displayName: product.displayName, shortDescription: product.shortDescription,
        storefrontCategory: product.storefrontCategory, storefrontImage: product.storefrontImage,
        isVisible: product.isVisible, isActive: product.isActive, sortOrder: product.sortOrder,
        allowDirectPurchase: product.allowDirectPurchase, allowAiCustomization: product.allowAiCustomization,
        aiCustomOnly: product.aiCustomOnly, retailPrice: product.retailPrice,
        blueprintId: product.blueprintId, printProviderId: product.printProviderId,
        status: product.status, visible: product.visible
    }
    originalVariantConfigurations = new Map(
        (product.variants || []).map(item => [Number(item.id), { isStorefrontEnabled: item.isStorefrontEnabled }])
    )
    await product.update({
        displayName: 'Integration Test Phone Case', isVisible: true, isActive: true,
        allowDirectPurchase: true, allowAiCustomization: false, aiCustomOnly: false
    })
    await variant.update({ isStorefrontEnabled: true })
    await product.reload({ include: [ProductVariant] })

    const artworkKey = await privateStorage.write('artwork', Buffer.from('admin-catalog-artwork'), 'png')
    const mockupKey = await privateStorage.write('mockups', Buffer.from('admin-catalog-mockup'), 'png')
    storageKeys.push(artworkKey, mockupKey)
    design = await AIDesign.create({
        userId: customer.user.id, productId: product.id, productVariantId: variant.id,
        prompt: 'A finalized admin catalog integration design', status: 'approved',
        approvalStatus: 'not_required', ownershipConfirmed: true, ownershipConfirmedAt: new Date(),
        generationCount: 1, creditsUsed: 1, originalArtworkKey: artworkKey,
        currentArtworkKey: artworkKey, mockupKey, generatedAt: new Date()
    })

    paidOrder = await Order.create({
        userId: customer.user.id, orderNumber: `ADMIN-${randomUUID()}`, status: 'paid',
        paymentStatus: 'captured', fulfillmentStatus: 'ready', subtotal: '29.00',
        shippingAmount: '6.49', taxAmount: '0.00', totalAmount: '35.49', currency: 'USD',
        paypalOrderId: `PAYPAL-${randomUUID()}`, paidAt: new Date(),
        shippingAddressSnapshot: { firstName: 'Admin', lastName: 'Customer', address1: '1 Test Way', city: 'Austin', state: 'TX', postalCode: '78701', countryCode: 'US' }
    })
    createdOrderIds.push(Number(paidOrder.id))
    await OrderItem.create({
        orderId: paidOrder.id, productId: product.id, productVariantId: variant.id,
        itemType: 'standard', status: 'paid', productTitle: product.title,
        variantTitle: variant.title, quantity: 1, unitPrice: '29.00', basePrice: '29.00',
        totalPrice: '29.00', currency: 'USD', phoneModel: variant.phoneModel,
        caseType: variant.caseType, printifyProductIdSnapshot: product.printifyProductId,
        printifyVariantIdSnapshot: variant.printifyVariantId,
        printifyBlueprintIdSnapshot: product.blueprintId, printifyProviderIdSnapshot: product.printProviderId
    })
    await Payment.create({
        orderId: paidOrder.id, provider: 'paypal', providerOrderId: paidOrder.paypalOrderId,
        providerTransactionId: `CAPTURE-${randomUUID()}`, amount: '35.49', currency: 'USD',
        status: 'captured', capturedAt: new Date(), providerResponse: { status: 'COMPLETED' }
    })
})

after(async () => {
    await CatalogProductDeletion.destroy({ where: { actorUserId: admin.user.id } })
    if (product && originalProductConfiguration) await product.update(originalProductConfiguration)
    if (originalVariantConfigurations) {
        await Promise.all([...originalVariantConfigurations].map(([id, configuration]) =>
            ProductVariant.update(configuration, { where: { id } })
        ))
    }
    const database = await databaseConnection()
    if (createdUserIds.length) {
        const users = createdUserIds.map(() => '?').join(',')
        const [carts] = await database.execute(`SELECT id FROM carts WHERE user_id IN (${users})`, createdUserIds)
        const cartIds = carts.map(row => row.id)
        if (cartIds.length) {
            const ids = cartIds.map(() => '?').join(',')
            await database.execute(`DELETE FROM cart_items WHERE cart_id IN (${ids})`, cartIds)
            await database.execute(`DELETE FROM carts WHERE id IN (${ids})`, cartIds)
        }
        if (createdOrderIds.length) {
            const ids = createdOrderIds.map(() => '?').join(',')
            await database.execute(`DELETE FROM admin_notes WHERE order_id IN (${ids})`, createdOrderIds)
            await database.execute(`DELETE FROM commerce_audits WHERE order_id IN (${ids})`, createdOrderIds)
            await database.execute(`DELETE FROM payments WHERE order_id IN (${ids})`, createdOrderIds)
            await database.execute(`DELETE FROM order_items WHERE order_id IN (${ids})`, createdOrderIds)
            await database.execute(`DELETE FROM orders WHERE id IN (${ids})`, createdOrderIds)
        }
        await database.execute(`DELETE FROM admin_notes WHERE target_user_id IN (${users}) OR admin_user_id IN (${users})`, [...createdUserIds, ...createdUserIds])
        await database.execute(`DELETE FROM commerce_audits WHERE actor_user_id IN (${users}) OR ai_design_id = ?`, [...createdUserIds, design.id])
        await database.execute('DELETE FROM ai_designs WHERE id = ?', [design.id])
        await database.execute(`DELETE FROM credit_transactions WHERE user_id IN (${users}) OR admin_user_id IN (${users})`, [...createdUserIds, ...createdUserIds])
        await database.execute(`DELETE FROM user_sessions WHERE user_id IN (${users})`, createdUserIds)
        await database.execute(`DELETE FROM credit_accounts WHERE user_id IN (${users})`, createdUserIds)
        await database.execute(`DELETE FROM users WHERE id IN (${users})`, createdUserIds)
    }
    await database.end()
    await Promise.all(storageKeys.map(key => privateStorage.remove(key)))
    await disconnectDatabase()
})

test('admin customer, order, and independent product controls', async t => {
    await t.test('customer sessions cannot access any admin management route', async () => {
        for (const path of ['/admin/customers', '/admin/orders', '/admin/products']) {
            const result = await request(path, { cookie: customer.cookie })
            assert.equal(result.response.status, 403)
        }
    })

    await t.test('admin customer lists are paginated and details contain orders and designs without secrets', async () => {
        const list = await request(`/admin/customers?page=1&pageSize=1&search=${encodeURIComponent(customer.email)}`, { cookie: admin.cookie })
        assert.equal(list.response.status, 200)
        assert.equal(list.body.pagination.page, 1)
        assert.equal(list.body.pagination.pageSize, 1)
        assert.equal(list.body.customers[0].email, customer.email)
        assert.equal('passwordHash' in list.body.customers[0], false)
        const byIdAndActivity = await request(`/admin/customers?search=${customer.user.id}&hasOrders=true&hasDesigns=true`, { cookie: admin.cookie })
        assert.equal(byIdAndActivity.response.status, 200)
        assert.ok(byIdAndActivity.body.customers.some(item => item.id === customer.user.id))

        const details = await request(`/admin/customers/${customer.user.id}`, { cookie: admin.cookie })
        assert.equal(details.response.status, 200)
        assert.ok(details.body.orders.some(order => order.id === Number(paidOrder.id)))
        assert.ok(details.body.designs.some(item => item.id === Number(design.id)))
        assert.equal(Number.isInteger(details.body.activeSessions), true)
        assert.equal(Array.isArray(details.body.addresses), true)
        assert.equal('passwordHash' in details.body.user, false)

        const note = await request(`/admin/customers/${customer.user.id}/notes`, {
            method: 'POST', cookie: admin.cookie, json: { note: 'Verified customer account context.' }
        })
        assert.equal(note.response.status, 201)
    })

    await t.test('admin order list and details expose operational snapshots but no provider secrets', async () => {
        const list = await request(`/admin/orders?search=${encodeURIComponent(paidOrder.orderNumber)}`, { cookie: admin.cookie })
        assert.equal(list.response.status, 200)
        const summary = list.body.orders.find(order => order.id === Number(paidOrder.id))
        assert.ok(summary)
        assert.equal(summary.orderKind, 'standard')
        assert.equal(summary.itemCount, 1)
        assert.equal(summary.standardItems, 1)
        assert.equal(summary.customItems, 0)
        assert.equal(summary.awaitingReview, false)
        assert.equal(summary.shippingStatus, 'not_shipped')
        const standardOnly = await request(`/admin/orders?itemType=standard&orderStatus=paid&search=${encodeURIComponent(paidOrder.orderNumber)}`, { cookie: admin.cookie })
        assert.equal(standardOnly.response.status, 200)
        assert.ok(standardOnly.body.orders.some(order => order.id === Number(paidOrder.id)))
        const customOnly = await request(`/admin/orders?itemType=ai_custom&search=${encodeURIComponent(paidOrder.orderNumber)}`, { cookie: admin.cookie })
        assert.equal(customOnly.response.status, 200)
        assert.equal(customOnly.body.orders.some(order => order.id === Number(paidOrder.id)), false)
        const details = await request(`/admin/orders/${paidOrder.id}`, { cookie: admin.cookie })
        assert.equal(details.response.status, 200)
        assert.equal(details.body.order.paypal.orderId, paidOrder.paypalOrderId)
        assert.equal(details.body.order.items[0].printify.variantId, variant.printifyVariantId)
        assert.equal(JSON.stringify(details.body).includes('PRINTIFY_ACCESS_TOKEN'), false)
        assert.equal(JSON.stringify(details.body).includes('PAYPAL_CLIENT_SECRET'), false)
        const note = await request(`/admin/orders/${paidOrder.id}/notes`, {
            method: 'POST', cookie: admin.cookie, json: { note: 'Internal order verification note.' }
        })
        assert.equal(note.response.status, 201)
        assert.equal(await CommerceAudit.count({ where: { orderId: paidOrder.id, action: 'order_note_added', actorUserId: admin.user.id } }), 1)
    })

    await t.test('dashboard exposes focused operational counts', async () => {
        const result = await request('/admin/dashboard', { cookie: admin.cookie })
        assert.equal(result.response.status, 200)
        for (const key of ['pendingReviews', 'changeRequested', 'paidAwaitingFulfillment', 'fulfillmentFailures', 'inProduction', 'shippedOrders', 'paymentIssues', 'customers', 'activeProducts', 'disabledProducts', 'disabledVariants']) {
            assert.equal(typeof result.body.dashboard.counts[key], 'number', key)
        }
    })

    await t.test('product configuration rejects invalid combinations', async () => {
        const invalid = await request(`/admin/products/${product.id}`, {
            method: 'PUT', cookie: admin.cookie,
            json: productInput({ allowDirectPurchase: false, allowAiCustomization: false, aiCustomOnly: false })
        })
        assert.equal(invalid.response.status, 422)
        const contradictory = await request(`/admin/products/${product.id}`, {
            method: 'PUT', cookie: admin.cookie,
            json: productInput({ allowDirectPurchase: true, allowAiCustomization: true, aiCustomOnly: true })
        })
        assert.equal(contradictory.response.status, 422)
    })

    await t.test('only admin-enabled products appear in AI selection and AI-only base products cannot enter the cart', async () => {
        const enabled = await request(`/admin/products/${product.id}`, {
            method: 'PUT', cookie: admin.cookie,
            json: productInput({ allowDirectPurchase: false, allowAiCustomization: true, aiCustomOnly: true })
        })
        assert.equal(enabled.response.status, 200)
        assert.equal(await CommerceAudit.count({ where: { actorUserId: admin.user.id, action: 'product_settings_changed' } }) > 0, true)
        const aiProducts = await request('/products/ai-customizable', { cookie: customer.cookie })
        assert.equal(aiProducts.response.status, 200)
        assert.ok(aiProducts.body.some(item => item.id === product.printifyProductId && item.title === 'Integration Test Phone Case'))

        const direct = await request('/cart/items', {
            method: 'POST', cookie: customer.cookie,
            json: { productId: product.printifyProductId, variantId: variant.printifyVariantId, quantity: 1 }
        })
        assert.equal(direct.response.status, 409)
        assert.match(direct.body.message, /must be customized/i)

        const customized = await request(`/cart/ai-designs/${design.id}`, {
            method: 'POST', cookie: customer.cookie, json: { quantity: 1 }
        })
        assert.equal(customized.response.status, 201)
        assert.ok(customized.body.cart.items.some(item => item.aiDesignId === Number(design.id)))
    })

    await t.test('hidden and inactive products are rejected while normal active products remain directly purchasable', async () => {
        await product.reload()
        await product.update({ isVisible: false, isActive: true, allowDirectPurchase: true, allowAiCustomization: false, aiCustomOnly: false })
        let blocked = await request('/cart/items', { method: 'POST', cookie: customer.cookie, json: { productId: product.printifyProductId, variantId: variant.printifyVariantId, quantity: 1 } })
        assert.equal(blocked.response.status, 409)
        await product.update({ isVisible: true, isActive: false })
        blocked = await request('/cart/items', { method: 'POST', cookie: customer.cookie, json: { productId: product.printifyProductId, variantId: variant.printifyVariantId, quantity: 1 } })
        assert.equal(blocked.response.status, 409)
        await product.update({ isVisible: true, isActive: true })
        const added = await request('/cart/items', { method: 'POST', cookie: customer.cookie, json: { productId: product.printifyProductId, variantId: variant.printifyVariantId, quantity: 1 } })
        assert.equal(added.response.status, 201, added.body?.message)
        assert.ok(added.body.cart.items.some(item => item.itemType === 'standard'))
    })

    await t.test('public catalog responses expose no production-service branding or identifiers', async () => {
        const catalog = await request('/products')
        assert.equal(catalog.response.status, 200)
        const body = JSON.stringify(catalog.body)
        assert.equal(/printify|provider|blueprint/i.test(body), false)
        assert.equal('printifyProductId' in catalog.body[0], false)
        assert.equal('printifyVariantId' in catalog.body[0].variants[0], false)
    })

    await t.test('safe product removal permanently deletes unused products and is idempotent', async () => {
        const unused = await Product.create({
            printifyProductId: `unused-${randomUUID()}`, title: 'Unused deletion fixture', status: 'draft',
            visible: false, isVisible: false, isActive: false, allowDirectPurchase: true,
            allowAiCustomization: false, aiCustomOnly: false
        })
        await ProductVariant.create({
            productId: unused.id, printifyVariantId: `unused-variant-${randomUUID()}`, title: 'Unused option',
            phoneModel: 'Test Phone', caseType: 'Test Case', price: '1.00', currency: 'USD',
            available: false, isEnabled: false, isStorefrontEnabled: false
        })
        const denied = await request(`/admin/products/${unused.id}`, { method: 'DELETE', cookie: customer.cookie, json: { confirmation: 'DELETE' } })
        assert.equal(denied.response.status, 403)
        const preview = await request(`/admin/products/${unused.id}/deletion-preview`, { cookie: admin.cookie })
        assert.equal(preview.response.status, 200)
        assert.equal(preview.body.plan.action, 'delete')
        const invalid = await request(`/admin/products/${unused.id}`, { method: 'DELETE', cookie: admin.cookie, json: { confirmation: 'wrong' } })
        assert.equal(invalid.response.status, 422)
        assert.ok(await Product.findByPk(unused.id))
        const removed = await request(`/admin/products/${unused.id}`, { method: 'DELETE', cookie: admin.cookie, json: { confirmation: 'DELETE' } })
        assert.equal(removed.response.status, 200)
        assert.equal(removed.body.action, 'deleted')
        assert.equal(await Product.findByPk(unused.id), null)
        assert.equal(await CommerceAudit.count({ where: { actorUserId: admin.user.id, action: 'product_deleted' } }), 1)
        const duplicate = await request(`/admin/products/${unused.id}`, { method: 'DELETE', cookie: admin.cookie, json: { confirmation: 'DELETE' } })
        assert.equal(duplicate.response.status, 200)
        assert.equal(duplicate.body.alreadyProcessed, true)
        const missing = await request('/admin/products/999999999', { method: 'DELETE', cookie: admin.cookie, json: { confirmation: 'DELETE' } })
        assert.equal(missing.response.status, 404)
    })

    await t.test('referenced products archive while order history remains and new use is blocked', async () => {
        const preview = await request(`/admin/products/${product.id}/deletion-preview`, { cookie: admin.cookie })
        assert.equal(preview.response.status, 200)
        assert.equal(preview.body.plan.action, 'archive')
        assert.ok(preview.body.plan.references.orderItems > 0)
        const archived = await request(`/admin/products/${product.id}`, { method: 'DELETE', cookie: admin.cookie, json: { confirmation: 'ARCHIVE' } })
        assert.equal(archived.response.status, 200)
        assert.equal(archived.body.action, 'archived')
        await product.reload()
        assert.equal(product.isVisible, false)
        assert.equal(product.isActive, false)
        const orderDetails = await request(`/orders/${paidOrder.id}`, { cookie: customer.cookie })
        assert.equal(orderDetails.response.status, 200)
        assert.equal(orderDetails.body.order.items[0].productTitle, product.title)
        const cartAttempt = await request('/cart/items', { method: 'POST', cookie: customer.cookie, json: { productId: product.printifyProductId, variantId: variant.printifyVariantId, quantity: 1 } })
        assert.equal(cartAttempt.response.status, 409)
        const aiAttempt = await request('/ai/designs', { method: 'POST', cookie: customer.cookie, json: { productId: product.printifyProductId, variantId: variant.printifyVariantId, prompt: 'A blocked archived product design', ownershipConfirmed: true } })
        assert.notEqual(aiAttempt.response.status, 201)
        assert.equal(await CommerceAudit.count({ where: { actorUserId: admin.user.id, action: 'product_archived' } }), 1)
        const permanentPreview = await request(`/admin/products/${product.id}/deletion-preview`, { cookie: admin.cookie })
        assert.equal(permanentPreview.response.status, 200)
        assert.equal(permanentPreview.body.plan.action, 'delete')
        assert.equal(permanentPreview.body.plan.archivedWithHistory, true)
        const invalidPermanent = await request(`/admin/products/${product.id}`, { method: 'DELETE', cookie: admin.cookie, json: { confirmation: 'ARCHIVE' } })
        assert.equal(invalidPermanent.response.status, 422)
        const permanentlyRemoved = await request(`/admin/products/${product.id}`, { method: 'DELETE', cookie: admin.cookie, json: { confirmation: 'DELETE' } })
        assert.equal(permanentlyRemoved.response.status, 200)
        assert.equal(permanentlyRemoved.body.action, 'deleted')
        assert.equal(permanentlyRemoved.body.historyPreserved, true)
        assert.ok(await Product.findByPk(product.id), 'historical catalog record remains for order foreign keys')
        const adminCatalog = await request('/admin/products', { cookie: admin.cookie })
        assert.equal(adminCatalog.response.status, 200)
        assert.equal(adminCatalog.body.products.some(item => item.databaseId === Number(product.id)), false)
        const preservedOrder = await request(`/orders/${paidOrder.id}`, { cookie: customer.cookie })
        assert.equal(preservedOrder.response.status, 200)
        assert.equal(preservedOrder.body.order.items[0].productTitle, product.title)
        const duplicate = await request(`/admin/products/${product.id}`, { method: 'DELETE', cookie: admin.cookie, json: { confirmation: 'DELETE' } })
        assert.equal(duplicate.response.status, 200)
        assert.equal(duplicate.body.alreadyProcessed, true)
    })

    await t.test('manual credit changes create a ledger entry and unpaid fulfillment is rejected', async () => {
        const reason = `Admin catalog verification ${randomUUID()}`
        const adjusted = await request(`/admin/credits/users/${customer.user.id}/adjustments`, {
            method: 'POST', cookie: admin.cookie, json: { amount: 1, reason }
        })
        assert.equal(adjusted.response.status, 201)
        assert.equal(await CreditTransaction.count({ where: { userId: customer.user.id, reason: 'admin_adjustment' } }) > 0, true)

        const unpaid = await Order.create({
            userId: customer.user.id, orderNumber: `UNPAID-${randomUUID()}`, status: 'pending',
            paymentStatus: 'created', fulfillmentStatus: 'not_ready', subtotal: '10.00',
            shippingAmount: '0.00', taxAmount: '0.00', totalAmount: '10.00', currency: 'USD'
        })
        createdOrderIds.push(Number(unpaid.id))
        const retry = await request(`/admin/orders/${unpaid.id}/fulfillment/retry`, { method: 'POST', cookie: admin.cookie })
        assert.equal(retry.response.status, 409)
        assert.match(retry.body.message, /paid orders/i)
        assert.equal(await CommerceAudit.count({ where: { orderId: unpaid.id, action: 'admin_fulfillment_retry' } }), 0)
    })

    await t.test('disabling a customer revokes every session and re-enabling does not restore them', async () => {
        const disabled = await request(`/admin/customers/${customer.user.id}/status`, {
            method: 'PATCH', cookie: admin.cookie, json: { status: 'disabled' }
        })
        assert.equal(disabled.response.status, 200)
        assert.equal(disabled.body.user.status, 'disabled')

        const rejected = await request('/auth/me', { cookie: customer.cookie })
        assert.equal(rejected.response.status, 403)
        assert.equal(rejected.body.code, 'ACCOUNT_DISABLED')
        assert.match(rejected.body.message, /account has been disabled/i)
        assert.match(rejected.response.headers.get('set-cookie') || '', /Max-Age=0|Expires=/i)
        const privateAsset = await request(`/ai/assets/designs/${design.id}/mockup`, { cookie: customer.cookie })
        assert.equal(privateAsset.response.status, 403)
        assert.equal(privateAsset.body.code, 'ACCOUNT_DISABLED')

        const database = await databaseConnection()
        const [activeSessions] = await database.execute(
            'SELECT COUNT(*) AS total FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL',
            [customer.user.id]
        )
        await database.end()
        assert.equal(Number(activeSessions[0].total), 0)

        const enabled = await request(`/admin/customers/${customer.user.id}/status`, {
            method: 'PATCH', cookie: admin.cookie, json: { status: 'active' }
        })
        assert.equal(enabled.response.status, 200)

        const oldSession = await request('/auth/me', { cookie: customer.cookie })
        assert.equal(oldSession.response.status, 401)

        const freshLogin = await request('/auth/login', {
            method: 'POST', json: { email: customer.email, password }
        })
        assert.equal(freshLogin.response.status, 200)
        assert.notEqual(cookieFrom(freshLogin.response), customer.cookie)
    })
})

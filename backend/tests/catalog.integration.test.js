const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const mysql = require('mysql2/promise')
const { connectDatabase, disconnectDatabase } = require('../dist/database/database')
const { synchronizePhoneCaseCatalog } = require('../dist/services/catalog')
const { getPayPalOrder } = require('../dist/services/paypal')
const { getRawPrintifyProduct } = require('../dist/services/printify')
const { CatalogProductDeletion, CommerceAudit, Product, ProductVariant } = require('../dist/database/models')
const { mockShippingQuote } = require('./shipping-test-helper')

const baseUrl = process.env.CATALOG_TEST_BASE_URL || 'http://localhost:3000'
const testProductId = `phase3-test-${Date.now()}`
let authCookie
let authUserId
let restoredAuditId
const shippingAddress = {
    firstName: 'Catalog', lastName: 'Tester', email: 'catalog-shipping@example.com', phone: '+1 555 123 4567',
    address1: '55 Catalog Road', city: 'Austin', state: 'TX', postalCode: '78701', countryCode: 'US'
}

function synchronizedProduct() {
    return {
        id: testProductId,
        title: 'Phase 3 Test Tough Phone Case',
        description: 'Synchronization fixture',
        tags: ['phone case', 'tough phone case'],
        visible: true,
        blueprint_id: 'test-blueprint',
        print_provider_id: 'test-provider',
        images: [{ src: 'test-default.jpg', is_default: true, variant_ids: ['test-v1'] }],
        variants: [
            { id: 'test-v1', title: 'iPhone 14 / Glossy', price: 3500, is_enabled: true, is_available: true },
            { id: 'test-v2', title: 'iPhone 14 / Matte', price: 3700, is_enabled: true, is_available: true },
            { id: 'test-v3', title: 'iPhone 15 / Glossy', price: 3900, is_enabled: false, is_available: true }
        ]
    }
}

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
    const headers = options.json === undefined ? {} : { 'content-type': 'application/json' }
    if (options.cookie) headers.cookie = options.cookie
    const response = await fetch(`${baseUrl}${path}`, {
        method: options.method || 'GET',
        headers,
        body: options.json === undefined ? undefined : JSON.stringify(options.json)
    })
    const body = (response.headers.get('content-type') || '').includes('application/json')
        ? await response.json()
        : undefined
    return { response, body }
}

before(async () => {
    process.env.DB_ENABLED = 'true'
    process.env.DB_REQUIRED = 'true'
    await connectDatabase()
    const email = `phase3-regression-${Date.now()}@example.com`
    const registration = await request('/auth/register', {
        method: 'POST',
        json: { name: 'Phase 3 Regression', email, password: 'Catalog9Secure', confirmPassword: 'Catalog9Secure' }
    })
    assert.equal(registration.response.status, 201)
    authUserId = registration.body.user.id
    authCookie = registration.response.headers.get('set-cookie').split(';')[0]
})

after(async () => {
    if (restoredAuditId) await CommerceAudit.destroy({ where: { id: restoredAuditId } })
    await CatalogProductDeletion.destroy({ where: { externalProductId: testProductId } })
    const database = await databaseConnection()
    const [products] = await database.execute('SELECT id FROM products WHERE printify_product_id = ?', [testProductId])
    if (products.length) {
        await database.execute('DELETE FROM product_variants WHERE product_id = ?', [products[0].id])
        await database.execute('DELETE FROM products WHERE id = ?', [products[0].id])
    }
    if (authUserId) {
        const [orders] = await database.execute('SELECT id FROM orders WHERE user_id = ?', [authUserId])
        const orderIds = orders.map(order => order.id)
        if (orderIds.length) {
            const placeholders = orderIds.map(() => '?').join(',')
            await database.execute(`DELETE FROM payments WHERE order_id IN (${placeholders})`, orderIds)
            await database.execute(`DELETE FROM order_items WHERE order_id IN (${placeholders})`, orderIds)
            await database.execute(`DELETE FROM orders WHERE id IN (${placeholders})`, orderIds)
        }
        await database.execute('DELETE FROM shipping_quotes WHERE user_id = ?', [authUserId])
        await database.execute('DELETE FROM user_sessions WHERE user_id = ?', [authUserId])
        await database.execute('DELETE FROM addresses WHERE user_id = ?', [authUserId])
        await database.execute('DELETE FROM credit_transactions WHERE user_id = ?', [authUserId])
        await database.execute('DELETE FROM credit_accounts WHERE user_id = ?', [authUserId])
        await database.execute('DELETE FROM users WHERE id = ?', [authUserId])
    }
    await database.end()
    await disconnectDatabase()
})

test('catalog synchronization is idempotent and updates prices and availability', async () => {
    const first = await synchronizePhoneCaseCatalog([synchronizedProduct()], { markMissing: false })
    assert.equal(first.productsCreated, 1)
    assert.equal(first.variantsCreated, 3)

    const second = await synchronizePhoneCaseCatalog([synchronizedProduct()], { markMissing: false })
    assert.equal(second.productsCreated, 0)
    assert.equal(second.variantsCreated, 0)

    const database = await databaseConnection()
    const [productRows] = await database.execute('SELECT id FROM products WHERE printify_product_id = ?', [testProductId])
    const productId = productRows[0].id
    const [countRows] = await database.execute('SELECT COUNT(*) AS count FROM product_variants WHERE product_id = ?', [productId])
    assert.equal(countRows[0].count, 3)

    const updated = synchronizedProduct()
    updated.variants[0].price = 4599
    updated.variants[0].is_available = false
    updated.variants = updated.variants.slice(0, 2)
    const updateResult = await synchronizePhoneCaseCatalog([updated], { markMissing: false })
    assert.equal(updateResult.variantsCreated, 0)
    assert.equal(updateResult.variantsMarkedUnavailable, 1)

    const [updatedRows] = await database.execute(
        'SELECT printify_variant_id, price, available, is_enabled FROM product_variants WHERE product_id = ? ORDER BY printify_variant_id',
        [productId]
    )
    assert.equal(Number(updatedRows[0].price), 45.99)
    assert.equal(updatedRows[0].available, 0)
    assert.equal(updatedRows[2].available, 0)
    assert.equal(updatedRows[2].is_enabled, 0)
    await database.end()

    const storedProduct = await Product.findByPk(productId)
    await storedProduct.update({
        status: 'archived', visible: false, isVisible: false, isActive: false,
        allowDirectPurchase: false, allowAiCustomization: false, aiCustomOnly: false
    })
    await ProductVariant.update({ isStorefrontEnabled: false }, { where: { productId } })
    const deletionMarker = await CatalogProductDeletion.create({
        originalProductId: productId,
        externalProductId: testProductId,
        productName: storedProduct.title,
        action: 'deleted',
        actorUserId: authUserId,
        reason: 'Republish synchronization test'
    })
    const republished = synchronizedProduct()
    republished.updated_at = new Date(Date.now() + 60_000).toISOString()
    const restoreResult = await synchronizePhoneCaseCatalog([republished], { markMissing: false })
    assert.equal(restoreResult.productsRestored, 1)
    assert.equal(await CatalogProductDeletion.count({ where: { id: deletionMarker.id } }), 0)
    await storedProduct.reload()
    assert.equal(storedProduct.status, 'active')
    assert.equal(storedProduct.visible, true)
    assert.equal(storedProduct.isVisible, true)
    assert.equal(storedProduct.isActive, true)
    assert.equal(storedProduct.allowDirectPurchase, true)
    const restoredVariants = await ProductVariant.findAll({ where: { productId } })
    assert.ok(restoredVariants.every(variant => variant.isStorefrontEnabled))
    const restoreAudit = await CommerceAudit.findOne({
        where: { action: 'product_republished' },
        order: [['id', 'DESC']]
    })
    assert.ok(restoreAudit)
    restoredAuditId = Number(restoreAudit.id)
})

test('live Printify endpoints return phone cases with complete enabled variants', async () => {
    const list = await request('/products')
    assert.equal(list.response.status, 200)
    assert.ok(list.body.length > 0)
    assert.ok(list.body.every(product => product.phoneModels.length > 0 && product.variants.length > 0))
    assert.ok(list.body.every(product => product.variants.every(variant => variant.isEnabled)))
    assert.ok(list.body.some(product => product.variants.length > 1))

    const details = await request(`/products/${list.body[0].id}`)
    assert.equal(details.response.status, 200)
    assert.equal(details.body.id, list.body[0].id)
    assert.ok(details.body.variants.length > 0)
})

test('AI catalog exposes every available variant of an AI-enabled phone-case product', async () => {
    const [storefront, aiCatalog] = await Promise.all([
        request('/products'),
        request('/products/ai-customizable', { cookie: authCookie })
    ])
    assert.equal(storefront.response.status, 200)
    assert.equal(aiCatalog.response.status, 200)

    const sourceProducts = storefront.body.filter(product => product.allowAiCustomization)
    assert.ok(sourceProducts.length > 0)
    for (const sourceProduct of sourceProducts) {
        const aiProduct = aiCatalog.body.find(product => product.id === sourceProduct.id)
        assert.ok(aiProduct, `${sourceProduct.title} should appear in the AI picker`)
        const expectedIds = sourceProduct.variants
            .filter(variant => variant.isEnabled && variant.available)
            .map(variant => variant.id)
            .sort()
        const actualIds = aiProduct.variants
            .filter(variant => variant.isEnabled && variant.available)
            .map(variant => variant.id)
            .sort()
        assert.deepEqual(actualIds, expectedIds)
        assert.ok(aiProduct.variants.every(variant => variant.mockupPreviewStatus?.status === 'supported'))
    }
    assert.ok(aiCatalog.body.some(product => product.phoneModels.some(model => /^Samsung Galaxy /i.test(model))))
})

test('invalid combinations and disabled live variants cannot create shipping quotes', async () => {
    const list = await request('/products')
    const product = list.body[0]
    const invalid = await request('/orders/shipping-quotes', {
        method: 'POST',
        cookie: authCookie,
        json: { productId: product.id, variantId: '41686', shippingAddress }
    })
    assert.equal(invalid.response.status, 400)
    assert.match(invalid.body.message, /does not belong/i)

    const rawProduct = await getRawPrintifyProduct(product.id)
    const disabled = rawProduct.variants.find(variant => variant.is_enabled === false && /iphone|samsung galaxy|google pixel/i.test(variant.title || ''))
    if (disabled) {
        const disabledResult = await request('/orders/shipping-quotes', {
            method: 'POST',
            cookie: authCookie,
            json: { productId: product.id, variantId: String(disabled.id), shippingAddress }
        })
        assert.equal(disabledResult.response.status, 409)
        assert.match(disabledResult.body.message, /disabled/i)
    }
})

test('PayPal order amount is controlled by the selected live Printify variant', async () => {
    const list = await request('/products')
    const product = list.body.find(item => item.allowDirectPurchase && !item.aiCustomOnly && item.variants.some(variant => variant.available))
    const variant = product.variants.find(item => item.available)
    const quote = await mockShippingQuote(authUserId, {
        shippingAddress, productId: product.id, variantId: variant.id, quantity: 1
    })
    const created = await request('/payments/paypal/create-order', {
        method: 'POST',
        cookie: authCookie,
        json: {
            productId: product.id,
            variantId: variant.id,
            shippingAddress,
            shippingQuoteId: quote.id,
            shippingOptionId: 'standard',
            price: 0.01,
            currency: 'XXX'
        }
    })
    assert.equal(created.response.status, 201)
    assert.ok(created.body.id)

    const paypalOrder = await getPayPalOrder(created.body.id)
    const purchaseUnit = paypalOrder.purchase_units[0]
    assert.equal(Number(purchaseUnit.amount.value), Number((variant.price + 6.49).toFixed(2)))
    assert.equal(purchaseUnit.amount.currency_code, variant.currency)
    assert.equal(Number(purchaseUnit.amount.breakdown.item_total.value), variant.price)
    assert.equal(Number(purchaseUnit.amount.breakdown.shipping.value), 6.49)
    const localOrder = await request(`/orders/${created.body.orderId}`, { cookie: authCookie })
    assert.equal(localOrder.response.status, 200)
    assert.equal(purchaseUnit.reference_id, localOrder.body.order.orderNumber)

    const client = await request('/payments/paypal/client-id', { cookie: authCookie })
    assert.equal(client.response.status, 200)
    assert.ok(client.body.clientId)
})

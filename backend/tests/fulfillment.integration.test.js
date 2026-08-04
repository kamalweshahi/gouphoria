const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const mysql = require('mysql2/promise')
const { connectDatabase, disconnectDatabase, getDatabase } = require('../dist/database/database')
const { Order, OrderItem, Payment, Product, ProductVariant } = require('../dist/database/models')
const { fulfillStandardOrder, synchronizePrintifyOrder, assertOrderTransition } = require('../dist/services/fulfillment')
const { fulfillOrderByItemType } = require('../dist/services/order-fulfillment')
const { refreshOrderAggregate } = require('../dist/services/order-item-state')
const { attachMockQuoteToOrder } = require('./shipping-test-helper')

const baseUrl = process.env.FULFILLMENT_TEST_BASE_URL || 'http://localhost:3000'
const password = 'Fulfillment9Secure'
const createdUserIds = []
const createdOrderIds = []

const shipping = {
    firstName: 'Fiona', lastName: 'Fulfillment', email: 'fiona@example.com', phone: '+1 555 777 1212',
    address1: '100 Shipping Lane', address2: 'Unit 5', city: 'Seattle', state: 'WA', postalCode: '98101', countryCode: 'US'
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
    const body = (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : undefined
    return { response, body }
}

async function register(label) {
    const email = `phase5-${label}-${Date.now()}-${randomUUID().slice(0, 6)}@example.com`
    const result = await request('/auth/register', {
        method: 'POST', json: { name: `Phase 5 ${label}`, email, password, confirmPassword: password }
    })
    assert.equal(result.response.status, 201)
    createdUserIds.push(result.body.user.id)
    return { user: result.body.user, cookie: result.response.headers.get('set-cookie').split(';')[0] }
}

let owner
let outsider
let product
let variant

async function createOrder(overrides = {}) {
    const order = await Order.create({
        userId: owner.user.id,
        orderNumber: `PHASE5-${randomUUID()}`,
        status: overrides.status || 'paid',
        paymentStatus: overrides.paymentStatus || 'captured',
        fulfillmentStatus: 'not_ready',
        shippingAddressSnapshot: overrides.missingShipping ? null : shipping,
        subtotal: '35.20', shippingAmount: '0.00', taxAmount: '0.00', totalAmount: '35.20', currency: 'USD',
        paidAt: new Date()
    })
    createdOrderIds.push(Number(order.id))
    const fixtureProduct = overrides.product || product
    const fixtureVariant = overrides.variant || variant
    await OrderItem.create({
        orderId: order.id,
        productId: fixtureProduct.id,
        productVariantId: fixtureVariant.id,
        productTitle: 'Immutable standard phone case', variantTitle: 'iPhone 14 / Matte',
        phoneModel: 'iPhone 14', caseType: 'Matte', quantity: overrides.quantity || 2,
        unitPrice: '17.60', basePrice: '17.60', totalPrice: '35.20', currency: 'USD',
        artworkUrl: overrides.custom ? 'https://example.invalid/custom-art.png' : null,
        printifyProductIdSnapshot: fixtureProduct.printifyProductId,
        printifyVariantIdSnapshot: fixtureVariant.printifyVariantId,
        printifyBlueprintIdSnapshot: fixtureProduct.blueprintId,
        printifyProviderIdSnapshot: fixtureProduct.printProviderId
    })
    if (!overrides.missingShipping) await attachMockQuoteToOrder(order, shipping)
    await order.reload()
    await Payment.create({
        orderId: order.id, provider: 'paypal', providerOrderId: `PAYPAL-${randomUUID()}`,
        providerTransactionId: overrides.paymentStatus === 'created' ? null : `CAPTURE-${randomUUID()}`,
        amount: order.totalAmount, currency: 'USD', status: overrides.paymentStatus || 'captured',
        capturedAt: overrides.paymentStatus === 'created' ? null : new Date()
    })
    return order
}

function fakeApi(overrides = {}) {
    return {
        shopId: () => 'test-shop',
        create: overrides.create || (async () => ({ id: `PRINTIFY-${randomUUID()}`, status: 'pending', created_at: new Date().toISOString() })),
        get: overrides.get || (async () => ({ status: 'pending', shipments: [] })),
        ...(overrides.findByExternalReference ? { findByExternalReference: overrides.findByExternalReference } : {}),
        sendToProduction: overrides.sendToProduction || (async () => ({ status: 'ok' }))
    }
}

before(async () => {
    process.env.DB_ENABLED = 'true'
    process.env.DB_REQUIRED = 'true'
    await connectDatabase()
    owner = await register('owner')
    outsider = await register('outsider')
    product = await Product.findOne({ include: [{ model: ProductVariant, where: { available: true, isEnabled: true }, required: true }] })
    assert.ok(product?.variants?.length)
    variant = product.variants.find(entry => /^\d+$/.test(entry.printifyVariantId))
    assert.ok(variant)
})

after(async () => {
    const database = await databaseConnection()
    if (createdOrderIds.length) {
        const placeholders = createdOrderIds.map(() => '?').join(',')
        await database.execute(`DELETE FROM payments WHERE order_id IN (${placeholders})`, createdOrderIds)
        await database.execute(`DELETE FROM order_items WHERE order_id IN (${placeholders})`, createdOrderIds)
        await database.execute(`DELETE FROM orders WHERE id IN (${placeholders})`, createdOrderIds)
    }
    if (createdUserIds.length) {
        const placeholders = createdUserIds.map(() => '?').join(',')
        await database.execute(`DELETE FROM shipping_quotes WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM user_sessions WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM addresses WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM credit_transactions WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM credit_accounts WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds)
    }
    await database.end()
    await disconnectDatabase()
})

test('standard Printify fulfillment eligibility, submission, retry, synchronization, and security', async t => {
    await t.test('unpaid, failed, cancelled, custom, and address-less orders cannot be fulfilled', async () => {
        const unpaid = await createOrder({ status: 'pending', paymentStatus: 'created' })
        await assert.rejects(fulfillStandardOrder(Number(unpaid.id), fakeApi(), 'draft'), /successfully paid/i)

        for (const status of ['failed', 'cancelled']) {
            const ineligible = await createOrder({ status })
            await assert.rejects(fulfillStandardOrder(Number(ineligible.id), fakeApi(), 'draft'), /not eligible/i)
        }
        const custom = await createOrder({ custom: true })
        await assert.rejects(fulfillStandardOrder(Number(custom.id), fakeApi(), 'draft'), /custom-design/i)
        const missingAddress = await createOrder({ missingShipping: true })
        await assert.rejects(fulfillStandardOrder(Number(missingAddress.id), fakeApi(), 'draft'), /shipping address/i)
    })

    await t.test('invalid Printify references are rejected', async () => {
        const fakeProduct = await Product.create({
            printifyProductId: `phase5-invalid-${randomUUID()}`, title: 'Invalid reference fixture',
            status: 'active', visible: true
        })
        const fakeVariant = await ProductVariant.create({
            productId: fakeProduct.id, printifyVariantId: 'not-numeric', title: 'Invalid variant',
            phoneModel: 'iPhone 14', caseType: 'Matte', price: '35.20', currency: 'USD', available: true, isEnabled: true
        })
        const invalid = await createOrder({ product: fakeProduct, variant: fakeVariant })
        await assert.rejects(fulfillStandardOrder(Number(invalid.id), fakeApi(), 'draft'), /invalid production reference/i)
        await Payment.destroy({ where: { orderId: invalid.id } })
        await OrderItem.destroy({ where: { orderId: invalid.id } })
        await invalid.destroy()
        createdOrderIds.splice(createdOrderIds.indexOf(Number(invalid.id)), 1)
        await fakeVariant.destroy()
        await fakeProduct.destroy()
    })

    let fulfilledOrder
    let createCalls = 0
    let sendCalls = 0
    await t.test('draft submission uses exact saved references and is idempotent', async () => {
        fulfilledOrder = await createOrder({ quantity: 2 })
        let capturedPayload
        const api = fakeApi({
            create: async payload => {
                createCalls += 1
                capturedPayload = payload
                return { id: 'PRINTIFY-SUCCESS', status: 'pending', created_at: new Date().toISOString() }
            },
            sendToProduction: async () => { sendCalls += 1 }
        })
        const first = await fulfillStandardOrder(Number(fulfilledOrder.id), api, 'draft')
        const repeated = await fulfillStandardOrder(Number(fulfilledOrder.id), api, 'draft')
        assert.equal(first.printifyOrderId, 'PRINTIFY-SUCCESS')
        assert.equal(repeated.idempotent, true)
        assert.equal(createCalls, 1)
        assert.equal(sendCalls, 0)
        assert.equal(capturedPayload.external_id, fulfilledOrder.orderNumber)
        assert.deepEqual(capturedPayload.line_items, [{
            product_id: product.printifyProductId,
            variant_id: Number(variant.printifyVariantId),
            quantity: 2,
            external_id: `order-item-${(await OrderItem.findOne({ where: { orderId: fulfilledOrder.id } })).id}`
        }])
        assert.deepEqual(capturedPayload.address_to, {
            first_name: shipping.firstName, last_name: shipping.lastName, email: shipping.email, phone: shipping.phone,
            country: shipping.countryCode, region: shipping.state, address1: shipping.address1,
            address2: shipping.address2, city: shipping.city, zip: shipping.postalCode
        })
        const stored = await Order.findByPk(fulfilledOrder.id)
        assert.equal(stored.printifyOrderId, 'PRINTIFY-SUCCESS')
        assert.equal(stored.status, 'sent_to_printify')
        assert.equal(stored.paymentStatus, 'captured')
    })

    await t.test('order-level dispatcher keeps standard-only orders on standard fulfillment', async () => {
        const routedOrder = await createOrder({ quantity: 1 })
        let standardCreates = 0
        const standardApi = fakeApi({
            create: async () => { standardCreates += 1; return { id: 'STANDARD-ROUTED', status: 'pending' } }
        })
        const aiApi = {
            shopId: () => 'test-shop',
            upload: async () => { throw new Error('standard order must not upload AI artwork') },
            create: async () => { throw new Error('standard order must not call AI creation') },
            get: async () => { throw new Error('standard order must not call AI status') },
            sendToProduction: async () => { throw new Error('draft mode must not send') }
        }
        const result = await fulfillOrderByItemType(Number(routedOrder.id), owner.user.id, {
            standardApi, aiApi, mode: 'draft'
        })
        assert.equal(result.orderKind, 'standard')
        assert.equal(result.custom.length, 0)
        assert.equal(result.standard.printifyOrderId, 'STANDARD-ROUTED')
        assert.equal(standardCreates, 1)
    })

    await t.test('temporary failure preserves captured payment and can be retried without a duplicate payment', async () => {
        const retryOrder = await createOrder()
        const failed = await fulfillStandardOrder(Number(retryOrder.id), fakeApi({ create: async () => { throw new Error('temporary') } }), 'draft')
        assert.equal(failed.status, 'failed')
        let stored = await Order.findByPk(retryOrder.id, { include: [Payment] })
        assert.equal(stored.status, 'fulfillment_failed')
        assert.equal(stored.paymentStatus, 'captured')
        assert.equal(stored.payment.status, 'captured')
        assert.ok(stored.paidAt)

        const retried = await fulfillStandardOrder(Number(retryOrder.id), fakeApi({ create: async () => ({ id: 'PRINTIFY-RETRY', status: 'pending' }) }), 'draft')
        assert.equal(retried.printifyOrderId, 'PRINTIFY-RETRY')
        stored = await Order.findByPk(retryOrder.id, { include: [Payment] })
        assert.equal(stored.status, 'sent_to_printify')
        assert.equal(stored.payment.status, 'captured')
        assert.equal(await Payment.count({ where: { orderId: retryOrder.id } }), 1)
    })

    await t.test('a lost Printify create response is reconciled before creating a duplicate order', async () => {
        const recoveryOrder = await createOrder({ quantity: 1 })
        const item = await OrderItem.findOne({ where: { orderId: recoveryOrder.id } })
        let createCalls = 0
        let lookupCalls = 0
        const recovered = await fulfillStandardOrder(Number(recoveryOrder.id), fakeApi({
            create: async () => { createCalls += 1; throw new Error('must not create a duplicate') },
            findByExternalReference: async (externalId, itemReferences) => {
                lookupCalls += 1
                assert.equal(externalId, recoveryOrder.orderNumber)
                assert.deepEqual(itemReferences, [`order-item-${item.id}`])
                return { id: 'PRINTIFY-RECOVERED', status: 'pending', created_at: new Date().toISOString() }
            }
        }), 'draft')
        assert.equal(recovered.printifyOrderId, 'PRINTIFY-RECOVERED')
        assert.equal(recovered.reconciled, true)
        assert.equal(recovered.idempotent, true)
        assert.equal(createCalls, 0)
        assert.equal(lookupCalls, 1)
        assert.equal((await Order.findByPk(recoveryOrder.id)).printifyOrderId, 'PRINTIFY-RECOVERED')
        assert.equal((await OrderItem.findByPk(item.id)).status, 'sent_to_printify')
    })

    await t.test('production mode explicitly calls send-to-production only after creation', async () => {
        const productionOrder = await createOrder()
        let productionCreates = 0
        let productionSends = 0
        const productionApi = fakeApi({
            create: async () => { productionCreates += 1; return { id: 'PRINTIFY-PRODUCTION', status: 'pending' } },
            sendToProduction: async orderId => { productionSends += 1; assert.equal(orderId, 'PRINTIFY-PRODUCTION'); return { status: 'ok' } }
        })
        await fulfillStandardOrder(Number(productionOrder.id), productionApi, 'production')
        assert.equal(productionCreates, 1)
        assert.equal(productionSends, 1)
    })

    await t.test('one shipped item never marks a multi-item order fully shipped', async () => {
        const partialOrder = await createOrder({ quantity: 1 })
        const firstItem = await OrderItem.findOne({ where: { orderId: partialOrder.id } })
        const secondItem = await OrderItem.create({
            orderId: partialOrder.id,
            productId: product.id,
            productVariantId: variant.id,
            itemType: 'standard',
            status: 'paid',
            productTitle: 'Second immutable phone case',
            variantTitle: variant.title,
            phoneModel: variant.phoneModel,
            caseType: variant.caseType,
            quantity: 1,
            unitPrice: '17.60',
            basePrice: '17.60',
            totalPrice: '17.60',
            currency: 'USD',
            printifyProductIdSnapshot: product.printifyProductId,
            printifyVariantIdSnapshot: variant.printifyVariantId,
            printifyBlueprintIdSnapshot: product.blueprintId,
            printifyProviderIdSnapshot: product.printProviderId
        })
        await firstItem.update({ status: 'shipped' })
        await getDatabase().transaction(transaction => refreshOrderAggregate(Number(partialOrder.id), transaction))
        const stored = await Order.findByPk(partialOrder.id)
        assert.equal(stored.status, 'partially_fulfilled')
        assert.equal(stored.fulfillmentStatus, 'partial')
        assert.equal((await OrderItem.findByPk(secondItem.id)).status, 'paid')
    })

    await t.test('status synchronization stores real tracking only when provided', async () => {
        const production = await synchronizePrintifyOrder(Number(fulfilledOrder.id), fakeApi({
            get: async () => ({ status: 'in-production', shipments: [] })
        }))
        assert.equal(production.fulfillmentStatus, 'in_production')
        let ownerView = await request(`/orders/${fulfilledOrder.id}`, { cookie: owner.cookie })
        assert.equal(ownerView.response.status, 200)
        assert.equal(ownerView.body.order.tracking, undefined)

        const shippedAt = new Date().toISOString()
        const shipped = await synchronizePrintifyOrder(Number(fulfilledOrder.id), fakeApi({
            get: async () => ({
                status: 'fulfilled', fulfilled_at: shippedAt,
                shipments: [{ carrier: 'USPS', number: 'TRACK-123', url: 'https://tracking.example/TRACK-123', shipped_at: shippedAt }]
            })
        }))
        assert.equal(shipped.fulfillmentStatus, 'shipped')
        ownerView = await request(`/orders/${fulfilledOrder.id}`, { cookie: owner.cookie })
        assert.equal(ownerView.body.order.tracking.number, 'TRACK-123')
        assert.equal(ownerView.body.order.tracking.carrier, 'USPS')

        const deliveredAt = new Date().toISOString()
        const delivered = await synchronizePrintifyOrder(Number(fulfilledOrder.id), fakeApi({
            get: async () => ({
                status: 'fulfilled', fulfilled_at: deliveredAt,
                shipments: [{ carrier: 'USPS', number: 'TRACK-123', url: 'https://tracking.example/TRACK-123', shipped_at: shippedAt, delivered_at: deliveredAt }]
            })
        }))
        assert.equal(delivered.fulfillmentStatus, 'delivered')

        const forbidden = await request(`/orders/${fulfilledOrder.id}`, { cookie: outsider.cookie })
        assert.equal(forbidden.response.status, 404)
    })

    await t.test('manual fulfillment controls require admin authorization', async () => {
        const manualOrder = await createOrder()
        const anonymous = await request(`/orders/${manualOrder.id}/fulfillment/retry`, { method: 'POST' })
        assert.equal(anonymous.response.status, 401)
        const regular = await request(`/orders/${manualOrder.id}/fulfillment/retry`, { method: 'POST', cookie: owner.cookie })
        assert.equal(regular.response.status, 403)
        const regularSync = await request(`/orders/${fulfilledOrder.id}/fulfillment/sync`, { method: 'POST', cookie: owner.cookie })
        assert.equal(regularSync.response.status, 403)

        const database = await databaseConnection()
        await database.execute("UPDATE users SET role = 'admin' WHERE id = ?", [owner.user.id])
        await database.end()
        const admin = await request(`/orders/${manualOrder.id}/fulfillment/retry`, { method: 'POST', cookie: owner.cookie })
        assert.equal(admin.response.status, 200)
        assert.equal(admin.body.fulfillment.mode, 'disabled')
        assert.equal(admin.body.fulfillment.status, 'ready')
    })

    await t.test('invalid backwards status transitions are rejected', () => {
        assert.throws(() => assertOrderTransition('delivered', 'paid'), /cannot move/i)
    })
})

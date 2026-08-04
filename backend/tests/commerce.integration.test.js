const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const mysql = require('mysql2/promise')
const { connectDatabase, disconnectDatabase } = require('../dist/database/database')
const { captureSavedPayPalOrder, createPayPalOrderForSavedOrder, recoverSavedPayPalOrder } = require('../dist/services/payments')
const { getPayPalOrder } = require('../dist/services/paypal')
const { getRawPrintifyProduct, selectPrintifyVariant } = require('../dist/services/printify')
const { mockShippingQuote } = require('./shipping-test-helper')

const baseUrl = process.env.COMMERCE_TEST_BASE_URL || 'http://localhost:3000'
const password = 'Commerce9Secure'
const createdUserIds = []
const shippingAddress = {
    firstName: 'Test', lastName: 'Customer', email: 'shipping@example.com', phone: '+1 555 123 4567',
    address1: '123 Test Street', address2: 'Suite 4', city: 'New York', state: 'NY', postalCode: '10001', countryCode: 'US'
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
    const headers = { ...(options.headers || {}) }
    if (options.json !== undefined) headers['content-type'] = 'application/json'
    if (options.cookie) headers.cookie = options.cookie
    const response = await fetch(`${baseUrl}${path}`, {
        method: options.method || 'GET',
        headers,
        body: options.json === undefined ? undefined : JSON.stringify(options.json)
    })
    const body = (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : undefined
    return { response, body }
}

function cookieFrom(response) {
    const cookie = response.headers.get('set-cookie')
    assert.ok(cookie)
    return cookie.split(';')[0]
}

async function register(label) {
    const email = `phase4-${label}-${Date.now()}-${randomUUID().slice(0, 6)}@example.com`
    const result = await request('/auth/register', {
        method: 'POST',
        json: { name: `Phase 4 ${label}`, email, password, confirmPassword: password }
    })
    assert.equal(result.response.status, 201)
    createdUserIds.push(result.body.user.id)
    return { user: result.body.user, email, cookie: cookieFrom(result.response) }
}

before(async () => {
    process.env.DB_ENABLED = 'true'
    process.env.DB_REQUIRED = 'true'
    await connectDatabase()
})

after(async () => {
    if (createdUserIds.length) {
        const database = await databaseConnection()
        const placeholders = createdUserIds.map(() => '?').join(',')
        const [orders] = await database.execute(`SELECT id FROM orders WHERE user_id IN (${placeholders})`, createdUserIds)
        const orderIds = orders.map(order => order.id)
        if (orderIds.length) {
            const orderPlaceholders = orderIds.map(() => '?').join(',')
            await database.execute(`DELETE FROM payments WHERE order_id IN (${orderPlaceholders})`, orderIds)
            await database.execute(`DELETE FROM order_items WHERE order_id IN (${orderPlaceholders})`, orderIds)
            await database.execute(`DELETE FROM orders WHERE id IN (${orderPlaceholders})`, orderIds)
        }
        const [carts] = await database.execute(`SELECT id FROM carts WHERE user_id IN (${placeholders})`, createdUserIds)
        const cartIds = carts.map(cart => cart.id)
        if (cartIds.length) {
            const cartPlaceholders = cartIds.map(() => '?').join(',')
            await database.execute(`DELETE FROM shipping_quotes WHERE user_id IN (${placeholders})`, createdUserIds)
            await database.execute(`DELETE FROM cart_items WHERE cart_id IN (${cartPlaceholders})`, cartIds)
            await database.execute(`DELETE FROM carts WHERE id IN (${cartPlaceholders})`, cartIds)
        }
        await database.execute(`DELETE FROM user_sessions WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM addresses WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM credit_transactions WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM credit_accounts WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds)
        await database.end()
    }
    await disconnectDatabase()
})

test('persistent cart, saved orders, and verified payment lifecycle', async t => {
    const anonymous = await request('/cart')
    assert.equal(anonymous.response.status, 401)
    const anonymousPayment = await request('/payments/paypal/client-id')
    assert.equal(anonymousPayment.response.status, 401)

    const first = await register('owner')
    let cookie = first.cookie
    const catalog = await request('/products')
    assert.equal(catalog.response.status, 200)
    const product = catalog.body.find(entry => entry.allowDirectPurchase && !entry.aiCustomOnly && entry.variants.some(variant => variant.available))
    const secondProduct = catalog.body.find(entry => entry.id !== product.id && entry.allowDirectPurchase && !entry.aiCustomOnly && entry.variants.some(variant => variant.available))
    const variant = product.variants.find(entry => entry.available)
    const secondVariant = secondProduct.variants.find(entry => entry.available)
    const invalidVariantId = secondProduct.variants.find(entry => entry.available && !product.variants.some(value => value.id === entry.id))?.id
        || '999999999'

    await t.test('authenticated cart is created empty', async () => {
        const result = await request('/cart', { cookie })
        assert.equal(result.response.status, 200)
        assert.equal(result.body.cart.items.length, 0)
        assert.equal(result.body.cart.subtotal, 0)
    })

    await t.test('valid add uses backend price and duplicate entries merge', async () => {
        const added = await request('/cart/items', {
            method: 'POST', cookie,
            json: { productId: product.id, variantId: variant.id, quantity: 2, unitPrice: 0.01, subtotal: 0.01 }
        })
        assert.equal(added.response.status, 201)
        assert.equal(added.body.cart.items[0].unitPrice, variant.price)
        assert.equal(added.body.cart.items[0].quantity, 2)
        assert.equal(added.body.cart.items[0].lineTotal, Number((variant.price * 2).toFixed(2)))

        const merged = await request('/cart/items', {
            method: 'POST', cookie,
            json: { productId: product.id, variantId: variant.id, quantity: 1 }
        })
        assert.equal(merged.response.status, 201)
        assert.equal(merged.body.cart.items.length, 1)
        assert.equal(merged.body.cart.items[0].quantity, 3)
    })

    await t.test('invalid relationships, disabled options, and invalid quantities are rejected', async () => {
        const invalidPair = await request('/cart/items', {
            method: 'POST', cookie,
            json: { productId: product.id, variantId: invalidVariantId, quantity: 1 }
        })
        assert.equal(invalidPair.response.status, 400)
        assert.match(invalidPair.body.message, /does not belong/i)

        const raw = await getRawPrintifyProduct(product.id)
        const disabled = raw.variants.find(entry => entry.is_enabled === false && /iphone|samsung galaxy|google pixel/i.test(entry.title || ''))
        if (disabled) {
            const disabledResult = await request('/cart/items', {
                method: 'POST', cookie,
                json: { productId: product.id, variantId: String(disabled.id), quantity: 1 }
            })
            assert.equal(disabledResult.response.status, 409)
            assert.match(disabledResult.body.message, /disabled/i)
        }

        const unavailableRaw = structuredClone(raw)
        const unavailableVariant = unavailableRaw.variants.find(entry => String(entry.id) === variant.id)
        unavailableVariant.is_enabled = true
        unavailableVariant.is_available = false
        assert.throws(() => selectPrintifyVariant(unavailableRaw, variant.id), /unavailable/i)

        for (const quantity of [0, -1, 11, 1.5, 'many']) {
            const invalidQuantity = await request('/cart/items', {
                method: 'POST', cookie,
                json: { productId: product.id, variantId: variant.id, quantity }
            })
            assert.equal(invalidQuantity.response.status, 422)
        }
    })

    await t.test('cart survives logout/login and supports update, remove, and clear', async () => {
        await request('/auth/logout', { method: 'POST', cookie })
        const login = await request('/auth/login', { method: 'POST', json: { email: first.email, password } })
        assert.equal(login.response.status, 200)
        cookie = cookieFrom(login.response)

        let current = await request('/cart', { cookie })
        assert.equal(current.body.cart.items[0].quantity, 3)
        const itemId = current.body.cart.items[0].id

        const updated = await request(`/cart/items/${itemId}`, { method: 'PATCH', cookie, json: { quantity: 4, unitPrice: 0.01 } })
        assert.equal(updated.response.status, 200)
        assert.equal(updated.body.cart.items[0].quantity, 4)
        assert.equal(updated.body.cart.subtotal, Number((variant.price * 4).toFixed(2)))

        const removed = await request(`/cart/items/${itemId}`, { method: 'DELETE', cookie })
        assert.equal(removed.response.status, 200)
        assert.equal(removed.body.cart.items.length, 0)

        await request('/cart/items', { method: 'POST', cookie, json: { productId: product.id, variantId: variant.id, quantity: 1 } })
        const cleared = await request('/cart', { method: 'DELETE', cookie })
        assert.equal(cleared.response.status, 200)
        assert.equal(cleared.body.cart.items.length, 0)
    })

    let savedOrder
    await t.test('local order stores immutable snapshots and correct totals', async () => {
        await request('/cart/items', { method: 'POST', cookie, json: { productId: product.id, variantId: variant.id, quantity: 2 } })
        await request('/cart/items', { method: 'POST', cookie, json: { productId: secondProduct.id, variantId: secondVariant.id, quantity: 1 } })
        const missingShipping = await request('/orders', { method: 'POST', cookie, json: {} })
        assert.equal(missingShipping.response.status, 422)
        const quote = await mockShippingQuote(first.user.id, { shippingAddress })
        const reusedQuote = await mockShippingQuote(first.user.id, { shippingAddress })
        assert.equal(reusedQuote.id, quote.id)
        assert.equal(reusedQuote.reused, true)
        const created = await request('/orders', { method: 'POST', cookie, json: {
            shippingAddress,
            shippingQuoteId: quote.id,
            shippingOptionId: 'standard',
            total: 0.01,
            shippingPrice: 0.01,
            userId: 999999
        } })
        assert.equal(created.response.status, 201)
        savedOrder = created.body.order
        assert.equal(savedOrder.items.length, 2)
        assert.equal(savedOrder.status, 'pending')
        assert.equal(savedOrder.paymentStatus, 'created')
        assert.deepEqual(savedOrder.shippingAddress, shippingAddress)
        assert.equal(savedOrder.subtotal, Number((variant.price * 2 + secondVariant.price).toFixed(2)))
        assert.equal(savedOrder.shippingAmount, 6.49)
        assert.equal(savedOrder.total, Number((savedOrder.subtotal + 6.49).toFixed(2)))

        const cartNow = await request('/cart', { cookie })
        const firstItem = cartNow.body.cart.items.find(item => item.variantId === variant.id)
        await request(`/cart/items/${firstItem.id}`, { method: 'PATCH', cookie, json: { quantity: 3 } })
        const immutable = await request(`/orders/${savedOrder.id}`, { cookie })
        assert.equal(immutable.body.order.items.find(item => item.variantTitle === variant.title).quantity, 2)
        assert.equal(immutable.body.order.total, savedOrder.total)
    })

    await t.test('failed verification preserves cart; successful capture is idempotent and clears it', async () => {
        let captureCalls = 0
        let createCalls = 0
        const created = await createPayPalOrderForSavedOrder(first.user.id, savedOrder.id, {
            create: async input => {
                createCalls += 1
                return { id: 'FAKE-PAYPAL-ORDER', status: 'CREATED', purchase_units: [{ reference_id: input.referenceId }] }
            },
            get: async () => { throw new Error('unused') },
            capture: async () => { throw new Error('unused') }
        })
        assert.equal(created.id, 'FAKE-PAYPAL-ORDER')
        const duplicateAttempt = await createPayPalOrderForSavedOrder(first.user.id, savedOrder.id, {
            create: async () => { createCalls += 1; throw new Error('must reuse active payment') },
            get: async () => { throw new Error('unused') },
            capture: async () => { throw new Error('unused') }
        })
        assert.equal(duplicateAttempt.id, 'FAKE-PAYPAL-ORDER')
        assert.equal(createCalls, 1)

        const mismatchApi = {
            create: async () => { throw new Error('unused') },
            get: async () => ({ status: 'APPROVED', purchase_units: [{ reference_id: savedOrder.orderNumber, amount: { value: '0.01', currency_code: savedOrder.currency } }] }),
            capture: async () => { captureCalls += 1; throw new Error('must not capture') }
        }
        await assert.rejects(
            captureSavedPayPalOrder(first.user.id, savedOrder.id, 'FAKE-PAYPAL-ORDER', mismatchApi),
            /amount.*does not match/i
        )
        let cartAfterFailure = await request('/cart', { cookie })
        assert.ok(cartAfterFailure.body.cart.items.length > 0)
        assert.equal(captureCalls, 0)

        const currencyMismatchApi = {
            ...mismatchApi,
            get: async () => ({ status: 'APPROVED', purchase_units: [{ reference_id: savedOrder.orderNumber, amount: { value: savedOrder.total.toFixed(2), currency_code: 'EUR' } }] })
        }
        await assert.rejects(
            captureSavedPayPalOrder(first.user.id, savedOrder.id, 'FAKE-PAYPAL-ORDER', currencyMismatchApi),
            /currency.*does not match/i
        )
        assert.equal(captureCalls, 0)

        const referenceMismatchApi = {
            ...mismatchApi,
            get: async () => ({
                status: 'APPROVED',
                purchase_units: [{
                    reference_id: 'ANOTHER-LOCAL-ORDER',
                    amount: { value: savedOrder.total.toFixed(2), currency_code: savedOrder.currency }
                }]
            })
        }
        await assert.rejects(
            captureSavedPayPalOrder(first.user.id, savedOrder.id, 'FAKE-PAYPAL-ORDER', referenceMismatchApi),
            /reference does not match/i
        )
        assert.equal(captureCalls, 0)

        const originalMerchantId = process.env.PAYPAL_MERCHANT_ID
        process.env.PAYPAL_MERCHANT_ID = 'EXPECTED-TEST-MERCHANT'
        try {
            const receiverMismatchApi = {
                ...mismatchApi,
                get: async () => ({
                    status: 'COMPLETED',
                    purchase_units: [{
                        reference_id: savedOrder.orderNumber,
                        amount: { value: savedOrder.total.toFixed(2), currency_code: savedOrder.currency },
                        payments: {
                            captures: [{
                                id: 'WRONG-RECEIVER-CAPTURE',
                                status: 'COMPLETED',
                                amount: { value: savedOrder.total.toFixed(2), currency_code: savedOrder.currency },
                                payee: { merchant_id: 'WRONG-TEST-MERCHANT' }
                            }]
                        }
                    }]
                })
            }
            await assert.rejects(
                captureSavedPayPalOrder(first.user.id, savedOrder.id, 'FAKE-PAYPAL-ORDER', receiverMismatchApi),
                /merchant receiver.*does not match/i
            )
        } finally {
            if (originalMerchantId === undefined) delete process.env.PAYPAL_MERCHANT_ID
            else process.env.PAYPAL_MERCHANT_ID = originalMerchantId
        }

        const cancelledApi = {
            ...mismatchApi,
            get: async () => ({ status: 'CREATED', purchase_units: [{ reference_id: savedOrder.orderNumber, amount: { value: savedOrder.total.toFixed(2), currency_code: savedOrder.currency } }] })
        }
        await assert.rejects(
            captureSavedPayPalOrder(first.user.id, savedOrder.id, 'FAKE-PAYPAL-ORDER', cancelledApi),
            /not approved/i
        )
        cartAfterFailure = await request('/cart', { cookie })
        assert.ok(cartAfterFailure.body.cart.items.length > 0)

        const completedAt = new Date().toISOString()
        const successApi = {
            ...mismatchApi,
            get: async () => ({ status: 'APPROVED', purchase_units: [{ reference_id: savedOrder.orderNumber, amount: { value: savedOrder.total.toFixed(2), currency_code: savedOrder.currency } }] }),
            capture: async () => {
                captureCalls += 1
                return {
                    id: 'FAKE-PAYPAL-ORDER', status: 'COMPLETED',
                    purchase_units: [{ payments: { captures: [{ id: 'FAKE-CAPTURE', status: 'COMPLETED', amount: { value: savedOrder.total.toFixed(2), currency_code: savedOrder.currency }, create_time: completedAt }] } }]
                }
            }
        }
        const captured = await captureSavedPayPalOrder(first.user.id, savedOrder.id, 'FAKE-PAYPAL-ORDER', successApi)
        assert.equal(captured.paymentStatus, 'captured')
        const repeated = await captureSavedPayPalOrder(first.user.id, savedOrder.id, 'FAKE-PAYPAL-ORDER', successApi)
        assert.equal(repeated.idempotent, true)
        assert.equal(captureCalls, 1)

        const paidOrder = await request(`/orders/${savedOrder.id}`, { cookie })
        assert.equal(paidOrder.body.order.status, 'ready_for_fulfillment')
        assert.equal(paidOrder.body.order.paymentStatus, 'captured')
        assert.equal(paidOrder.body.order.fulfillmentStatus, 'ready')
        const emptyCart = await request('/cart', { cookie })
        assert.equal(emptyCart.body.cart.items.length, 0)

        const database = await databaseConnection()
        const [orderCounts] = await database.execute('SELECT COUNT(*) AS count FROM orders WHERE id = ?', [savedOrder.id])
        const [paymentCounts] = await database.execute('SELECT COUNT(*) AS count FROM payments WHERE order_id = ?', [savedOrder.id])
        await database.end()
        assert.equal(orderCounts[0].count, 1)
        assert.equal(paymentCounts[0].count, 1)
    })

    await t.test('order history is owner-scoped', async () => {
        const history = await request('/orders', { cookie })
        assert.equal(history.response.status, 200)
        assert.ok(history.body.orders.some(order => order.id === savedOrder.id))

        const outsider = await register('outsider')
        const forbidden = await request(`/orders/${savedOrder.id}`, { cookie: outsider.cookie })
        assert.equal(forbidden.response.status, 404)
    })

    await t.test('an interrupted capture is recovered from PayPal exactly once', async () => {
        await request('/cart/items', { method: 'POST', cookie, json: { productId: product.id, variantId: variant.id, quantity: 1 } })
        const quote = await mockShippingQuote(first.user.id, { shippingAddress })
        const local = await request('/orders', {
            method: 'POST', cookie,
            json: { shippingAddress, shippingQuoteId: quote.id, shippingOptionId: 'standard' }
        })
        assert.equal(local.response.status, 201)
        const recoveryOrder = local.body.order
        let captureCalls = 0
        let remote = {
            id: 'RECOVERY-PAYPAL-ORDER',
            status: 'APPROVED',
            purchase_units: [{
                reference_id: recoveryOrder.orderNumber,
                amount: { value: recoveryOrder.total.toFixed(2), currency_code: recoveryOrder.currency }
            }]
        }
        const api = {
            create: async () => ({ id: remote.id, status: 'CREATED' }),
            get: async () => remote,
            capture: async () => {
                captureCalls += 1
                remote = {
                    ...remote,
                    status: 'COMPLETED',
                    purchase_units: [{
                        ...remote.purchase_units[0],
                        payments: {
                            captures: [{
                                id: 'RECOVERED-CAPTURE',
                                status: 'COMPLETED',
                                amount: { value: recoveryOrder.total.toFixed(2), currency_code: recoveryOrder.currency },
                                create_time: new Date().toISOString()
                            }]
                        }
                    }]
                }
                throw new Error('response lost after provider capture')
            }
        }
        await createPayPalOrderForSavedOrder(first.user.id, recoveryOrder.id, api)
        await assert.rejects(
            captureSavedPayPalOrder(first.user.id, recoveryOrder.id, remote.id, api),
            error => error.code === 'PAYPAL_CAPTURE_INTERRUPTED' && error.recoverable === true
        )
        const recovered = await recoverSavedPayPalOrder(first.user.id, recoveryOrder.id, remote.id, api)
        assert.equal(recovered.paymentStatus, 'captured')
        assert.equal(recovered.recovered, true)
        assert.equal(captureCalls, 1)
        const repeated = await recoverSavedPayPalOrder(first.user.id, recoveryOrder.id, remote.id, api)
        assert.equal(repeated.idempotent, true)
        assert.equal(captureCalls, 1)
        const database = await databaseConnection()
        const [payments] = await database.execute('SELECT status, provider_transaction_id FROM payments WHERE order_id = ?', [recoveryOrder.id])
        await database.end()
        assert.equal(payments.length, 1)
        assert.equal(payments[0].status, 'captured')
        assert.equal(payments[0].provider_transaction_id, 'RECOVERED-CAPTURE')
    })

    await t.test('real PayPal sandbox order is created from a persisted local order', async () => {
        await request('/cart/items', { method: 'POST', cookie, json: { productId: product.id, variantId: variant.id, quantity: 1 } })
        const quote = await mockShippingQuote(first.user.id, { shippingAddress })
        const local = await request('/orders', { method: 'POST', cookie, json: {
            shippingAddress,
            shippingQuoteId: quote.id,
            shippingOptionId: 'standard'
        } })
        assert.equal(local.response.status, 201)
        const paypal = await request('/payments/paypal/create-order', { method: 'POST', cookie, json: { orderId: local.body.order.id, price: 0.01, currency: 'XXX' } })
        assert.equal(paypal.response.status, 201)
        const providerOrder = await getPayPalOrder(paypal.body.id)
        assert.equal(providerOrder.purchase_units[0].reference_id, local.body.order.orderNumber)
        assert.equal(Number(providerOrder.purchase_units[0].amount.value), local.body.order.total)
        assert.equal(providerOrder.purchase_units[0].amount.currency_code, local.body.order.currency)
    })
})

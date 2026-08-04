const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const mysql = require('mysql2/promise')
const { connectDatabase, disconnectDatabase } = require('../dist/database/database')
const {
    CreditAccount,
    CreditPackage,
    CreditPurchase,
    CreditTransaction,
    Order,
    OrderItem,
    Payment,
    Product,
    ProductVariant,
    SystemSetting
} = require('../dist/database/models')
const {
    captureCreditPurchase,
    createCreditPurchase,
    getCreditHistory,
    grantCompletedOrderReward
} = require('../dist/services/credits')

const baseUrl = process.env.CREDITS_TEST_BASE_URL || 'http://localhost:3000'
const password = 'Credits9Secure'
const createdUserIds = []
const createdOrderIds = []

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
    const value = response.headers.get('set-cookie')
    assert.ok(value)
    return value.split(';')[0]
}

async function register(label) {
    const email = `phase8-${label}-${Date.now()}-${randomUUID().slice(0, 6)}@example.com`
    const result = await request('/auth/register', {
        method: 'POST',
        json: { name: `Phase 8 ${label}`, email, password, confirmPassword: password }
    })
    assert.equal(result.response.status, 201)
    createdUserIds.push(result.body.user.id)
    return { user: result.body.user, email, cookie: cookieFrom(result.response) }
}

function providerApi(purchase, overrides = {}) {
    return {
        create: async () => { throw new Error('unused') },
        get: async () => ({
            status: 'APPROVED',
            purchase_units: [{
                reference_id: `CREDIT-${purchase.id}`,
                amount: { value: Number(purchase.price).toFixed(2), currency_code: purchase.currency }
            }]
        }),
        capture: async () => ({
            id: purchase.paypalOrderId,
            status: 'COMPLETED',
            purchase_units: [{ payments: { captures: [{
                id: `CAPTURE-${purchase.id}`,
                status: 'COMPLETED',
                amount: { value: Number(purchase.price).toFixed(2), currency_code: purchase.currency },
                create_time: new Date().toISOString()
            }] } }]
        }),
        ...overrides
    }
}

before(async () => {
    process.env.DB_ENABLED = 'true'
    process.env.DB_REQUIRED = 'true'
    await connectDatabase()
})

after(async () => {
    await CreditPackage.update({ active: true }, { where: { id: ['starter-3', 'creator-10', 'studio-25'] } })
    await SystemSetting.update({ value: { credits: 0 } }, { where: { key: 'phone_case_purchase_reward_credits' } })
    if (createdUserIds.length) {
        const database = await databaseConnection()
        const placeholders = createdUserIds.map(() => '?').join(',')
        await database.execute(`DELETE FROM credit_transactions WHERE user_id IN (${placeholders}) OR admin_user_id IN (${placeholders})`, [...createdUserIds, ...createdUserIds])
        await database.execute(`DELETE FROM credit_purchases WHERE user_id IN (${placeholders})`, createdUserIds)
        if (createdOrderIds.length) {
            const orderPlaceholders = createdOrderIds.map(() => '?').join(',')
            await database.execute(`DELETE FROM payments WHERE order_id IN (${orderPlaceholders})`, createdOrderIds)
            await database.execute(`DELETE FROM order_items WHERE order_id IN (${orderPlaceholders})`, createdOrderIds)
            await database.execute(`DELETE FROM orders WHERE id IN (${orderPlaceholders})`, createdOrderIds)
        }
        await database.execute(`DELETE FROM user_sessions WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM credit_accounts WHERE user_id IN (${placeholders})`, createdUserIds)
        await database.execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds)
        await database.end()
    }
    await disconnectDatabase()
})

test('paid AI credits, history, admin controls, and reward integration', async t => {
    const owner = await register('owner')
    const outsider = await register('outsider')
    const admin = await register('admin')
    const database = await databaseConnection()
    await database.execute("UPDATE users SET role = 'admin' WHERE id = ?", [admin.user.id])
    await database.end()
    const adminLogin = await request('/auth/login', { method: 'POST', json: { email: admin.email, password } })
    assert.equal(adminLogin.response.status, 200)
    const adminCookie = cookieFrom(adminLogin.response)

    await t.test('credit endpoints require authentication and list only active backend packages', async () => {
        assert.equal((await request('/credits/packages')).response.status, 401)
        assert.equal((await request('/credits/history')).response.status, 401)
        assert.equal((await request('/credits/purchases', { method: 'POST', json: { packageId: 'starter-3', idempotencyKey: randomUUID() } })).response.status, 401)

        const result = await request('/credits/packages', { cookie: owner.cookie })
        assert.equal(result.response.status, 200)
        assert.deepEqual(result.body.packages.map(item => [item.id, item.credits, item.price, item.currency]), [
            ['starter-3', 3, 2.99, 'USD'],
            ['creator-10', 10, 7.99, 'USD'],
            ['studio-25', 25, 14.99, 'USD']
        ])
    })

    await t.test('inactive packages and forged package economics are rejected', async () => {
        await CreditPackage.update({ active: false }, { where: { id: 'starter-3' } })
        const inactive = await request('/credits/purchases', {
            method: 'POST', cookie: owner.cookie,
            json: { packageId: 'starter-3', idempotencyKey: randomUUID() }
        })
        assert.equal(inactive.response.status, 409)
        await CreditPackage.update({ active: true }, { where: { id: 'starter-3' } })

        for (const forged of [{ price: 0.01 }, { credits: 999 }, { userId: outsider.user.id }]) {
            const result = await request('/credits/purchases', {
                method: 'POST', cookie: owner.cookie,
                json: { packageId: 'starter-3', idempotencyKey: randomUUID(), ...forged }
            })
            assert.equal(result.response.status, 422)
        }
    })

    let purchase
    await t.test('local purchase exists before PayPal creation and uses backend package snapshots', async () => {
        let createCalls = 0
        const idempotencyKey = randomUUID()
        purchase = await createCreditPurchase(owner.user.id, 'starter-3', idempotencyKey, {
            create: async input => {
                createCalls += 1
                const local = await CreditPurchase.findOne({ where: { userId: owner.user.id, idempotencyKey } })
                assert.ok(local, 'local credit purchase must be committed before provider creation')
                assert.equal(input.total, 2.99)
                assert.equal(input.currency, 'USD')
                assert.equal(input.items[0].quantity, 1)
                assert.equal(input.description, '3 AI design credits')
                return { id: `ORDER-${local.id}`, status: 'CREATED' }
            },
            get: async () => { throw new Error('unused') },
            capture: async () => { throw new Error('unused') }
        })
        assert.equal(purchase.credits, 3)
        assert.equal(purchase.price, 2.99)
        assert.equal(purchase.status, 'created')
        assert.equal(purchase.creditsGranted, false)

        const repeated = await createCreditPurchase(owner.user.id, 'starter-3', idempotencyKey, {
            create: async () => { createCalls += 1; throw new Error('must not recreate') },
            get: async () => { throw new Error('unused') }, capture: async () => { throw new Error('unused') }
        })
        assert.equal(repeated.id, purchase.id)
        assert.equal(repeated.paypalOrderId, purchase.paypalOrderId)
        assert.equal(createCalls, 1)
        assert.equal(await CreditPurchase.count({ where: { userId: owner.user.id, idempotencyKey } }), 1)
    })

    await t.test('amount and currency mismatches never call capture or add credits', async () => {
        let captureCalls = 0
        const starting = (await CreditAccount.findOne({ where: { userId: owner.user.id } })).balance
        await assert.rejects(captureCreditPurchase(owner.user.id, purchase.id, purchase.paypalOrderId, providerApi(purchase, {
            get: async () => ({ status: 'APPROVED', purchase_units: [{ reference_id: `CREDIT-${purchase.id}`, amount: { value: '0.01', currency_code: 'USD' } }] }),
            capture: async () => { captureCalls += 1 }
        })), /amount.*does not match/i)
        await assert.rejects(captureCreditPurchase(owner.user.id, purchase.id, purchase.paypalOrderId, providerApi(purchase, {
            get: async () => ({ status: 'APPROVED', purchase_units: [{ reference_id: `CREDIT-${purchase.id}`, amount: { value: '2.99', currency_code: 'EUR' } }] }),
            capture: async () => { captureCalls += 1 }
        })), /currency.*does not match/i)
        assert.equal(captureCalls, 0)
        assert.equal((await CreditAccount.findOne({ where: { userId: owner.user.id } })).balance, starting)
        assert.equal(await CreditTransaction.count({ where: { creditPurchaseId: purchase.id } }), 0)
    })

    await t.test('verified capture atomically grants exact credits once', async () => {
        let captureCalls = 0
        const api = providerApi(purchase, { capture: async () => {
            captureCalls += 1
            return providerApi(purchase).capture()
        } })
        const captured = await captureCreditPurchase(owner.user.id, purchase.id, purchase.paypalOrderId, api)
        assert.equal(captured.purchase.status, 'captured')
        assert.equal(captured.purchase.creditsGranted, true)
        assert.equal(captured.balance, 5)
        assert.equal(captured.idempotent, false)

        const repeated = await captureCreditPurchase(owner.user.id, purchase.id, purchase.paypalOrderId, api)
        assert.equal(repeated.idempotent, true)
        assert.equal(repeated.balance, 5)
        assert.equal(captureCalls, 1)
        const entries = await CreditTransaction.findAll({ where: { creditPurchaseId: purchase.id } })
        assert.equal(entries.length, 1)
        assert.deepEqual([entries[0].amount, entries[0].balanceBefore, entries[0].balanceAfter, entries[0].reason], [3, 2, 5, 'purchase'])
    })

    await t.test('a provider-completed order reconciles without recapturing or duplicating credits', async () => {
        const completed = await createCreditPurchase(admin.user.id, 'starter-3', randomUUID(), {
            create: async () => ({ id: `COMPLETED-${randomUUID()}`, status: 'CREATED' }),
            get: async () => { throw new Error('unused') }, capture: async () => { throw new Error('unused') }
        })
        let captureCalls = 0
        const result = await captureCreditPurchase(admin.user.id, completed.id, completed.paypalOrderId, providerApi(completed, {
            get: async () => ({
                status: 'COMPLETED',
                purchase_units: [{
                    reference_id: `CREDIT-${completed.id}`,
                    amount: { value: '2.99', currency_code: 'USD' },
                    payments: { captures: [{ id: `CAPTURE-${completed.id}`, status: 'COMPLETED', amount: { value: '2.99', currency_code: 'USD' } }] }
                }]
            }),
            capture: async () => { captureCalls += 1; throw new Error('must not recapture') }
        }))
        assert.equal(result.balance, 5)
        assert.equal(captureCalls, 0)
        assert.equal(await CreditTransaction.count({ where: { creditPurchaseId: completed.id } }), 1)
    })

    await t.test('cancelled and failed captures remain persisted and grant no credits', async () => {
        async function pending(label) {
            return createCreditPurchase(owner.user.id, 'creator-10', randomUUID(), {
                create: async () => ({ id: `${label}-${randomUUID()}`, status: 'CREATED' }),
                get: async () => { throw new Error('unused') }, capture: async () => { throw new Error('unused') }
            })
        }
        const cancelled = await pending('CANCELLED')
        await assert.rejects(captureCreditPurchase(owner.user.id, cancelled.id, cancelled.paypalOrderId, providerApi(cancelled, {
            get: async () => ({ status: 'VOIDED', purchase_units: [{ reference_id: `CREDIT-${cancelled.id}`, amount: { value: '7.99', currency_code: 'USD' } }] })
        })), /cancelled.*No credits/i)
        assert.equal((await CreditPurchase.findByPk(cancelled.id)).status, 'cancelled')

        const failed = await pending('FAILED')
        await assert.rejects(captureCreditPurchase(owner.user.id, failed.id, failed.paypalOrderId, providerApi(failed, {
            capture: async () => ({ status: 'PAYER_ACTION_REQUIRED', purchase_units: [] })
        })), /did not complete.*No credits/i)
        assert.equal((await CreditPurchase.findByPk(failed.id)).status, 'failed')
        assert.equal((await CreditAccount.findOne({ where: { userId: owner.user.id } })).balance, 5)
        assert.equal(await CreditTransaction.count({ where: { creditPurchaseId: [cancelled.id, failed.id] } }), 0)
    })

    await t.test('credit history is owner-scoped and exposes no secrets', async () => {
        const ownerHistory = await request('/credits/history', { cookie: owner.cookie })
        assert.equal(ownerHistory.response.status, 200)
        assert.equal(ownerHistory.body.balance, 5)
        assert.ok(ownerHistory.body.transactions.some(entry => entry.type === 'free_project'))
        assert.ok(ownerHistory.body.transactions.some(entry => entry.type === 'purchase' && entry.related.purchaseId === purchase.id))
        assert.ok(ownerHistory.body.purchases.some(entry => entry.id === purchase.id && entry.status === 'captured'))
        assert.ok(ownerHistory.body.purchases.some(entry => entry.status === 'cancelled'))
        assert.ok(ownerHistory.body.purchases.some(entry => entry.status === 'failed'))
        assert.equal(JSON.stringify(ownerHistory.body).includes('paypalCaptureId'), false)
        assert.equal(JSON.stringify(ownerHistory.body).includes('providerMetadata'), false)

        const outsiderHistory = await request(`/credits/history?userId=${owner.user.id}`, { cookie: outsider.cookie })
        assert.equal(outsiderHistory.response.status, 200)
        assert.equal(outsiderHistory.body.balance, 2)
        assert.equal(outsiderHistory.body.transactions.some(entry => entry.related.purchaseId === purchase.id), false)
        assert.equal(outsiderHistory.body.purchases.some(entry => entry.id === purchase.id), false)
        assert.equal((await request(`/admin/credits/users/${owner.user.id}`, { cookie: outsider.cookie })).response.status, 403)
    })

    await t.test('admin add and deduct adjustments are audited and cannot go negative', async () => {
        const missingReason = await request(`/admin/credits/users/${owner.user.id}/adjustments`, {
            method: 'POST', cookie: adminCookie, json: { amount: 2 }
        })
        assert.equal(missingReason.response.status, 422)

        const added = await request(`/admin/credits/users/${owner.user.id}/adjustments`, {
            method: 'POST', cookie: adminCookie, json: { amount: 4, reason: 'Customer support goodwill credit' }
        })
        assert.equal(added.response.status, 201)
        assert.equal(added.body.balance, 9)
        const deducted = await request(`/admin/credits/users/${owner.user.id}/adjustments`, {
            method: 'POST', cookie: adminCookie, json: { amount: -3, reason: 'Correction of duplicate manual award' }
        })
        assert.equal(deducted.response.status, 201)
        assert.equal(deducted.body.balance, 6)
        const overdraw = await request(`/admin/credits/users/${owner.user.id}/adjustments`, {
            method: 'POST', cookie: adminCookie, json: { amount: -100, reason: 'Attempted invalid deduction' }
        })
        assert.equal(overdraw.response.status, 409)
        assert.match(overdraw.body.message, /negative/i)

        const entries = await CreditTransaction.findAll({ where: { userId: owner.user.id, reason: 'admin_adjustment' }, order: [['createdAt', 'ASC']] })
        assert.deepEqual(entries.map(entry => entry.amount), [4, -3])
        assert.ok(entries.every(entry => Number(entry.adminUserId) === admin.user.id))
        assert.ok(entries.every(entry => String(entry.metadata.reason).length > 2))
        assert.equal((await CreditAccount.findOne({ where: { userId: owner.user.id } })).balance, 6)

        const view = await request(`/admin/credits/users/${owner.user.id}`, { cookie: adminCookie })
        assert.equal(view.response.status, 200)
        assert.equal(view.body.user.email, owner.email)
        assert.equal(view.body.balance, 6)
    })

    await t.test('completed physical order reward is disabled by default and grants once when configured', async () => {
        const product = await Product.findOne({ include: [ProductVariant] })
        const variant = product.variants[0]
        const order = await Order.create({
            orderNumber: `REWARD-${randomUUID()}`,
            userId: owner.user.id,
            status: 'delivered', paymentStatus: 'captured', fulfillmentStatus: 'delivered',
            subtotal: '12.00', shippingAmount: '0.00', taxAmount: '0.00', totalAmount: '12.00', currency: 'USD'
        })
        createdOrderIds.push(Number(order.id))
        await OrderItem.create({
            orderId: order.id, productId: product.id, productVariantId: variant.id,
            itemType: 'standard', status: 'delivered', productTitle: product.title, variantTitle: variant.title,
            quantity: 1, unitPrice: '12.00', basePrice: '12.00', totalPrice: '12.00',
            currency: 'USD', phoneModel: variant.phoneModel, caseType: variant.caseType
        })
        await Payment.create({
            orderId: order.id, provider: 'paypal', providerOrderId: `REWARD-PAYPAL-${randomUUID()}`,
            providerTransactionId: `REWARD-CAPTURE-${randomUUID()}`, amount: '12.00', currency: 'USD',
            status: 'captured', capturedAt: new Date()
        })

        assert.deepEqual(await grantCompletedOrderReward(Number(order.id)), { granted: false, credits: 0 })
        await SystemSetting.update({ value: { credits: 2 } }, { where: { key: 'phone_case_purchase_reward_credits' } })
        const first = await grantCompletedOrderReward(Number(order.id))
        const second = await grantCompletedOrderReward(Number(order.id))
        assert.equal(first.granted, true)
        assert.equal(first.credits, 2)
        assert.equal(second.granted, false)
        assert.equal(second.idempotent, true)
        assert.equal(await CreditTransaction.count({ where: { orderId: order.id, reason: 'order_reward' } }), 1)
        assert.equal((await CreditAccount.findOne({ where: { userId: owner.user.id } })).balance, 8)
    })

    await t.test('service history describes all ledger records without exposing mutable metadata', async () => {
        const history = await getCreditHistory(owner.user.id)
        assert.ok(history.transactions.some(entry => entry.description.includes('Starter')))
        assert.ok(history.transactions.some(entry => entry.description.includes('Admin adjustment')))
        assert.ok(history.transactions.some(entry => entry.type === 'order_reward' && entry.related.orderId === createdOrderIds[0]))
        assert.ok(history.transactions.every(entry => !('metadata' in entry)))
        assert.ok(history.transactions.every(entry => entry.balanceAfter >= 0))
    })
})

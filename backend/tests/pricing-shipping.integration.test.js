const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const { createHmac, randomUUID } = require('node:crypto')
const { connectDatabase, disconnectDatabase, getDatabase } = require('../dist/database/database')
const {
    Order, OrderItem, Payment, PrintifyWebhookEvent, Product, ProductVariant, ShippingQuote, SystemSetting, User
} = require('../dist/database/models')
const { calculatePricing, moneyToCents } = require('../dist/services/pricing')
const { normalizePrintifyShippingOptions } = require('../dist/services/shipping')
const { getOwnedShippingSelection, shippingAddressHash, shippingLineHash } = require('../dist/services/shipping')
const { handlePrintifyWebhook, verifyPrintifyWebhook } = require('../dist/services/printify-webhooks')
const { attachMockQuoteToOrder } = require('./shipping-test-helper')

const created = { eventIds: [] }
const address = {
    firstName: 'Quote', lastName: 'Tester', email: 'quote@example.com', phone: '+1 555 444 2222',
    address1: '44 Quote Street', city: 'Boston', state: 'MA', postalCode: '02108', countryCode: 'US'
}

before(async () => {
    process.env.DB_ENABLED = 'true'
    process.env.DB_REQUIRED = 'true'
    process.env.PRINTIFY_WEBHOOK_SECRET = 'test-webhook-secret-at-least-20-characters'
    await connectDatabase()
})

after(async () => {
    if (created.eventIds.length) await PrintifyWebhookEvent.destroy({ where: { id: created.eventIds } })
    if (created.orderId) {
        await Payment.destroy({ where: { orderId: created.orderId } })
        await OrderItem.destroy({ where: { orderId: created.orderId } })
        await Order.destroy({ where: { id: created.orderId } })
    }
    if (created.userId) {
        await ShippingQuote.destroy({ where: { userId: created.userId } })
        await User.destroy({ where: { id: created.userId } })
    }
    await disconnectDatabase()
})

test('authoritative cents pricing is exact and contains no extra charge', () => {
    assert.equal(moneyToCents('30.00'), 3000)
    assert.equal(moneyToCents(6.49), 649)
    const pricing = calculatePricing([{ unitPrice: '0.10', quantity: 3 }, { unitPrice: '29.70', quantity: 1 }], 649, 'USD')
    assert.deepEqual(pricing, {
        currency: 'USD', subtotalCents: 3000, shippingCents: 649, taxCents: 0, totalCents: 3649,
        subtotal: 30, shipping: 6.49, tax: 0, total: 36.49
    })
})

test('legacy extra-price fields and setting are absent after migration', async () => {
    const queryInterface = getDatabase().getQueryInterface()
    const cartColumns = await queryInterface.describeTable('cart_items')
    const orderItemColumns = await queryInterface.describeTable('order_items')
    assert.equal(Object.hasOwn(cartColumns, 'customization_markup'), false)
    assert.equal(Object.hasOwn(orderItemColumns, 'customization_markup'), false)
    assert.equal(await SystemSetting.count({ where: { key: 'ai_customization_markup' } }), 0)
})

test('Printify shipping responses are normalized from real cents and unsafe keys are ignored', () => {
    assert.deepEqual(normalizePrintifyShippingOptions({ standard: 649, express: 1299, invented: 1, economy: -2 }), [
        { id: 'standard', name: 'Standard Shipping', shippingMethod: 1, priceCents: 649, price: 6.49, currency: 'USD' },
        { id: 'express', name: 'Express Shipping', shippingMethod: 2, priceCents: 1299, price: 12.99, currency: 'USD' }
    ])
})

test('address, variant, and expiry changes invalidate a persisted shipping quote', async () => {
    const user = await User.create({
        name: 'Expiry Fixture', email: `expiry-${randomUUID()}@example.com`, passwordHash: 'not-a-real-login-hash'
    })
    const line = {
        productId: 'product-a', variantId: '101', quantity: 1, unitPrice: '30.00',
        currency: 'USD', itemType: 'standard'
    }
    assert.notEqual(shippingAddressHash(address), shippingAddressHash({ ...address, postalCode: '02109' }))
    assert.notEqual(shippingLineHash([line]), shippingLineHash([{ ...line, variantId: '102' }]))
    const quote = await ShippingQuote.create({
        id: randomUUID(), userId: user.id, context: 'direct', itemSnapshot: [line], itemSnapshotHash: shippingLineHash([line]),
        addressSnapshot: address, addressHash: shippingAddressHash(address),
        options: [{ id: 'standard', name: 'Standard Shipping', shippingMethod: 1, priceCents: 649, price: 6.49, currency: 'USD' }],
        currency: 'USD', expiresAt: new Date(Date.now() + 60_000)
    })
    try {
        assert.equal((await getOwnedShippingSelection(Number(user.id), quote.id, 'standard')).option.priceCents, 649)
        assert.equal(await getOwnedShippingSelection(Number(user.id) + 999999, quote.id, 'standard').catch(error => error.status), 404)
        await quote.update({ expiresAt: new Date(Date.now() - 1000) })
        assert.equal(await getOwnedShippingSelection(Number(user.id), quote.id, 'standard').catch(error => error.status), 409)
    } finally {
        await quote.destroy()
        await user.destroy()
    }
})

test('Printify webhook HMAC verification and retries are idempotent', async () => {
    const user = await User.create({
        name: 'Webhook Fixture', email: `webhook-${randomUUID()}@example.com`, passwordHash: 'not-a-real-login-hash'
    })
    created.userId = Number(user.id)
    const product = await Product.findOne({
        include: [{ model: ProductVariant, where: { available: true, isEnabled: true }, required: true }]
    })
    const variant = product.variants.find(value => /^\d+$/.test(value.printifyVariantId))
    assert.ok(product && variant)
    const providerOrderId = `WEBHOOK-${randomUUID()}`
    const order = await Order.create({
        userId: user.id, orderNumber: `WEBHOOK-${randomUUID()}`, status: 'sent_to_printify', paymentStatus: 'captured',
        fulfillmentStatus: 'submitted', shippingAddressSnapshot: address,
        subtotal: '30.00', shippingAmount: '0.00', taxAmount: '0.00', totalAmount: '30.00', currency: 'USD',
        printifyOrderId: providerOrderId, printifyShopId: process.env.PRINTIFY_SHOP_ID
    })
    created.orderId = Number(order.id)
    await Payment.create({
        orderId: order.id,
        provider: 'paypal',
        providerOrderId: `WEBHOOK-PAYPAL-${randomUUID()}`,
        providerTransactionId: `WEBHOOK-CAPTURE-${randomUUID()}`,
        amount: order.totalAmount,
        currency: order.currency,
        status: 'captured',
        capturedAt: new Date()
    })
    await OrderItem.create({
        orderId: order.id, productId: product.id, productVariantId: variant.id, itemType: 'standard', status: 'sent_to_printify',
        productTitle: product.title, variantTitle: variant.title, phoneModel: variant.phoneModel, caseType: variant.caseType,
        quantity: 1, unitPrice: '30.00', basePrice: '30.00', totalPrice: '30.00', currency: 'USD',
        printifyProductIdSnapshot: product.printifyProductId, printifyVariantIdSnapshot: variant.printifyVariantId,
        printifyBlueprintIdSnapshot: product.blueprintId, printifyProviderIdSnapshot: product.printProviderId
    })
    await attachMockQuoteToOrder(order, address)

    const event = {
        id: randomUUID(), type: 'order:shipment:created', created_at: new Date().toISOString(),
        resource: {
            id: providerOrderId, type: 'order', data: {
                shop_id: process.env.PRINTIFY_SHOP_ID, shipped_at: new Date().toISOString(),
                carrier: { code: 'USPS', tracking_number: 'IDEMPOTENT-TRACK', tracking_url: 'https://tracking.example/IDEMPOTENT-TRACK' }
            }
        }
    }
    created.eventIds.push(event.id)
    const body = Buffer.from(JSON.stringify(event))
    const signature = `sha256=${createHmac('sha256', process.env.PRINTIFY_WEBHOOK_SECRET).update(body).digest('hex')}`
    assert.equal(verifyPrintifyWebhook(body, signature), true)
    const tampered = `${signature.slice(0, 7)}${signature[7] === '0' ? '1' : '0'}${signature.slice(8)}`
    assert.equal(verifyPrintifyWebhook(body, tampered), false)
    const first = await handlePrintifyWebhook(body, signature)
    const retry = await handlePrintifyWebhook(body, signature)
    assert.equal(first.idempotent, false)
    assert.equal(retry.idempotent, true)
    assert.equal(await PrintifyWebhookEvent.count({ where: { id: event.id } }), 1)
    const stored = await Order.findByPk(order.id)
    assert.equal(stored.status, 'shipped')
    assert.equal(stored.trackingNumber, 'IDEMPOTENT-TRACK')

    await order.update({ paymentStatus: 'created' })
    const unpaidEvent = {
        ...event,
        id: randomUUID(),
        type: 'order:shipment:delivered',
        resource: { ...event.resource, data: { ...event.resource.data, delivered_at: new Date().toISOString() } }
    }
    created.eventIds.push(unpaidEvent.id)
    const unpaidBody = Buffer.from(JSON.stringify(unpaidEvent))
    const unpaidSignature = `sha256=${createHmac('sha256', process.env.PRINTIFY_WEBHOOK_SECRET).update(unpaidBody).digest('hex')}`
    await handlePrintifyWebhook(unpaidBody, unpaidSignature)
    assert.equal((await PrintifyWebhookEvent.findByPk(unpaidEvent.id)).outcome, 'ignored_unpaid')
    assert.equal((await OrderItem.findOne({ where: { orderId: order.id } })).status, 'shipped')

    await order.update({ paymentStatus: 'captured' })
    const staleEvent = {
        ...event,
        id: randomUUID(),
        type: 'order:sent-to-production',
        resource: { ...event.resource, data: { ...event.resource.data, status: 'in-production' } }
    }
    created.eventIds.push(staleEvent.id)
    const staleBody = Buffer.from(JSON.stringify(staleEvent))
    const staleSignature = `sha256=${createHmac('sha256', process.env.PRINTIFY_WEBHOOK_SECRET).update(staleBody).digest('hex')}`
    await handlePrintifyWebhook(staleBody, staleSignature)
    assert.equal((await PrintifyWebhookEvent.findByPk(staleEvent.id)).outcome, 'ignored_out_of_order')
    assert.equal((await OrderItem.findOne({ where: { orderId: order.id } })).status, 'shipped')
})

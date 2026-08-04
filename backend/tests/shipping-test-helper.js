const { randomUUID } = require('node:crypto')
const { OrderItem, ShippingQuote } = require('../dist/database/models')
const { createShippingQuote, shippingAddressHash, shippingLineHash } = require('../dist/services/shipping')
const { calculatePricing } = require('../dist/services/pricing')

const defaultRates = { standard: 649, express: 1299 }

async function mockShippingQuote(userId, input, rates = defaultRates) {
    return createShippingQuote(userId, input, { calculate: async () => ({ ...rates }) })
}

async function attachMockQuoteToOrder(order, address, priceCents = 649) {
    const items = await OrderItem.findAll({ where: { orderId: order.id } })
    const lines = items.map(item => ({
        productId: item.printifyProductIdSnapshot,
        variantId: item.printifyVariantIdSnapshot,
        blueprintId: item.printifyBlueprintIdSnapshot,
        printProviderId: item.printifyProviderIdSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        currency: item.currency,
        itemType: item.itemType
    }))
    const id = randomUUID()
    const option = {
        id: 'standard', name: 'Standard Shipping', shippingMethod: 1,
        priceCents, price: priceCents / 100, currency: order.currency
    }
    const expiresAt = new Date(Date.now() + 15 * 60_000)
    await ShippingQuote.create({
        id, userId: order.userId, context: 'direct', itemSnapshot: lines,
        itemSnapshotHash: shippingLineHash(lines), addressSnapshot: address,
        addressHash: shippingAddressHash(address), options: [option], currency: order.currency, expiresAt
    })
    const pricing = calculatePricing(items, priceCents, order.currency)
    await order.update({
        shippingQuoteId: id, shippingMethodId: option.id, shippingMethodCode: option.shippingMethod,
        shippingMethodName: option.name, shippingQuoteExpiresAt: expiresAt,
        subtotal: pricing.subtotal.toFixed(2), shippingAmount: pricing.shipping.toFixed(2),
        taxAmount: '0.00', totalAmount: pricing.total.toFixed(2)
    })
    return { id, option, pricing }
}

module.exports = { attachMockQuoteToOrder, mockShippingQuote }

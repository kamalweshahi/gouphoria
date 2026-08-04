const test = require('node:test')
const assert = require('node:assert/strict')
const {
    filterPhoneCaseProducts,
    mapPrintifyProduct,
    normalizeCaseType,
    normalizePhoneModel,
    selectPrintifyVariant
} = require('../dist/services/printify')

function phoneProduct(overrides = {}) {
    return {
        id: 'phone-product',
        title: 'Magnetic Tough Phone Case',
        tags: ['phone case', 'magnetic case'],
        visible: true,
        images: [
            { src: 'default.jpg', is_default: true, variant_ids: ['101'] },
            { src: 'iphone-14-pro.jpg', variant_ids: ['102'] }
        ],
        variants: [
            { id: '101', title: 'iPhone 14 / Glossy', price: 3500, is_enabled: true, is_available: true, options: [1, 2] },
            { id: '102', title: ' iphone 14 pro / matte ', price: 3900, is_enabled: true, is_available: false, options: [3, 4] },
            { id: '103', title: 'iPhone 15 / Glossy', price: 4100, is_enabled: false, is_available: true, options: [5, 6] }
        ],
        ...overrides
    }
}

test('phone-case-only filtering removes unrelated Printify products', () => {
    const mug = {
        id: 'mug',
        title: 'Ceramic Mug',
        tags: ['mug', 'home'],
        visible: true,
        variants: [{ id: '201', title: '11oz', price: 1200, is_enabled: true, is_available: true }]
    }
    const products = filterPhoneCaseProducts([phoneProduct(), mug])
    assert.equal(products.length, 1)
    assert.equal(products[0].id, 'phone-product')
})

test('all enabled variants are preserved with availability, pricing, images, and metadata', () => {
    const product = mapPrintifyProduct(phoneProduct())
    assert.equal(product.variants.length, 2)
    assert.deepEqual(product.variants.map(variant => variant.id), ['101', '102'])
    assert.equal(product.variants[1].available, false)
    assert.equal(product.variants[1].price, 39)
    assert.equal(product.variants[1].image, 'iphone-14-pro.jpg')
    assert.deepEqual(product.variants[1].metadata.options, [3, 4])
})

test('phone-model normalization removes harmless naming differences without inventing models', () => {
    assert.equal(normalizePhoneModel(' iphone 14 pro '), 'iPhone 14 Pro')
    assert.equal(normalizePhoneModel('iPhone 14  PRO'), 'iPhone 14 Pro')
    assert.equal(normalizePhoneModel('Samsung   galaxy S24 ultra'), 'Samsung Galaxy S24 ultra')
    assert.equal(normalizePhoneModel('iPhone 5/5s/5se'), 'iPhone 5 / 5s / 5SE')
})

test('case-type normalization uses actual variant data and product tags', () => {
    assert.equal(normalizeCaseType(' glossy '), 'Glossy')
    assert.equal(normalizeCaseType('GLOSSY'), 'Glossy')
    const tough = phoneProduct({ tags: ['phone case', 'tough phone case'] })
    assert.equal(normalizeCaseType('', tough), 'Tough Phone Case')
})

test('invalid product/variant combinations and disabled variants are rejected', () => {
    assert.throws(
        () => selectPrintifyVariant(phoneProduct(), 'does-not-belong'),
        error => error.status === 400 && /does not belong/i.test(error.message)
    )
    assert.throws(
        () => selectPrintifyVariant(phoneProduct(), '103'),
        error => error.status === 409 && /disabled/i.test(error.message)
    )
    assert.throws(
        () => selectPrintifyVariant(phoneProduct(), '102'),
        error => error.status === 409 && /unavailable/i.test(error.message)
    )
})

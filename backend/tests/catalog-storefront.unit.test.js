const test = require('node:test')
const assert = require('node:assert/strict')
const { isCustomerFacingCatalogTitle } = require('../dist/services/catalog')

test('storefront title guard hides internal API and integration products', () => {
    for (const title of [
        'API PHASE7-a3de53a9',
        'API CS-20260812-26602',
        'Phase 3 Test Tough Phone Case',
        'Integration Test Phone Case',
        'Smoke product 12'
    ]) assert.equal(isCustomerFacingCatalogTitle(title), false, title)

    for (const title of [
        'Sporty Tough Phone Case',
        'Black White Leopard Case',
        'Midnight Floral Tough Case',
        'Classic Clear Phone Case'
    ]) assert.equal(isCustomerFacingCatalogTitle(title), true, title)
})

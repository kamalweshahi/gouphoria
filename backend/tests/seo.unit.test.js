const test = require('node:test')
const assert = require('node:assert/strict')
const {
    buildRobotsTxt,
    buildSitemap,
    CANONICAL_SITE_ORIGIN,
    PUBLIC_SITEMAP_PATHS
} = require('../dist/services/seo')

test('sitemap contains canonical public routes and unique dynamic products', () => {
    const sitemap = buildSitemap([
        { id: 'active-product', updatedAt: '2026-08-04T10:00:00.000Z' },
        { id: 'active-product', updatedAt: '2026-08-04T10:00:00.000Z' },
        { id: 'phone & case' }
    ])
    assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/)
    assert.match(sitemap, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/)
    for (const path of PUBLIC_SITEMAP_PATHS) {
        assert.match(sitemap, new RegExp(`<loc>${CANONICAL_SITE_ORIGIN.replaceAll('.', '\\.')}\/?${path === '/' ? '' : path.slice(1)}<\\/loc>`))
    }
    assert.equal((sitemap.match(/products\/active-product/g) || []).length, 1)
    assert.match(sitemap, /products\/phone%20%26%20case/)
    assert.match(sitemap, /<lastmod>2026-08-04T10:00:00\.000Z<\/lastmod>/)
    assert.doesNotMatch(sitemap, /<loc>[^<]*\?/)
    assert.doesNotMatch(sitemap, /<loc>https:\/\/gouphoria\.com\/(?:login|register|cart|orders|designs|admin)(?:\/|<)/)
})

test('robots allows public crawling, blocks private and API routes, and advertises sitemap', () => {
    const robots = buildRobotsTxt()
    assert.match(robots, /^User-agent: \*\nAllow: \//)
    for (const path of ['/login', '/register', '/profile', '/cart', '/create-ai', '/designs', '/orders', '/credits', '/admin', '/health', '/products/ai-customizable', '/products/sync', '/auth/', '/payments/', '/ai/', '/webhooks/', '/api/']) {
        assert.match(robots, new RegExp(`Disallow: ${path.replace('/', '\\/')}`))
    }
    assert.match(robots, /Sitemap: https:\/\/gouphoria\.com\/sitemap\.xml/)
    assert.doesNotMatch(robots, /^Disallow: \/(?:products|about|support)$/m)
})

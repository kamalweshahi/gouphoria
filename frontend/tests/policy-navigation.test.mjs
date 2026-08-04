import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const requiredPublicRoutes = [
    '/privacy',
    '/terms',
    '/shipping-policy',
    '/refund-policy',
    '/ai-design-policy',
    '/content-policy',
    '/faq',
    '/support'
]

const requiredFooterRoutes = [
    '/products',
    '/create-ai',
    '/designs',
    '/orders',
    ...requiredPublicRoutes
]

test('policy and support routes are registered and linked from the footer', async () => {
    const [main, footer, metadata, policies] = await Promise.all([
        readFile(new URL('../src/components/layout/main/Main.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/layout/footer/Footer.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/app/RouteMetadata.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/pages/policies/PolicyPages.tsx', import.meta.url), 'utf8')
    ])

    for (const route of requiredPublicRoutes) {
        assert.match(main, new RegExp(`path="${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `${route} must be routed`)
        assert.match(metadata, new RegExp(`path === '${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`), `${route} needs metadata`)
    }
    for (const route of requiredFooterRoutes) {
        assert.match(footer, new RegExp(`to="${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `${route} must be linked`)
    }

    assert.match(policies, /This form opens your configured email application/)
    assert.match(policies, /Gouphoria Support/)
    assert.match(policies, /GPH-1234/)
    assert.match(policies, /Support contact details are being updated/)
    assert.doesNotMatch(policies, /\[OWNER REVIEW:|support@example\.com|\bTODO\b|\bTBD\b/)
    assert.match(policies, /PayPal/)
    assert.doesNotMatch(policies, /Printify/i)
})

test('every static footer link resolves to an application route', async () => {
    const [main, footer] = await Promise.all([
        readFile(new URL('../src/components/layout/main/Main.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/components/layout/footer/Footer.tsx', import.meta.url), 'utf8')
    ])
    const links = [...footer.matchAll(/<Link\s+to="([^"]+)"/g)].map(match => match[1])
    for (const route of links) {
        if (route === '/') continue
        assert.match(main, new RegExp(`path="${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `Footer link ${route} is dead`)
    }
})

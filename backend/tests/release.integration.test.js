const test = require('node:test')
const assert = require('node:assert/strict')

const baseUrl = process.env.RELEASE_TEST_BASE_URL || 'http://localhost:3000'

test('release HTTP safeguards', async t => {
    await t.test('health response includes defensive headers without framework disclosure', async () => {
        const response = await fetch(`${baseUrl}/health`)
        assert.equal(response.status, 200)
        assert.equal(response.headers.get('x-powered-by'), null)
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
        assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
        assert.match(response.headers.get('permissions-policy') || '', /camera=\(\)/)
        assert.equal(response.headers.get('x-frame-options'), 'DENY')
        assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups')
        assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-site')
        assert.deepEqual(await response.json(), { status: 'ok', app: 'printify-store' })
    })

    await t.test('unknown routes return a safe JSON response with an event reference', async () => {
        const response = await fetch(`${baseUrl}/not-a-real-release-route`)
        const body = await response.json()
        assert.equal(response.status, 404)
        assert.equal(body.message, 'The requested resource was not found.')
        assert.match(body.eventId, /^[0-9a-f-]{36}$/i)
        assert.equal('stack' in body, false)
    })

    await t.test('oversized JSON is rejected without echoing input or stack details', async () => {
        const marker = 'release-secret-marker'
        const response = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: 'release@example.com', password: marker.repeat(7000) })
        })
        const body = await response.json()
        assert.equal(response.status, 413)
        assert.equal(body.message, 'The request is too large.')
        assert.equal(JSON.stringify(body).includes(marker), false)
        assert.equal('stack' in body, false)
    })

    await t.test('unapproved browser origins receive no CORS authorization', async () => {
        const response = await fetch(`${baseUrl}/health`, { headers: { origin: 'https://unapproved.invalid' } })
        assert.equal(response.headers.get('access-control-allow-origin'), null)
    })
})

const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const mysql = require('mysql2/promise')

const baseUrl = process.env.RATE_LIMIT_TEST_BASE_URL || 'http://localhost:3000'
const password = 'RateLimits9Secure'
let user
let cookie

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
    if (options.cookie) headers.cookie = options.cookie
    let body
    if (options.json !== undefined) {
        headers['content-type'] = 'application/json'
        body = JSON.stringify(options.json)
    } else if (options.form) {
        body = options.form
    }
    const response = await fetch(`${baseUrl}${path}`, {
        method: options.method || 'GET',
        headers,
        body
    })
    const responseBody = (response.headers.get('content-type') || '').includes('application/json')
        ? await response.json()
        : undefined
    return { response, body: responseBody }
}

before(async () => {
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`
    const email = `rate-limit-owner-${suffix}@example.com`
    const registered = await request('/auth/register', {
        method: 'POST',
        json: { name: 'Rate Limit Owner', email, password, confirmPassword: password }
    })
    assert.equal(registered.response.status, 201)
    user = { ...registered.body.user, email }
    cookie = registered.response.headers.get('set-cookie').split(';')[0]
})

after(async () => {
    if (!user) return
    const database = await databaseConnection()
    await database.execute('DELETE FROM user_sessions WHERE user_id = ?', [user.id])
    await database.execute('DELETE FROM credit_transactions WHERE user_id = ?', [user.id])
    await database.execute('DELETE FROM credit_accounts WHERE user_id = ?', [user.id])
    await database.execute('DELETE FROM users WHERE id = ?', [user.id])
    await database.end()
})

test('central rate limits reject abusive bursts without creating protected records', async t => {
    await t.test('repeated failed login attempts return a retryable 429 without account disclosure', async () => {
        let limited
        for (let index = 0; index < 11; index += 1) {
            limited = await request('/auth/login', {
                method: 'POST',
                json: { email: `unknown-rate-limit-${user.id}@example.com`, password: 'WrongPassword9' }
            })
        }
        assert.equal(limited.response.status, 429)
        assert.equal(limited.body.code, 'RATE_LIMITED')
        assert.equal(limited.body.recoverable, true)
        assert.ok(Number(limited.response.headers.get('retry-after')) >= 1)
        assert.doesNotMatch(limited.body.message, /unknown-rate-limit/i)
    })

    await t.test('upload bursts are limited before files or database records are created', async () => {
        const database = await databaseConnection()
        const [beforeRows] = await database.execute('SELECT COUNT(*) AS total FROM uploaded_images WHERE user_id = ?', [user.id])
        await database.end()

        let limited
        for (let index = 0; index < 13; index += 1) {
            const form = new FormData()
            form.append('images', new Blob([Buffer.from('not-an-image')], { type: 'image/png' }), `bad-${index}.png`)
            limited = await request('/ai/designs/999999999/uploads', {
                method: 'POST',
                cookie,
                form
            })
        }
        assert.equal(limited.response.status, 429)
        assert.equal(limited.body.code, 'RATE_LIMITED')

        const verification = await databaseConnection()
        const [afterRows] = await verification.execute('SELECT COUNT(*) AS total FROM uploaded_images WHERE user_id = ?', [user.id])
        await verification.end()
        assert.equal(Number(afterRows[0].total), Number(beforeRows[0].total))
    })

    await t.test('payment bursts are limited while existing idempotency remains the duplicate-payment control', async () => {
        let limited
        for (let index = 0; index < 21; index += 1) {
            limited = await request('/payments/paypal/create-order', {
                method: 'POST',
                cookie,
                json: {}
            })
        }
        assert.equal(limited.response.status, 429)
        assert.equal(limited.body.code, 'RATE_LIMITED')
        assert.match(limited.body.message, /payment requests/i)
    })

    await t.test('sensitive admin action bursts are bounded independently', async () => {
        const database = await databaseConnection()
        await database.execute("UPDATE users SET role = 'admin' WHERE id = ?", [user.id])
        await database.end()
        const login = await request('/auth/login', {
            method: 'POST',
            json: { email: user.email, password }
        })
        assert.equal(login.response.status, 200)
        const adminCookie = login.response.headers.get('set-cookie').split(';')[0]

        let limited
        for (let index = 0; index < 31; index += 1) {
            limited = await request('/admin/customers/999999999/status', {
                method: 'PATCH',
                cookie: adminCookie,
                json: { status: 'disabled' }
            })
        }
        assert.equal(limited.response.status, 429)
        assert.equal(limited.body.code, 'RATE_LIMITED')
        assert.match(limited.body.message, /admin actions/i)
    })

    await t.test('registration bursts eventually receive a generic retryable 429', async () => {
        let limited
        for (let index = 0; index < 31; index += 1) {
            limited = await request('/auth/register', {
                method: 'POST',
                json: {
                    name: '',
                    email: `invalid-register-${user.id}-${index}@example.com`,
                    password: 'short',
                    confirmPassword: 'different'
                }
            })
            if (limited.response.status === 429) break
        }
        assert.equal(limited.response.status, 429)
        assert.equal(limited.body.code, 'RATE_LIMITED')
        assert.ok(Number(limited.response.headers.get('retry-after')) >= 1)
    })
})

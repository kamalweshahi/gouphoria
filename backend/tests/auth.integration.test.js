const { after, test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash, randomUUID } = require('node:crypto')
const mysql = require('mysql2/promise')

const baseUrl = process.env.AUTH_TEST_BASE_URL || 'http://localhost:3000'
const testPassword = 'PhoneCase9Secure'
const createdUserIds = []

function cookieFrom(response) {
    const setCookie = response.headers.get('set-cookie')
    assert.ok(setCookie, 'Expected a session cookie')
    return { cookie: setCookie.split(';')[0], setCookie }
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

    const contentType = response.headers.get('content-type') || ''
    const body = contentType.includes('application/json') ? await response.json() : undefined
    return { response, body }
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

after(async () => {
    if (!createdUserIds.length) return
    const database = await databaseConnection()
    const placeholders = createdUserIds.map(() => '?').join(',')
    await database.execute(`DELETE FROM user_sessions WHERE user_id IN (${placeholders})`, createdUserIds)
    await database.execute(`DELETE FROM credit_transactions WHERE user_id IN (${placeholders})`, createdUserIds)
    await database.execute(`DELETE FROM credit_accounts WHERE user_id IN (${placeholders})`, createdUserIds)
    await database.execute(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds)
    await database.end()
})

test('authentication and user-account integration flow', async t => {
    const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`
    const firstEmail = `auth-first-${suffix}@example.com`
    const secondEmail = `auth-second-${suffix}@example.com`
    let firstUser
    let firstCookie
    let secondUser

    await t.test('protected endpoints reject anonymous requests', async () => {
        const result = await request('/auth/me')
        assert.equal(result.response.status, 401)
        assert.match(result.body.message, /log in/i)
    })

    await t.test('registration validates password confirmation', async () => {
        const result = await request('/auth/register', {
            method: 'POST',
            json: {
                name: 'Invalid Registration',
                email: `invalid-${suffix}@example.com`,
                password: testPassword,
                confirmPassword: 'Different9Password'
            }
        })
        assert.equal(result.response.status, 422)
        assert.match(result.body.message, /passwords do not match/i)
    })

    await t.test('registration creates a safe user, secure development cookie, and free allowance', async () => {
        const result = await request('/auth/register', {
            method: 'POST',
            json: {
                name: 'First Auth User',
                email: firstEmail,
                password: testPassword,
                confirmPassword: testPassword
            }
        })

        assert.equal(result.response.status, 201)
        firstUser = result.body.user
        createdUserIds.push(firstUser.id)
        assert.equal(firstUser.email, firstEmail)
        assert.equal(firstUser.role, 'user')
        assert.equal(firstUser.credits.balance, 2)
        assert.equal(firstUser.credits.freeProjectAvailable, true)
        assert.equal('passwordHash' in firstUser, false)
        assert.equal('sessionToken' in result.body, false)

        const sessionCookie = cookieFrom(result.response)
        firstCookie = sessionCookie.cookie
        assert.match(sessionCookie.setCookie, /HttpOnly/i)
        assert.match(sessionCookie.setCookie, /SameSite=Lax/i)
        assert.doesNotMatch(sessionCookie.setCookie, /;\s*Secure/i)

        const rawToken = firstCookie.slice(firstCookie.indexOf('=') + 1)
        const expectedHash = createHash('sha256').update(rawToken).digest('hex')
        const database = await databaseConnection()
        const [users] = await database.execute('SELECT password_hash FROM users WHERE id = ?', [firstUser.id])
        const [sessions] = await database.execute('SELECT token_hash FROM user_sessions WHERE user_id = ?', [firstUser.id])
        const [accounts] = await database.execute('SELECT balance, free_project_used FROM credit_accounts WHERE user_id = ?', [firstUser.id])
        const [transactions] = await database.execute('SELECT amount, reason FROM credit_transactions WHERE user_id = ?', [firstUser.id])
        await database.end()

        assert.notEqual(users[0].password_hash, testPassword)
        assert.match(users[0].password_hash, /^\$2/)
        assert.equal(sessions[0].token_hash, expectedHash)
        assert.notEqual(sessions[0].token_hash, rawToken)
        assert.equal(accounts[0].balance, 2)
        assert.equal(accounts[0].free_project_used, 0)
        assert.equal(transactions[0].amount, 2)
        assert.equal(transactions[0].reason, 'free_project')
    })

    await t.test('email uniqueness is case-insensitive', async () => {
        const result = await request('/auth/register', {
            method: 'POST',
            json: {
                name: 'Duplicate User',
                email: firstEmail.toUpperCase(),
                password: testPassword,
                confirmPassword: testPassword
            }
        })
        assert.equal(result.response.status, 409)
        assert.match(result.body.message, /already exists/i)
    })

    await t.test('session restoration and profile return only the authenticated user', async () => {
        const current = await request('/auth/me', { cookie: firstCookie })
        assert.equal(current.response.status, 200)
        assert.equal(current.body.user.id, firstUser.id)
        assert.equal('passwordHash' in current.body.user, false)

        const profile = await request('/auth/profile', { cookie: firstCookie })
        assert.equal(profile.response.status, 200)
        assert.equal(profile.body.user.email, firstEmail)
    })

    await t.test('one user cannot access another user profile', async () => {
        const second = await request('/auth/register', {
            method: 'POST',
            json: {
                name: 'Second Auth User',
                email: secondEmail,
                password: testPassword,
                confirmPassword: testPassword
            }
        })
        assert.equal(second.response.status, 201)
        secondUser = second.body.user
        createdUserIds.push(secondUser.id)

        const forbidden = await request(`/auth/users/${secondUser.id}`, { cookie: firstCookie })
        assert.equal(forbidden.response.status, 403)
        assert.match(forbidden.body.message, /cannot access another user/i)

        const ownProfile = await request(`/auth/users/${firstUser.id}`, { cookie: firstCookie })
        assert.equal(ownProfile.response.status, 200)
        assert.equal(ownProfile.body.user.id, firstUser.id)
    })

    await t.test('admin role authorization can access another user profile', async () => {
        const database = await databaseConnection()
        await database.execute("UPDATE users SET role = 'admin' WHERE id = ?", [secondUser.id])
        await database.end()

        const adminLogin = await request('/auth/login', {
            method: 'POST',
            json: { email: secondEmail, password: testPassword }
        })
        assert.equal(adminLogin.response.status, 200)
        assert.equal(adminLogin.body.user.role, 'admin')
        const adminCookie = cookieFrom(adminLogin.response).cookie

        const firstProfile = await request(`/auth/users/${firstUser.id}`, { cookie: adminCookie })
        assert.equal(firstProfile.response.status, 200)
        assert.equal(firstProfile.body.user.id, firstUser.id)
    })

    await t.test('login rejects invalid credentials and restores a valid session', async () => {
        const invalid = await request('/auth/login', {
            method: 'POST',
            json: { email: firstEmail, password: 'WrongPassword9' }
        })
        assert.equal(invalid.response.status, 401)
        assert.match(invalid.body.message, /incorrect/i)

        const valid = await request('/auth/login', {
            method: 'POST',
            json: { email: firstEmail, password: testPassword }
        })
        assert.equal(valid.response.status, 200)
        const loginCookie = cookieFrom(valid.response).cookie
        const restored = await request('/auth/me', { cookie: loginCookie })
        assert.equal(restored.response.status, 200)
        assert.equal(restored.body.user.email, firstEmail)
        firstCookie = loginCookie
    })

    await t.test('logout revokes the server-side session', async () => {
        const logout = await request('/auth/logout', { method: 'POST', cookie: firstCookie })
        assert.equal(logout.response.status, 204)
        assert.match(logout.response.headers.get('set-cookie') || '', /Max-Age=0|Expires=/i)

        const revoked = await request('/auth/me', { cookie: firstCookie })
        assert.equal(revoked.response.status, 401)
    })
})

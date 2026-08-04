import loadEnvFile from './load-env'
import express, { json } from 'express'
import logError from './middlewares/error/log-error'
import config from 'config'
import respondError from './middlewares/error/error-responder'
import notFound from './middlewares/not-found'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import productsRouter from './routers/products'
import paymentsRouter from './routers/payments'
import { connectDatabase, disconnectDatabase } from './database/database'
import authRouter from './routers/auth'
import cartRouter from './routers/cart'
import ordersRouter from './routers/orders'
import aiRouter from './routers/ai'
import adminRouter from './routers/admin'
import creditsRouter from './routers/credits'
import webhooksRouter from './routers/webhooks'
import { backfillRealisticMockupPreviews } from './services/mockup-backfill'

loadEnvFile();

(async () => {
    const port = config.get<number>('app.port')
    const name = config.get<string>('app.name')

    const database = await connectDatabase()
    if (database && !['0', 'false', 'off', 'no'].includes((process.env.MOCKUP_BACKFILL_ENABLED ?? 'true').toLowerCase())) {
        const backfill = await backfillRealisticMockupPreviews()
        if (backfill.candidates) console.info('realistic mockup preview backfill completed', backfill)
    }

    const app = express()
    app.disable('x-powered-by')
    const trustProxy = process.env.TRUST_PROXY?.trim()
    if (process.env.NODE_ENV === 'production' && trustProxy) {
        app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy)
    }

    const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean)
    const developmentOrigins = process.env.NODE_ENV === 'production'
        ? []
        : ['http://localhost:5173', 'http://localhost:6124']
    const allowedOrigins = new Set([...configuredOrigins, ...developmentOrigins])

    app.use('/', cors({
        credentials: true,
        origin(origin, callback) {
            if (!origin || allowedOrigins.has(origin)) return callback(null, true)
            callback(new Error('Origin is not allowed by CORS.'))
        }
    }))
    app.use('/', (request, response, next) => {
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.setHeader('Referrer-Policy', 'no-referrer')
        response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        response.setHeader('X-Frame-Options', 'DENY')
        response.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
        response.setHeader('Cross-Origin-Resource-Policy', 'same-site')
        next()
    })
    app.use('/webhooks', webhooksRouter)
    app.use('/', json({ limit: process.env.REQUEST_JSON_LIMIT ?? '100kb' }))
    app.use('/', cookieParser())

    app.get('/health', (request, response) => response.json({ status: 'ok', app: name }))
    app.use('/auth', authRouter)
    app.use('/products', productsRouter)
    app.use('/cart', cartRouter)
    app.use('/orders', ordersRouter)
    app.use('/payments', paymentsRouter)
    app.use('/ai', aiRouter)
    app.use('/credits', creditsRouter)
    app.use('/admin', adminRouter)

    app.use('/', notFound)
    app.use('/', logError)
    app.use('/', respondError)

    const server = app.listen(port, error => {
        if (error) {
            console.error(`app ${name} failed to start: ${error.message}`)
            void disconnectDatabase().finally(() => process.exit(1))
            return
        }
        console.log(`app ${name} started on port ${port}....`)
    })

    async function shutdown(signal: string) {
        console.info(`${signal} received; shutting down`)
        server.close(async () => {
            await disconnectDatabase()
            process.exit(0)
        })
    }

    process.once('SIGINT', () => void shutdown('SIGINT'))
    process.once('SIGTERM', () => void shutdown('SIGTERM'))
})().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})

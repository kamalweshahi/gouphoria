import 'reflect-metadata'
import { Sequelize } from 'sequelize-typescript'
import { databaseModels } from './models'
import { runDatabaseMigrations } from './migrations'

export type DatabaseStatus = 'disabled' | 'connecting' | 'connected' | 'unavailable'

let sequelize: Sequelize | undefined
let databaseStatus: DatabaseStatus = 'disabled'

function isEnabled(value: string | undefined, fallback = false) {
    if (value === undefined) return fallback
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function databasePort() {
    const port = Number(process.env.DB_PORT ?? 3306)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('DB_PORT must be a valid TCP port')
    }
    return port
}

function createSequelize() {
    return new Sequelize({
        dialect: 'mysql',
        host: process.env.DB_HOST ?? 'localhost',
        port: databasePort(),
        database: process.env.DB_NAME ?? 'case_store',
        username: process.env.DB_USER ?? 'case_store',
        password: process.env.DB_PASSWORD ?? '',
        models: databaseModels,
        logging: isEnabled(process.env.DB_LOGGING) ? message => console.info(`[database] ${message}`) : false,
        pool: {
            max: Number(process.env.DB_POOL_MAX ?? 10),
            min: Number(process.env.DB_POOL_MIN ?? 0),
            acquire: Number(process.env.DB_POOL_ACQUIRE_MS ?? 30000),
            idle: Number(process.env.DB_POOL_IDLE_MS ?? 10000)
        },
        dialectOptions: {
            connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 10000)
        },
        define: {
            underscored: true
        }
    })
}

export async function connectDatabase() {
    if (!isEnabled(process.env.DB_ENABLED)) {
        databaseStatus = 'disabled'
        return undefined
    }

    databaseStatus = 'connecting'
    sequelize = createSequelize()

    try {
        await sequelize.authenticate()
        if (isEnabled(process.env.DB_SYNC)) {
            // Safe bootstrap for local/Compose environments: creates missing tables
            // without alter or force. Production schema changes will use migrations.
            await sequelize.sync()
        }
        if (isEnabled(process.env.DB_MIGRATE, true)) {
            await runDatabaseMigrations(sequelize)
        }
        databaseStatus = 'connected'
        console.info('database connection established')
        return sequelize
    } catch (error) {
        databaseStatus = 'unavailable'
        const message = error instanceof Error ? error.message : 'unknown database error'

        if (isEnabled(process.env.DB_REQUIRED)) {
            throw new Error(`Database connection failed: ${message}`)
        }

        console.warn(`database unavailable; existing storefront routes remain active: ${message}`)
        return undefined
    }
}

export function getDatabase() {
    if (!sequelize || databaseStatus !== 'connected') {
        throw new Error('Database is not connected')
    }
    return sequelize
}

export function getDatabaseStatus() {
    return databaseStatus
}

export async function disconnectDatabase() {
    if (!sequelize) return
    await sequelize.close()
    sequelize = undefined
    databaseStatus = 'disabled'
}

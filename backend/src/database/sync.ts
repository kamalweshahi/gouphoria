import loadEnvFile from '../load-env'
import { connectDatabase, disconnectDatabase } from './database'

loadEnvFile()
process.env.DB_ENABLED = 'true'
process.env.DB_REQUIRED = 'true'
process.env.DB_SYNC = 'true'

connectDatabase()
    .then(() => console.info('database schema synchronized'))
    .then(disconnectDatabase)
    .catch(error => {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    })

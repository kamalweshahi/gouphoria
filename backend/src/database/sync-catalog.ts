import loadEnvFile from '../load-env'
import { connectDatabase, disconnectDatabase } from './database'
import { synchronizePhoneCaseCatalog } from '../services/catalog'

loadEnvFile()
process.env.DB_ENABLED = 'true'
process.env.DB_REQUIRED = 'true'

connectDatabase()
    .then(() => synchronizePhoneCaseCatalog())
    .then(result => console.info('Printify phone-case catalog synchronized', result))
    .then(disconnectDatabase)
    .catch(error => {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    })

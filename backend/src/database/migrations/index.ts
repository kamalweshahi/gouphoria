import type { Sequelize, Transaction } from 'sequelize'
import { DataTypes } from 'sequelize'
import { catalogMetadataMigration } from './001-catalog-metadata'
import { cartOrdersPaymentsMigration } from './002-cart-orders-payments'
import { standardFulfillmentMigration } from './003-standard-fulfillment'
import { aiDesignWorkflowMigration } from './004-ai-design-workflow'
import { aiDesignCommerceMigration } from './005-ai-design-commerce'
import { paidAICreditsMigration } from './006-paid-ai-credits'
import { authoritativePricingShippingMigration } from './007-authoritative-pricing-shipping'
import { adminCatalogManagementMigration } from './008-admin-catalog-management'
import { preserveExistingAIProductsMigration } from './009-preserve-existing-ai-products'
import { realisticMockupTemplatesMigration } from './010-realistic-mockup-templates'
import { mapCurrentMockupTemplateFamilyMigration } from './011-map-current-mockup-template-family'
import { smoothStudioMockupTemplateMigration } from './012-smooth-studio-mockup-template'
import { fullBleedStudioMockupTemplateMigration } from './013-full-bleed-studio-mockup-template'
import { referencePhotoMockupTemplateMigration } from './014-reference-photo-mockup-template'
import { phoneModelCameraRegistryMigration } from './015-phone-model-camera-registry'
import { cleanModelCameraCompositionMigration } from './016-clean-model-camera-composition'
import { deviceAwareFullBleedMockupsMigration } from './017-device-aware-full-bleed-mockups'
import { premiumReferenceMockupFinishMigration } from './018-premium-reference-mockup-finish'
import { checkoutFulfillmentIntegrityMigration } from './019-checkout-fulfillment-integrity'
import { safeProductDeletionMigration } from './020-safe-product-deletion'

const migrations = [catalogMetadataMigration, cartOrdersPaymentsMigration, standardFulfillmentMigration, aiDesignWorkflowMigration, aiDesignCommerceMigration, paidAICreditsMigration, authoritativePricingShippingMigration, adminCatalogManagementMigration, preserveExistingAIProductsMigration, realisticMockupTemplatesMigration, mapCurrentMockupTemplateFamilyMigration, smoothStudioMockupTemplateMigration, fullBleedStudioMockupTemplateMigration, referencePhotoMockupTemplateMigration, phoneModelCameraRegistryMigration, cleanModelCameraCompositionMigration, deviceAwareFullBleedMockupsMigration, premiumReferenceMockupFinishMigration, checkoutFulfillmentIntegrityMigration, safeProductDeletionMigration]

export async function runDatabaseMigrations(sequelize: Sequelize) {
    const queryInterface = sequelize.getQueryInterface()
    const tables = (await queryInterface.showAllTables()).map(table => String(table))

    if (!tables.includes('schema_migrations')) {
        await queryInterface.createTable('schema_migrations', {
            name: { type: DataTypes.STRING(180), primaryKey: true, allowNull: false },
            executed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
        })
    }

    const [rows] = await sequelize.query('SELECT name FROM schema_migrations')
    const completed = new Set((rows as Array<{ name: string }>).map(row => row.name))

    for (const migration of migrations) {
        if (completed.has(migration.name)) continue
        await sequelize.transaction(async (transaction: Transaction) => {
            await migration.up(queryInterface, transaction)
            await queryInterface.bulkInsert('schema_migrations', [{
                name: migration.name,
                executed_at: new Date()
            }], { transaction })
        })
        console.info(`database migration applied: ${migration.name}`)
    }
}

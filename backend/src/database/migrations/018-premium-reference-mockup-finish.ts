import type { QueryInterface, Transaction } from 'sequelize'
import { REFERENCE_PHOTO_IPHONE_TEMPLATE_ID } from '../../services/mockup-templates'
import { listSupportedMockupPhoneModels } from '../../services/phone-model-mockups'

export const premiumReferenceMockupFinishMigration = {
    name: '018-premium-reference-mockup-finish',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        const supportedModels = listSupportedMockupPhoneModels().map(model => model.displayName)
        await queryInterface.sequelize.query(`
            UPDATE product_variants
            SET mockup_template_id = :templateId
            WHERE phone_model IN (:supportedModels)
        `, { replacements: { templateId: REFERENCE_PHOTO_IPHONE_TEMPLATE_ID, supportedModels }, transaction })

        // The source artwork and generation accounting remain authoritative.
        // Clearing only this derived marker lets startup backfill refresh the
        // product-photo presentation with no credit or generation side effect.
        await queryInterface.sequelize.query(`
            UPDATE ai_designs d
            JOIN product_variants v ON v.id = d.product_variant_id
            SET d.mockup_template_id = NULL
            WHERE d.current_artwork_key IS NOT NULL
              AND v.phone_model IN (:supportedModels)
              AND (d.mockup_template_id IS NULL OR d.mockup_template_id <> :templateId)
        `, { replacements: { templateId: REFERENCE_PHOTO_IPHONE_TEMPLATE_ID, supportedModels }, transaction })
    }
}

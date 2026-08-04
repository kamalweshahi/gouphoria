import type { QueryInterface, Transaction } from 'sequelize'
import { REFERENCE_PHOTO_IPHONE_TEMPLATE_ID } from '../../services/mockup-templates'
import { listSupportedMockupPhoneModels } from '../../services/phone-model-mockups'

export const phoneModelCameraRegistryMigration = {
    name: '015-phone-model-camera-registry',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        const supportedModels = listSupportedMockupPhoneModels().map(model => model.displayName)
        await queryInterface.sequelize.query(`
            UPDATE product_variants
            SET mockup_template_id = :templateId
            WHERE phone_model IN (:supportedModels)
        `, { replacements: { templateId: REFERENCE_PHOTO_IPHONE_TEMPLATE_ID, supportedModels }, transaction })

        // Clearing only the derived template marker makes the existing safe
        // backfill regenerate previews from the unchanged artwork. Credits,
        // generation counts, artwork keys, and commerce records are untouched.
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

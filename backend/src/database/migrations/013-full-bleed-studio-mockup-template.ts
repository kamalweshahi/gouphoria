import type { QueryInterface, Transaction } from 'sequelize'
import { FULL_BLEED_STUDIO_IPHONE_TEMPLATE_ID } from '../../services/mockup-templates'

export const fullBleedStudioMockupTemplateMigration = {
    name: '013-full-bleed-studio-mockup-template',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        await queryInterface.sequelize.query(`
            UPDATE product_variants
            SET mockup_template_id = :templateId
            WHERE phone_model LIKE 'iPhone %'
        `, { replacements: { templateId: FULL_BLEED_STUDIO_IPHONE_TEMPLATE_ID }, transaction })

        // Clearing only stale derived-preview metadata lets the existing
        // startup backfill regenerate mockups without touching source artwork,
        // credit accounting, generation counts, orders, or fulfillment data.
        await queryInterface.sequelize.query(`
            UPDATE ai_designs d
            JOIN product_variants v ON v.id = d.product_variant_id
            SET d.mockup_template_id = NULL
            WHERE d.current_artwork_key IS NOT NULL
              AND v.phone_model LIKE 'iPhone %'
              AND (d.mockup_template_id IS NULL OR d.mockup_template_id <> :templateId)
        `, { replacements: { templateId: FULL_BLEED_STUDIO_IPHONE_TEMPLATE_ID }, transaction })
    }
}

import type { QueryInterface, Transaction } from 'sequelize'
import { MAGNETIC_TOUGH_CASE_TEMPLATE_ID, PU_LEATHER_IPHONE_TEMPLATE_ID } from '../../services/mockup-templates'

export const mapCurrentMockupTemplateFamilyMigration = {
    name: '011-map-current-mockup-template-family',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        await queryInterface.sequelize.query(`
            UPDATE product_variants v
            JOIN products p ON p.id = v.product_id
            SET v.mockup_template_id = CASE
                WHEN v.phone_model LIKE 'iPhone %'
                 AND (p.title LIKE '%leather%' OR p.display_name LIKE '%leather%')
                THEN :leatherTemplateId
                ELSE NULL
            END
            WHERE v.mockup_template_id = :legacyTemplateId
               OR p.title LIKE '%leather%'
               OR p.display_name LIKE '%leather%'
        `, {
            replacements: {
                legacyTemplateId: MAGNETIC_TOUGH_CASE_TEMPLATE_ID,
                leatherTemplateId: PU_LEATHER_IPHONE_TEMPLATE_ID
            },
            transaction
        })
        await queryInterface.sequelize.query(`
            UPDATE ai_designs d
            JOIN products p ON p.id = d.product_id
            SET d.mockup_template_id = NULL
            WHERE d.mockup_template_id = :legacyTemplateId
              AND (p.title LIKE '%leather%' OR p.display_name LIKE '%leather%')
        `, { replacements: { legacyTemplateId: MAGNETIC_TOUGH_CASE_TEMPLATE_ID }, transaction })
    }
}

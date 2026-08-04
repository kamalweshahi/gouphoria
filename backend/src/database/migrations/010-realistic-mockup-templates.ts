import type { DataType, ModelAttributeColumnOptions, QueryInterface, Transaction } from 'sequelize'
import { DataTypes } from 'sequelize'
import { MAGNETIC_TOUGH_CASE_TEMPLATE_ID } from '../../services/mockup-templates'

async function addColumnIfMissing(
    queryInterface: QueryInterface,
    table: string,
    column: string,
    definition: DataType | ModelAttributeColumnOptions,
    transaction: Transaction
) {
    const columns = await queryInterface.describeTable(table)
    if (!columns[column]) await queryInterface.addColumn(table, column, definition, { transaction })
}

export const realisticMockupTemplatesMigration = {
    name: '010-realistic-mockup-templates',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        await addColumnIfMissing(queryInterface, 'product_variants', 'mockup_template_id', {
            type: DataTypes.STRING(80), allowNull: true
        }, transaction)
        await addColumnIfMissing(queryInterface, 'ai_designs', 'mockup_template_id', {
            type: DataTypes.STRING(80), allowNull: true
        }, transaction)
        await addColumnIfMissing(queryInterface, 'ai_designs', 'artwork_placement', {
            type: DataTypes.JSON, allowNull: true
        }, transaction)
        await addColumnIfMissing(queryInterface, 'ai_designs', 'mockup_generated_at', {
            type: DataTypes.DATE, allowNull: true
        }, transaction)
        await queryInterface.sequelize.query(`
            UPDATE product_variants
            SET mockup_template_id = :templateId
            WHERE phone_model LIKE 'iPhone %'
              AND mockup_template_id IS NULL
        `, { replacements: { templateId: MAGNETIC_TOUGH_CASE_TEMPLATE_ID }, transaction })
    }
}

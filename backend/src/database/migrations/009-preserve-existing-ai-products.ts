import type { QueryInterface, Transaction } from 'sequelize'

export const preserveExistingAIProductsMigration = {
    name: '009-preserve-existing-ai-products',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        await queryInterface.sequelize.query(`
            UPDATE products p
            SET p.allow_ai_customization = TRUE
            WHERE EXISTS (
                SELECT 1 FROM ai_designs d WHERE d.product_id = p.id
            )
        `, { transaction })
    }
}

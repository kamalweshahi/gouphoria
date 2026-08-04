import type { DataType, ModelAttributeColumnOptions, QueryInterface, Transaction } from 'sequelize'
import { DataTypes } from 'sequelize'

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

async function addIndexIfMissing(queryInterface: QueryInterface, table: string, fields: string[], name: string, transaction: Transaction) {
    const indexes = await queryInterface.showIndex(table) as Array<{ name: string }>
    if (!indexes.some(index => index.name === name)) await queryInterface.addIndex(table, fields, { name, transaction })
}

export const adminCatalogManagementMigration = {
    name: '008-admin-catalog-management',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        await addColumnIfMissing(queryInterface, 'products', 'display_name', { type: DataTypes.STRING(160), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'products', 'short_description', { type: DataTypes.STRING(500), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'products', 'storefront_category', { type: DataTypes.STRING(100), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'products', 'storefront_image', { type: DataTypes.TEXT, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'products', 'is_visible', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, transaction)
        await addColumnIfMissing(queryInterface, 'products', 'is_active', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, transaction)
        await addColumnIfMissing(queryInterface, 'products', 'sort_order', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, transaction)
        await addColumnIfMissing(queryInterface, 'products', 'allow_direct_purchase', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, transaction)
        await addColumnIfMissing(queryInterface, 'products', 'allow_ai_customization', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, transaction)
        await addColumnIfMissing(queryInterface, 'products', 'ai_custom_only', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, transaction)
        await addColumnIfMissing(queryInterface, 'products', 'retail_price', { type: DataTypes.DECIMAL(10, 2), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'product_variants', 'is_storefront_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, transaction)
        await addColumnIfMissing(queryInterface, 'admin_notes', 'target_user_id', {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            references: { model: 'users', key: 'id' }
        }, transaction)

        await queryInterface.sequelize.query(`
            UPDATE products
            SET is_visible = visible,
                is_active = status = 'active',
                allow_direct_purchase = TRUE,
                allow_ai_customization = FALSE,
                ai_custom_only = FALSE
        `, { transaction })
        await addIndexIfMissing(queryInterface, 'products', ['is_visible', 'is_active', 'sort_order'], 'products_storefront_listing', transaction)
        await addIndexIfMissing(queryInterface, 'products', ['allow_ai_customization', 'is_active'], 'products_ai_listing', transaction)
        await addIndexIfMissing(queryInterface, 'admin_notes', ['target_user_id', 'created_at'], 'admin_notes_target_user_created', transaction)
    }
}

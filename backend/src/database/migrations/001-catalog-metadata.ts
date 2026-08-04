import type { DataType, ModelAttributeColumnOptions, QueryInterface, Transaction } from 'sequelize'
import { DataTypes } from 'sequelize'

async function addColumnIfMissing(
    queryInterface: QueryInterface,
    tableName: string,
    columnName: string,
    definition: DataType | ModelAttributeColumnOptions,
    transaction: Transaction
) {
    const columns = await queryInterface.describeTable(tableName)
    if (!columns[columnName]) {
        await queryInterface.addColumn(tableName, columnName, definition, { transaction })
    }
}

export const catalogMetadataMigration = {
    name: '001-catalog-metadata',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        await addColumnIfMissing(queryInterface, 'products', 'images', { type: DataTypes.JSON, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'products', 'tags', { type: DataTypes.JSON, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'products', 'blueprint_id', { type: DataTypes.STRING(100), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'products', 'print_provider_id', { type: DataTypes.STRING(100), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'products', 'printify_metadata', { type: DataTypes.JSON, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'products', 'catalog_synced_at', { type: DataTypes.DATE, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'product_variants', 'image_url', { type: DataTypes.TEXT, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'product_variants', 'printify_metadata', { type: DataTypes.JSON, allowNull: true }, transaction)
    }
}

import type { QueryInterface, Transaction } from 'sequelize'
import { DataTypes } from 'sequelize'

export const safeProductDeletionMigration = {
    name: '020-safe-product-deletion',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        const tables = (await queryInterface.showAllTables()).map(table => String(table))
        if (tables.includes('catalog_product_deletions')) return
        await queryInterface.createTable('catalog_product_deletions', {
            id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
            original_product_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
            external_product_id: { type: DataTypes.STRING(100), allowNull: false, unique: true },
            product_name: { type: DataTypes.STRING(255), allowNull: false },
            action: { type: DataTypes.ENUM('deleted', 'archived'), allowNull: false },
            actor_user_id: {
                type: DataTypes.BIGINT.UNSIGNED,
                allowNull: false,
                references: { model: 'users', key: 'id' },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT'
            },
            reason: { type: DataTypes.STRING(500), allowNull: true },
            created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
        }, { transaction })
    }
}

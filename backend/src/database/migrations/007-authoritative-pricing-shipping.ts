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
    if (!columns[columnName]) await queryInterface.addColumn(tableName, columnName, definition, { transaction })
}

async function addIndexIfMissing(queryInterface: QueryInterface, table: string, fields: string[], name: string, transaction: Transaction) {
    const indexes = await queryInterface.showIndex(table) as Array<{ name: string }>
    if (!indexes.some(index => index.name === name)) await queryInterface.addIndex(table, fields, { name, transaction })
}

export const authoritativePricingShippingMigration = {
    name: '007-authoritative-pricing-shipping',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        const tables = await queryInterface.showAllTables()
        if (!tables.includes('shipping_quotes')) {
            await queryInterface.createTable('shipping_quotes', {
                id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
                user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'users', key: 'id' } },
                cart_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'carts', key: 'id' } },
                context: { type: DataTypes.ENUM('cart', 'direct'), allowNull: false },
                item_snapshot: { type: DataTypes.JSON, allowNull: false },
                item_snapshot_hash: { type: DataTypes.CHAR(64), allowNull: false },
                address_snapshot: { type: DataTypes.JSON, allowNull: false },
                address_hash: { type: DataTypes.CHAR(64), allowNull: false },
                options: { type: DataTypes.JSON, allowNull: false },
                currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'USD' },
                expires_at: { type: DataTypes.DATE, allowNull: false },
                created_at: { type: DataTypes.DATE, allowNull: false },
                updated_at: { type: DataTypes.DATE, allowNull: false }
            }, { transaction })
        }
        await addIndexIfMissing(queryInterface, 'shipping_quotes', ['user_id', 'created_at'], 'shipping_quotes_user_created', transaction)
        await addIndexIfMissing(queryInterface, 'shipping_quotes', ['expires_at'], 'shipping_quotes_expires', transaction)

        if (!tables.includes('printify_webhook_events')) {
            await queryInterface.createTable('printify_webhook_events', {
                id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
                topic: { type: DataTypes.STRING(80), allowNull: false },
                resource_id: { type: DataTypes.STRING(120), allowNull: false },
                shop_id: { type: DataTypes.STRING(100), allowNull: false },
                outcome: { type: DataTypes.STRING(40), allowNull: false },
                created_at: { type: DataTypes.DATE, allowNull: false }
            }, { transaction })
        }

        await addColumnIfMissing(queryInterface, 'orders', 'shipping_quote_id', {
            type: DataTypes.UUID, allowNull: true, references: { model: 'shipping_quotes', key: 'id' }
        }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'shipping_method_id', { type: DataTypes.STRING(40), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'shipping_method_code', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'shipping_method_name', { type: DataTypes.STRING(120), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'shipping_quote_expires_at', { type: DataTypes.DATE, allowNull: true }, transaction)
        await addIndexIfMissing(queryInterface, 'orders', ['shipping_quote_id'], 'orders_shipping_quote', transaction)

        const orderItemColumns = await queryInterface.describeTable('order_items')
        if (orderItemColumns.customization_markup) {
            await queryInterface.sequelize.query(`
                INSERT INTO commerce_audits (order_id, action, metadata, created_at)
                SELECT id, 'pricing_policy_migrated', JSON_OBJECT(
                    'priorSubtotal', subtotal,
                    'priorTotal', total_amount,
                    'captured', payment_status = 'captured'
                ), NOW()
                FROM orders
                WHERE EXISTS (
                    SELECT 1 FROM order_items oi
                    WHERE oi.order_id = orders.id AND oi.item_type = 'ai_custom' AND oi.customization_markup > 0
                )
            `, { transaction })
            await queryInterface.sequelize.query(`
                UPDATE order_items
                SET unit_price = base_price,
                    total_price = base_price * quantity
                WHERE item_type = 'ai_custom'
            `, { transaction })
            await queryInterface.sequelize.query(`
                UPDATE orders o
                JOIN (
                    SELECT order_id, SUM(total_price) AS new_subtotal
                    FROM order_items GROUP BY order_id
                ) totals ON totals.order_id = o.id
                SET o.subtotal = totals.new_subtotal,
                    o.total_amount = totals.new_subtotal + o.shipping_amount + o.tax_amount
            `, { transaction })
            await queryInterface.removeColumn('order_items', 'customization_markup', { transaction })
        }

        const cartItemColumns = await queryInterface.describeTable('cart_items')
        if (cartItemColumns.customization_markup) {
            await queryInterface.sequelize.query(`
                UPDATE cart_items SET unit_price = base_price WHERE item_type = 'ai_custom'
            `, { transaction })
            await queryInterface.removeColumn('cart_items', 'customization_markup', { transaction })
        }

        await queryInterface.sequelize.query(`
            UPDATE commerce_audits
            SET metadata = JSON_REMOVE(metadata, '$.customizationMarkup')
            WHERE metadata IS NOT NULL AND JSON_CONTAINS_PATH(metadata, 'one', '$.customizationMarkup')
        `, { transaction })
        await queryInterface.bulkDelete('system_settings', { key: 'ai_customization_markup' }, { transaction })
    }
}

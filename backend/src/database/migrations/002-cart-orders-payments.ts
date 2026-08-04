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

async function addIndexIfMissing(
    queryInterface: QueryInterface,
    tableName: string,
    indexName: string,
    fields: string[],
    transaction: Transaction,
    unique = false
) {
    const indexes = await queryInterface.showIndex(tableName) as Array<{ name: string }>
    if (!indexes.some(index => index.name === indexName)) {
        await queryInterface.addIndex(tableName, fields, { name: indexName, unique, transaction })
    }
}

export const cartOrdersPaymentsMigration = {
    name: '002-cart-orders-payments',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        await addColumnIfMissing(queryInterface, 'cart_items', 'product_id', {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            references: { model: 'products', key: 'id' }
        }, transaction)
        await addColumnIfMissing(queryInterface, 'cart_items', 'product_title', { type: DataTypes.STRING(255), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'cart_items', 'variant_title', { type: DataTypes.STRING(180), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'cart_items', 'phone_model', { type: DataTypes.STRING(120), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'cart_items', 'case_type', { type: DataTypes.STRING(120), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'cart_items', 'image_url', { type: DataTypes.TEXT, allowNull: true }, transaction)

        await queryInterface.sequelize.query(`
            UPDATE cart_items ci
            JOIN product_variants pv ON pv.id = ci.product_variant_id
            JOIN products p ON p.id = pv.product_id
            SET ci.product_id = COALESCE(ci.product_id, p.id),
                ci.product_title = COALESCE(ci.product_title, p.title),
                ci.variant_title = COALESCE(ci.variant_title, pv.title),
                ci.phone_model = COALESCE(ci.phone_model, pv.phone_model),
                ci.case_type = COALESCE(ci.case_type, pv.case_type),
                ci.image_url = COALESCE(ci.image_url, pv.image_url, p.thumbnail_url)
        `, { transaction })
        await queryInterface.changeColumn('cart_items', 'product_id', { type: DataTypes.BIGINT.UNSIGNED, allowNull: false }, { transaction })
        await queryInterface.changeColumn('cart_items', 'product_title', { type: DataTypes.STRING(255), allowNull: false }, { transaction })
        await queryInterface.changeColumn('cart_items', 'variant_title', { type: DataTypes.STRING(180), allowNull: false }, { transaction })
        await queryInterface.changeColumn('cart_items', 'phone_model', { type: DataTypes.STRING(120), allowNull: false }, { transaction })
        await queryInterface.changeColumn('cart_items', 'case_type', { type: DataTypes.STRING(120), allowNull: false }, { transaction })
        await addIndexIfMissing(queryInterface, 'cart_items', 'cart_items_cart_variant', ['cart_id', 'product_variant_id'], transaction)

        await addColumnIfMissing(queryInterface, 'orders', 'order_number', { type: DataTypes.STRING(64), allowNull: true }, transaction)
        await queryInterface.sequelize.query("UPDATE orders SET order_number = CONCAT('LEGACY-', id) WHERE order_number IS NULL", { transaction })
        await queryInterface.changeColumn('orders', 'order_number', { type: DataTypes.STRING(64), allowNull: false }, { transaction })
        await addIndexIfMissing(queryInterface, 'orders', 'orders_order_number_unique', ['order_number'], transaction, true)
        await addColumnIfMissing(queryInterface, 'orders', 'payment_status', {
            type: DataTypes.ENUM('created', 'approved', 'captured', 'failed', 'refunded'),
            allowNull: false,
            defaultValue: 'created'
        }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'source_cart_id', {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            references: { model: 'carts', key: 'id' }
        }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'cart_snapshot_hash', { type: DataTypes.STRING(64), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'paypal_order_id', { type: DataTypes.STRING(120), allowNull: true }, transaction)
        await addIndexIfMissing(queryInterface, 'orders', 'orders_paypal_order_unique', ['paypal_order_id'], transaction, true)
        await addIndexIfMissing(queryInterface, 'orders', 'orders_cart_snapshot', ['source_cart_id', 'cart_snapshot_hash'], transaction)

        await addColumnIfMissing(queryInterface, 'order_items', 'phone_model', { type: DataTypes.STRING(120), allowNull: false, defaultValue: 'Unknown' }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'case_type', { type: DataTypes.STRING(120), allowNull: false, defaultValue: 'Phone Case' }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'image_url', { type: DataTypes.TEXT, allowNull: true }, transaction)
    }
}

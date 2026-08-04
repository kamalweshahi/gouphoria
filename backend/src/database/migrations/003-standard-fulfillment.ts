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

export const standardFulfillmentMigration = {
    name: '003-standard-fulfillment',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        await addColumnIfMissing(queryInterface, 'addresses', 'first_name', { type: DataTypes.STRING(80), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'addresses', 'last_name', { type: DataTypes.STRING(80), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'addresses', 'email', { type: DataTypes.STRING(254), allowNull: true }, transaction)
        await queryInterface.sequelize.query(`
            UPDATE addresses a
            JOIN users u ON u.id = a.user_id
            SET a.first_name = COALESCE(a.first_name, a.recipient_name),
                a.last_name = COALESCE(a.last_name, ''),
                a.email = COALESCE(a.email, u.email)
        `, { transaction })
        await queryInterface.changeColumn('addresses', 'first_name', { type: DataTypes.STRING(80), allowNull: false }, { transaction })
        await queryInterface.changeColumn('addresses', 'last_name', { type: DataTypes.STRING(80), allowNull: false }, { transaction })
        await queryInterface.changeColumn('addresses', 'email', { type: DataTypes.STRING(254), allowNull: false }, { transaction })

        await queryInterface.changeColumn('orders', 'status', {
            type: DataTypes.ENUM(
                'pending', 'paid', 'ready_for_fulfillment', 'fulfillment_failed', 'pending_ai_review', 'approved',
                'rejected', 'sent_to_printify', 'printing', 'shipped', 'delivered', 'cancelled', 'refunded', 'failed'
            ),
            allowNull: false,
            defaultValue: 'pending'
        }, { transaction })
        await addColumnIfMissing(queryInterface, 'orders', 'fulfillment_status', {
            type: DataTypes.ENUM('not_ready', 'ready', 'submitted', 'in_production', 'shipped', 'delivered', 'failed', 'cancelled'),
            allowNull: false,
            defaultValue: 'not_ready'
        }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'shipping_address_snapshot', { type: DataTypes.JSON, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'printify_shop_id', { type: DataTypes.STRING(100), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'printify_status', { type: DataTypes.STRING(64), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'fulfillment_metadata', { type: DataTypes.JSON, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'fulfillment_failure_code', { type: DataTypes.STRING(120), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'fulfillment_submitted_at', { type: DataTypes.DATE, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'fulfillment_synced_at', { type: DataTypes.DATE, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'tracking_carrier', { type: DataTypes.STRING(100), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'shipped_at', { type: DataTypes.DATE, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'orders', 'delivered_at', { type: DataTypes.DATE, allowNull: true }, transaction)
    }
}

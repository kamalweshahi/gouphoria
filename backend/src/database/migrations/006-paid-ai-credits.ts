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

async function addIndexIfMissing(
    queryInterface: QueryInterface,
    tableName: string,
    fields: string[],
    name: string,
    transaction: Transaction,
    unique = false
) {
    const indexes = await queryInterface.showIndex(tableName) as any[]
    if (!indexes.some(index => index.name === name)) {
        await queryInterface.addIndex(tableName, fields, { name, unique, transaction })
    }
}

export const paidAICreditsMigration = {
    name: '006-paid-ai-credits',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        const tables = await queryInterface.showAllTables()
        if (!tables.includes('credit_packages')) {
            await queryInterface.createTable('credit_packages', {
                id: { type: DataTypes.STRING(64), primaryKey: true, allowNull: false },
                name: { type: DataTypes.STRING(120), allowNull: false },
                credit_amount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
                price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
                currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'USD' },
                active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
                sort_order: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
                created_at: { type: DataTypes.DATE, allowNull: false },
                updated_at: { type: DataTypes.DATE, allowNull: false }
            }, { transaction })
        }

        if (!tables.includes('credit_purchases')) {
            await queryInterface.createTable('credit_purchases', {
                id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
                user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, references: { model: 'users', key: 'id' } },
                package_id: { type: DataTypes.STRING(64), allowNull: false, references: { model: 'credit_packages', key: 'id' } },
                package_name_snapshot: { type: DataTypes.STRING(120), allowNull: false },
                credit_amount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
                price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
                currency: { type: DataTypes.CHAR(3), allowNull: false },
                paypal_order_id: { type: DataTypes.STRING(120), allowNull: true, unique: true },
                paypal_capture_id: { type: DataTypes.STRING(120), allowNull: true, unique: true },
                status: {
                    type: DataTypes.ENUM('created', 'approved', 'captured', 'failed', 'cancelled', 'refunded'),
                    allowNull: false,
                    defaultValue: 'created'
                },
                credits_granted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
                idempotency_key: { type: DataTypes.STRING(120), allowNull: false },
                provider_metadata: { type: DataTypes.JSON, allowNull: true },
                captured_at: { type: DataTypes.DATE, allowNull: true },
                credits_granted_at: { type: DataTypes.DATE, allowNull: true },
                created_at: { type: DataTypes.DATE, allowNull: false },
                updated_at: { type: DataTypes.DATE, allowNull: false }
            }, { transaction })
        }
        await addIndexIfMissing(queryInterface, 'credit_purchases', ['user_id', 'created_at'], 'credit_purchases_user_created', transaction)
        await addIndexIfMissing(queryInterface, 'credit_purchases', ['user_id', 'idempotency_key'], 'credit_purchases_user_idempotency', transaction, true)

        await addColumnIfMissing(queryInterface, 'credit_transactions', 'credit_purchase_id', {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            references: { model: 'credit_purchases', key: 'id' }
        }, transaction)
        await addColumnIfMissing(queryInterface, 'credit_transactions', 'order_id', {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            references: { model: 'orders', key: 'id' }
        }, transaction)
        await addColumnIfMissing(queryInterface, 'credit_transactions', 'admin_user_id', {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            references: { model: 'users', key: 'id' }
        }, transaction)
        await addIndexIfMissing(queryInterface, 'credit_transactions', ['credit_purchase_id'], 'credit_transactions_purchase_unique', transaction, true)
        await addIndexIfMissing(queryInterface, 'credit_transactions', ['order_id', 'reason'], 'credit_transactions_order_reward_unique', transaction, true)
        await addIndexIfMissing(queryInterface, 'credit_transactions', ['admin_user_id', 'created_at'], 'credit_transactions_admin_created', transaction)

        const now = new Date()
        await queryInterface.sequelize.query(`
            INSERT IGNORE INTO credit_packages
                (id, name, credit_amount, price, currency, active, sort_order, created_at, updated_at)
            VALUES
                ('starter-3', 'Starter', 3, 2.99, 'USD', TRUE, 10, :createdAt, :updatedAt),
                ('creator-10', 'Creator', 10, 7.99, 'USD', TRUE, 20, :createdAt, :updatedAt),
                ('studio-25', 'Studio', 25, 14.99, 'USD', TRUE, 30, :createdAt, :updatedAt)
        `, { replacements: { createdAt: now, updatedAt: now }, transaction })

        const configuredReward = Number(process.env.PHONE_CASE_PURCHASE_REWARD_CREDITS ?? 0)
        const rewardCredits = Number.isInteger(configuredReward) && configuredReward >= 0 ? configuredReward : 0
        await queryInterface.sequelize.query(`
            INSERT IGNORE INTO system_settings (\`key\`, value, description, updated_at)
            VALUES (
                'phone_case_purchase_reward_credits',
                :value,
                'Credits granted once after an eligible paid phone-case order is fully delivered. Disabled when zero.',
                :updatedAt
            )
        `, {
            replacements: { value: JSON.stringify({ credits: rewardCredits }), updatedAt: now },
            transaction
        })
    }
}

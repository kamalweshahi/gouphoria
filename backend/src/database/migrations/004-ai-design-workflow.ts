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

export const aiDesignWorkflowMigration = {
    name: '004-ai-design-workflow',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        await addColumnIfMissing(queryInterface, 'ai_designs', 'product_id', {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            references: { model: 'products', key: 'id' }
        }, transaction)
        await queryInterface.sequelize.query(`
            UPDATE ai_designs d
            JOIN product_variants v ON v.id = d.product_variant_id
            SET d.product_id = COALESCE(d.product_id, v.product_id)
        `, { transaction })

        await addColumnIfMissing(queryInterface, 'ai_designs', 'original_artwork_key', { type: DataTypes.STRING(500), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'ai_designs', 'current_artwork_key', { type: DataTypes.STRING(500), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'ai_designs', 'mockup_key', { type: DataTypes.STRING(500), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'ai_designs', 'provider', { type: DataTypes.STRING(80), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'ai_designs', 'model', { type: DataTypes.STRING(120), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'ai_designs', 'generated_at', { type: DataTypes.DATE, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'ai_designs', 'last_error_code', { type: DataTypes.STRING(120), allowNull: true }, transaction)
        await queryInterface.sequelize.query(`
            ALTER TABLE ai_designs MODIFY status ENUM(
                'draft','generating','generated','waiting_for_user','revision_requested',
                'approved','failed','added_to_cart','purchased','pending_admin_review',
                'approved_for_print','rejected','completed','cancelled'
            ) NOT NULL DEFAULT 'draft'
        `, { transaction })

        await addColumnIfMissing(queryInterface, 'uploaded_images', 'extension', { type: DataTypes.STRING(12), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'uploaded_images', 'checksum_sha256', { type: DataTypes.CHAR(64), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'uploaded_images', 'width', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'uploaded_images', 'height', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, transaction)
        await queryInterface.sequelize.query(`
            UPDATE uploaded_images
            SET extension = COALESCE(extension, 'legacy'),
                checksum_sha256 = COALESCE(checksum_sha256, REPEAT('0', 64))
        `, { transaction })
        await queryInterface.changeColumn('uploaded_images', 'extension', { type: DataTypes.STRING(12), allowNull: false }, { transaction })
        await queryInterface.changeColumn('uploaded_images', 'checksum_sha256', { type: DataTypes.CHAR(64), allowNull: false }, { transaction })

        await addColumnIfMissing(queryInterface, 'credit_transactions', 'balance_before', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'credit_transactions', 'ai_design_id', {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            references: { model: 'ai_designs', key: 'id' }
        }, transaction)
        await addColumnIfMissing(queryInterface, 'credit_transactions', 'idempotency_key', { type: DataTypes.STRING(120), allowNull: true }, transaction)
        await queryInterface.sequelize.query(`
            UPDATE credit_transactions
            SET balance_before = GREATEST(0, balance_after - amount)
            WHERE balance_before IS NULL
        `, { transaction })
        await queryInterface.changeColumn('credit_transactions', 'balance_before', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }, { transaction })
        await addIndexIfMissing(queryInterface, 'credit_transactions', ['ai_design_id', 'created_at'], 'credit_transactions_design_created', transaction)

        const tables = await queryInterface.showAllTables()
        if (!tables.includes('ai_generations')) {
            await queryInterface.createTable('ai_generations', {
                id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
                ai_design_id: {
                    type: DataTypes.BIGINT.UNSIGNED,
                    allowNull: false,
                    references: { model: 'ai_designs', key: 'id' },
                    onDelete: 'CASCADE'
                },
                user_id: {
                    type: DataTypes.BIGINT.UNSIGNED,
                    allowNull: false,
                    references: { model: 'users', key: 'id' },
                    onDelete: 'CASCADE'
                },
                kind: { type: DataTypes.ENUM('initial', 'revision'), allowNull: false },
                status: { type: DataTypes.ENUM('processing', 'succeeded', 'failed'), allowNull: false },
                idempotency_key: { type: DataTypes.STRING(120), allowNull: false },
                request_hash: { type: DataTypes.CHAR(64), allowNull: false },
                prompt: { type: DataTypes.TEXT, allowNull: false },
                provider: { type: DataTypes.STRING(80), allowNull: true },
                model: { type: DataTypes.STRING(120), allowNull: true },
                artwork_storage_key: { type: DataTypes.STRING(500), allowNull: true },
                mockup_storage_key: { type: DataTypes.STRING(500), allowNull: true },
                provider_request_id: { type: DataTypes.STRING(120), allowNull: true },
                safe_error_code: { type: DataTypes.STRING(120), allowNull: true },
                metadata: { type: DataTypes.JSON, allowNull: true },
                completed_at: { type: DataTypes.DATE, allowNull: true },
                created_at: { type: DataTypes.DATE, allowNull: false },
                updated_at: { type: DataTypes.DATE, allowNull: false }
            }, { transaction })
        }
        await addIndexIfMissing(queryInterface, 'ai_generations', ['ai_design_id', 'created_at'], 'ai_generations_design_created', transaction)
        await addIndexIfMissing(queryInterface, 'ai_generations', ['user_id', 'created_at'], 'ai_generations_user_created', transaction)
        await addIndexIfMissing(queryInterface, 'ai_generations', ['ai_design_id', 'idempotency_key'], 'ai_generations_design_idempotency', transaction, true)
    }
}

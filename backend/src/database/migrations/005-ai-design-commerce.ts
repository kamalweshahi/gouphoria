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

const itemStatus = DataTypes.ENUM(
    'pending_payment', 'paid', 'pending_design_review', 'approved_for_print', 'rejected',
    'changes_requested', 'sent_to_printify', 'in_production', 'shipped', 'delivered',
    'fulfillment_failed', 'cancelled', 'refunded'
)

export const aiDesignCommerceMigration = {
    name: '005-ai-design-commerce',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        await queryInterface.sequelize.query(`
            ALTER TABLE ai_designs MODIFY status ENUM(
                'draft','generating','generated','waiting_for_user','revision_requested',
                'approved','failed','added_to_cart','purchased','pending_admin_review',
                'approved_for_print','rejected','changes_requested','completed','cancelled'
            ) NOT NULL DEFAULT 'draft'
        `, { transaction })

        await addColumnIfMissing(queryInterface, 'cart_items', 'item_type', {
            type: DataTypes.ENUM('standard', 'ai_custom'), allowNull: false, defaultValue: 'standard'
        }, transaction)
        await addColumnIfMissing(queryInterface, 'cart_items', 'base_price', { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: '0.00' }, transaction)
        await addColumnIfMissing(queryInterface, 'cart_items', 'artwork_storage_key', { type: DataTypes.STRING(500), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'cart_items', 'mockup_storage_key', { type: DataTypes.STRING(500), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'cart_items', 'artwork_checksum_sha256', { type: DataTypes.CHAR(64), allowNull: true }, transaction)
        await queryInterface.sequelize.query(`
            UPDATE cart_items
            SET item_type = IF(ai_design_id IS NULL, 'standard', 'ai_custom'),
                base_price = IF(base_price = 0, unit_price, base_price)
        `, { transaction })
        await addIndexIfMissing(queryInterface, 'cart_items', ['cart_id', 'ai_design_id'], 'cart_items_cart_ai_design_unique', transaction, true)

        await addColumnIfMissing(queryInterface, 'order_items', 'item_type', {
            type: DataTypes.ENUM('standard', 'ai_custom'), allowNull: false, defaultValue: 'standard'
        }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'status', { type: itemStatus, allowNull: false, defaultValue: 'pending_payment' }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'base_price', { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: '0.00' }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'artwork_storage_key', { type: DataTypes.STRING(500), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'approved_artwork_storage_key', { type: DataTypes.STRING(500), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'mockup_storage_key', { type: DataTypes.STRING(500), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'artwork_checksum_sha256', { type: DataTypes.CHAR(64), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'printify_product_id_snapshot', { type: DataTypes.STRING(100), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'printify_variant_id_snapshot', { type: DataTypes.STRING(100), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'printify_blueprint_id_snapshot', { type: DataTypes.STRING(100), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'printify_provider_id_snapshot', { type: DataTypes.STRING(100), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'printify_order_id', { type: DataTypes.STRING(120), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'printify_upload_id', { type: DataTypes.STRING(120), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'printify_status', { type: DataTypes.STRING(64), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'fulfillment_metadata', { type: DataTypes.JSON, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'fulfillment_failure_code', { type: DataTypes.STRING(120), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'fulfillment_submitted_at', { type: DataTypes.DATE, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'fulfillment_synced_at', { type: DataTypes.DATE, allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'reviewed_by_user_id', {
            type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' }
        }, transaction)
        await addColumnIfMissing(queryInterface, 'order_items', 'reviewed_at', { type: DataTypes.DATE, allowNull: true }, transaction)
        await queryInterface.sequelize.query(`
            UPDATE order_items i
            JOIN products p ON p.id = i.product_id
            JOIN product_variants v ON v.id = i.product_variant_id
            JOIN orders o ON o.id = i.order_id
            SET i.item_type = IF(i.ai_design_id IS NULL AND i.artwork_url IS NULL, 'standard', 'ai_custom'),
                i.base_price = IF(i.base_price = 0, i.unit_price, i.base_price),
                i.status = IF(o.payment_status = 'captured', IF(i.ai_design_id IS NULL AND i.artwork_url IS NULL, 'paid', 'pending_design_review'), 'pending_payment'),
                i.printify_product_id_snapshot = COALESCE(i.printify_product_id_snapshot, p.printify_product_id),
                i.printify_variant_id_snapshot = COALESCE(i.printify_variant_id_snapshot, v.printify_variant_id),
                i.printify_blueprint_id_snapshot = COALESCE(i.printify_blueprint_id_snapshot, p.blueprint_id),
                i.printify_provider_id_snapshot = COALESCE(i.printify_provider_id_snapshot, p.print_provider_id)
        `, { transaction })
        await addIndexIfMissing(queryInterface, 'order_items', ['status', 'created_at'], 'order_items_status_created', transaction)
        await addIndexIfMissing(queryInterface, 'order_items', ['ai_design_id', 'created_at'], 'order_items_ai_design_created', transaction)
        await addIndexIfMissing(queryInterface, 'order_items', ['printify_order_id'], 'order_items_printify_order', transaction)

        await addColumnIfMissing(queryInterface, 'admin_notes', 'order_item_id', {
            type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'order_items', key: 'id' }
        }, transaction)
        await addColumnIfMissing(queryInterface, 'admin_notes', 'action', { type: DataTypes.STRING(80), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'admin_notes', 'status_before', { type: DataTypes.STRING(80), allowNull: true }, transaction)
        await addColumnIfMissing(queryInterface, 'admin_notes', 'status_after', { type: DataTypes.STRING(80), allowNull: true }, transaction)
        await addIndexIfMissing(queryInterface, 'admin_notes', ['order_item_id', 'created_at'], 'admin_notes_order_item_created', transaction)

        const tables = await queryInterface.showAllTables()
        if (!tables.includes('commerce_audits')) {
            await queryInterface.createTable('commerce_audits', {
                id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
                actor_user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' } },
                order_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'orders', key: 'id' } },
                order_item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'order_items', key: 'id' } },
                ai_design_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, references: { model: 'ai_designs', key: 'id' } },
                action: { type: DataTypes.STRING(80), allowNull: false },
                status_before: { type: DataTypes.STRING(80), allowNull: true },
                status_after: { type: DataTypes.STRING(80), allowNull: true },
                metadata: { type: DataTypes.JSON, allowNull: true },
                created_at: { type: DataTypes.DATE, allowNull: false }
            }, { transaction })
        }
        await addIndexIfMissing(queryInterface, 'commerce_audits', ['order_item_id', 'created_at'], 'commerce_audits_item_created', transaction)
        await addIndexIfMissing(queryInterface, 'commerce_audits', ['ai_design_id', 'created_at'], 'commerce_audits_design_created', transaction)

    }
}

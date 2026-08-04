import type { QueryInterface, Transaction } from 'sequelize'
import { DataTypes } from 'sequelize'
import { FulfillmentStatus, OrderStatus } from '../models/model-enums'

export const checkoutFulfillmentIntegrityMigration = {
    name: '019-checkout-fulfillment-integrity',
    async up(queryInterface: QueryInterface, transaction: Transaction) {
        await queryInterface.changeColumn('orders', 'status', {
            type: DataTypes.ENUM(...Object.values(OrderStatus)),
            allowNull: false,
            defaultValue: OrderStatus.PENDING
        }, { transaction })
        await queryInterface.changeColumn('orders', 'fulfillment_status', {
            type: DataTypes.ENUM(...Object.values(FulfillmentStatus)),
            allowNull: false,
            defaultValue: FulfillmentStatus.NOT_READY
        }, { transaction })
    }
}

import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    DataType,
    Default,
    ForeignKey,
    HasMany,
    HasOne,
    Model,
    PrimaryKey,
    Table,
    Unique
} from 'sequelize-typescript'
import { Address } from './address'
import { AdminNote } from './admin-note'
import { OrderItem } from './order-item'
import { FulfillmentStatus, OrderStatus, PaymentStatus } from './model-enums'
import { Payment } from './payment'
import { User } from './user'
import { ShippingQuote } from './shipping-quote'

@Table({
    tableName: 'orders',
    timestamps: true,
    underscored: true,
    indexes: [
        { name: 'orders_user_created', fields: ['user_id', 'created_at'] },
        { name: 'orders_status', fields: ['status'] }
    ]
})
export class Order extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @Unique
    @AllowNull(false)
    @Column(DataType.STRING(64))
    orderNumber!: string

    @ForeignKey(() => User)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    userId!: number

    @ForeignKey(() => Address)
    @Column(DataType.BIGINT.UNSIGNED)
    shippingAddressId?: number

    @Default(OrderStatus.PENDING)
    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(OrderStatus)))
    status!: OrderStatus

    @Default(PaymentStatus.CREATED)
    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(PaymentStatus)))
    paymentStatus!: PaymentStatus

    @Default(FulfillmentStatus.NOT_READY)
    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(FulfillmentStatus)))
    fulfillmentStatus!: FulfillmentStatus

    @Column(DataType.JSON)
    shippingAddressSnapshot?: object

    @Column(DataType.BIGINT.UNSIGNED)
    sourceCartId?: number

    @Column(DataType.STRING(64))
    cartSnapshotHash?: string

    @ForeignKey(() => ShippingQuote)
    @Column(DataType.UUID)
    shippingQuoteId?: string

    @Column(DataType.STRING(40))
    shippingMethodId?: string

    @Column(DataType.INTEGER.UNSIGNED)
    shippingMethodCode?: number

    @Column(DataType.STRING(120))
    shippingMethodName?: string

    @Column(DataType.DATE)
    shippingQuoteExpiresAt?: Date

    @AllowNull(false)
    @Column(DataType.DECIMAL(10, 2))
    subtotal!: string

    @Default('0.00')
    @AllowNull(false)
    @Column(DataType.DECIMAL(10, 2))
    shippingAmount!: string

    @Default('0.00')
    @AllowNull(false)
    @Column(DataType.DECIMAL(10, 2))
    taxAmount!: string

    @AllowNull(false)
    @Column(DataType.DECIMAL(10, 2))
    totalAmount!: string

    @Default('USD')
    @AllowNull(false)
    @Column(DataType.CHAR(3))
    currency!: string

    @Unique
    @Column(DataType.STRING(120))
    paypalOrderId?: string

    @Unique
    @Column(DataType.STRING(120))
    printifyOrderId?: string

    @Column(DataType.STRING(100))
    printifyShopId?: string

    @Column(DataType.STRING(64))
    printifyStatus?: string

    @Column(DataType.JSON)
    fulfillmentMetadata?: object

    @Column(DataType.STRING(120))
    fulfillmentFailureCode?: string

    @Column(DataType.DATE)
    fulfillmentSubmittedAt?: Date

    @Column(DataType.DATE)
    fulfillmentSyncedAt?: Date

    @Column(DataType.STRING(100))
    trackingCarrier?: string

    @Column(DataType.STRING(120))
    trackingNumber?: string

    @Column(DataType.TEXT)
    trackingUrl?: string

    @Column(DataType.DATE)
    shippedAt?: Date

    @Column(DataType.DATE)
    deliveredAt?: Date

    @Column(DataType.DATE)
    paidAt?: Date

    @Column(DataType.DATE)
    fulfilledAt?: Date

    @BelongsTo(() => User)
    user?: User

    @BelongsTo(() => Address)
    shippingAddress?: Address

    @BelongsTo(() => ShippingQuote)
    shippingQuote?: ShippingQuote

    @HasMany(() => OrderItem)
    items?: OrderItem[]

    @HasOne(() => Payment)
    payment?: Payment

    @HasMany(() => AdminNote)
    adminNotes?: AdminNote[]
}

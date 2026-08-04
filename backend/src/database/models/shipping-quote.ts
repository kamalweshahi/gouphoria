import { AllowNull, BelongsTo, Column, DataType, Default, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript'
import { Cart } from './cart'
import { User } from './user'

@Table({
    tableName: 'shipping_quotes',
    timestamps: true,
    underscored: true,
    indexes: [
        { name: 'shipping_quotes_user_created', fields: ['user_id', 'created_at'] },
        { name: 'shipping_quotes_expires', fields: ['expires_at'] }
    ]
})
export class ShippingQuote extends Model {
    @PrimaryKey
    @Column(DataType.UUID)
    id!: string

    @ForeignKey(() => User)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    userId!: number

    @ForeignKey(() => Cart)
    @Column(DataType.BIGINT.UNSIGNED)
    cartId?: number

    @AllowNull(false)
    @Column(DataType.ENUM('cart', 'direct'))
    context!: 'cart' | 'direct'

    @AllowNull(false)
    @Column(DataType.JSON)
    itemSnapshot!: object

    @AllowNull(false)
    @Column(DataType.CHAR(64))
    itemSnapshotHash!: string

    @AllowNull(false)
    @Column(DataType.JSON)
    addressSnapshot!: object

    @AllowNull(false)
    @Column(DataType.CHAR(64))
    addressHash!: string

    @AllowNull(false)
    @Column(DataType.JSON)
    options!: object

    @Default('USD')
    @AllowNull(false)
    @Column(DataType.CHAR(3))
    currency!: string

    @AllowNull(false)
    @Column(DataType.DATE)
    expiresAt!: Date

    @BelongsTo(() => User)
    user?: User

    @BelongsTo(() => Cart)
    cart?: Cart
}

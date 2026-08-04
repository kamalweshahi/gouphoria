import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    DataType,
    Default,
    ForeignKey,
    HasMany,
    Model,
    PrimaryKey,
    Table
} from 'sequelize-typescript'
import { CartItem } from './cart-item'
import { CartStatus } from './model-enums'
import { User } from './user'

@Table({
    tableName: 'carts',
    timestamps: true,
    underscored: true,
    indexes: [{ name: 'carts_user_status', fields: ['user_id', 'status'] }]
})
export class Cart extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @ForeignKey(() => User)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    userId!: number

    @Default(CartStatus.ACTIVE)
    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(CartStatus)))
    status!: CartStatus

    @BelongsTo(() => User)
    user?: User

    @HasMany(() => CartItem)
    items?: CartItem[]
}

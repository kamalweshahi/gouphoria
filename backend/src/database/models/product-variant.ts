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
import { OrderItem } from './order-item'
import { Product } from './product'

@Table({
    tableName: 'product_variants',
    timestamps: true,
    underscored: true,
    indexes: [
        { name: 'product_variants_printify_unique', unique: true, fields: ['product_id', 'printify_variant_id'] },
        { name: 'product_variants_phone_model', fields: ['phone_model'] }
    ]
})
export class ProductVariant extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @ForeignKey(() => Product)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    productId!: number

    @AllowNull(false)
    @Column(DataType.STRING(100))
    printifyVariantId!: string

    @AllowNull(false)
    @Column(DataType.STRING(180))
    title!: string

    @AllowNull(false)
    @Column(DataType.STRING(120))
    phoneModel!: string

    @AllowNull(false)
    @Column(DataType.STRING(120))
    caseType!: string

    @Column(DataType.STRING(120))
    sku?: string

    @Column(DataType.TEXT)
    imageUrl?: string

    @Column(DataType.JSON)
    printifyMetadata?: object

    @Column(DataType.STRING(80))
    mockupTemplateId?: string

    @AllowNull(false)
    @Column(DataType.DECIMAL(10, 2))
    price!: string

    @Default('USD')
    @AllowNull(false)
    @Column(DataType.CHAR(3))
    currency!: string

    @Default(true)
    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    available!: boolean

    @Default(true)
    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    isEnabled!: boolean

    @Default(true)
    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    isStorefrontEnabled!: boolean

    @BelongsTo(() => Product)
    product?: Product

    @HasMany(() => CartItem)
    cartItems?: CartItem[]

    @HasMany(() => OrderItem)
    orderItems?: OrderItem[]
}

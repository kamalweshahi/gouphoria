import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    DataType,
    Default,
    ForeignKey,
    Model,
    PrimaryKey,
    Table
} from 'sequelize-typescript'
import { AIDesign } from './ai-design'
import { Cart } from './cart'
import { Product } from './product'
import { ProductVariant } from './product-variant'
import { CommerceItemType } from './model-enums'

@Table({ tableName: 'cart_items', timestamps: true, underscored: true })
export class CartItem extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @ForeignKey(() => Cart)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    cartId!: number

    @ForeignKey(() => Product)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    productId!: number

    @ForeignKey(() => ProductVariant)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    productVariantId!: number

    @ForeignKey(() => AIDesign)
    @Column(DataType.BIGINT.UNSIGNED)
    aiDesignId?: number

    @Default(CommerceItemType.STANDARD)
    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(CommerceItemType)))
    itemType!: CommerceItemType

    @Default(1)
    @AllowNull(false)
    @Column(DataType.INTEGER.UNSIGNED)
    quantity!: number

    @AllowNull(false)
    @Column(DataType.DECIMAL(10, 2))
    unitPrice!: string

    @Default('0.00')
    @AllowNull(false)
    @Column(DataType.DECIMAL(10, 2))
    basePrice!: string

    @Default('USD')
    @AllowNull(false)
    @Column(DataType.CHAR(3))
    currency!: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    productTitle!: string

    @AllowNull(false)
    @Column(DataType.STRING(180))
    variantTitle!: string

    @AllowNull(false)
    @Column(DataType.STRING(120))
    phoneModel!: string

    @AllowNull(false)
    @Column(DataType.STRING(120))
    caseType!: string

    @Column(DataType.TEXT)
    imageUrl?: string

    @Column(DataType.STRING(500))
    artworkStorageKey?: string

    @Column(DataType.STRING(500))
    mockupStorageKey?: string

    @Column(DataType.CHAR(64))
    artworkChecksumSha256?: string

    @BelongsTo(() => Cart)
    cart?: Cart

    @BelongsTo(() => Product)
    product?: Product

    @BelongsTo(() => ProductVariant)
    productVariant?: ProductVariant

    @BelongsTo(() => AIDesign)
    aiDesign?: AIDesign
}

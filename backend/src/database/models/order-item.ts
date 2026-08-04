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
import { AIDesign } from './ai-design'
import { Order } from './order'
import { Product } from './product'
import { ProductVariant } from './product-variant'
import { CommerceItemType, OrderItemStatus } from './model-enums'
import { User } from './user'
import { AdminNote } from './admin-note'

@Table({ tableName: 'order_items', timestamps: true, underscored: true })
export class OrderItem extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @ForeignKey(() => Order)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    orderId!: number

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

    @Default(OrderItemStatus.PENDING_PAYMENT)
    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(OrderItemStatus)))
    status!: OrderItemStatus

    @AllowNull(false)
    @Column(DataType.STRING(255))
    productTitle!: string

    @AllowNull(false)
    @Column(DataType.STRING(180))
    variantTitle!: string

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

    @AllowNull(false)
    @Column(DataType.DECIMAL(10, 2))
    totalPrice!: string

    @Default('USD')
    @AllowNull(false)
    @Column(DataType.CHAR(3))
    currency!: string

    @AllowNull(false)
    @Column(DataType.STRING(120))
    phoneModel!: string

    @AllowNull(false)
    @Column(DataType.STRING(120))
    caseType!: string

    @Column(DataType.TEXT)
    imageUrl?: string

    @Column(DataType.TEXT)
    artworkUrl?: string

    @Column(DataType.STRING(500))
    artworkStorageKey?: string

    @Column(DataType.STRING(500))
    approvedArtworkStorageKey?: string

    @Column(DataType.STRING(500))
    mockupStorageKey?: string

    @Column(DataType.CHAR(64))
    artworkChecksumSha256?: string

    @Column(DataType.STRING(100))
    printifyProductIdSnapshot?: string

    @Column(DataType.STRING(100))
    printifyVariantIdSnapshot?: string

    @Column(DataType.STRING(100))
    printifyBlueprintIdSnapshot?: string

    @Column(DataType.STRING(100))
    printifyProviderIdSnapshot?: string

    @Column(DataType.STRING(120))
    printifyOrderId?: string

    @Column(DataType.STRING(120))
    printifyUploadId?: string

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

    @ForeignKey(() => User)
    @Column(DataType.BIGINT.UNSIGNED)
    reviewedByUserId?: number

    @Column(DataType.DATE)
    reviewedAt?: Date

    @BelongsTo(() => User, 'reviewedByUserId')
    reviewedByUser?: User

    @BelongsTo(() => Order)
    order?: Order

    @BelongsTo(() => Product)
    product?: Product

    @BelongsTo(() => ProductVariant)
    productVariant?: ProductVariant

    @BelongsTo(() => AIDesign)
    aiDesign?: AIDesign

    @HasMany(() => AdminNote)
    adminNotes?: AdminNote[]
}

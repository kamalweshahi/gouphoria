import {
    AllowNull,
    AutoIncrement,
    Column,
    DataType,
    Default,
    HasMany,
    Model,
    PrimaryKey,
    Table,
    Unique
} from 'sequelize-typescript'
import { ProductStatus } from './model-enums'
import { ProductVariant } from './product-variant'

@Table({ tableName: 'products', timestamps: true, underscored: true })
export class Product extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @Unique
    @AllowNull(false)
    @Column(DataType.STRING(100))
    printifyProductId!: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    title!: string

    @Column(DataType.TEXT)
    description?: string

    @Column(DataType.TEXT)
    thumbnailUrl?: string

    @Column(DataType.STRING(160))
    displayName?: string

    @Column(DataType.STRING(500))
    shortDescription?: string

    @Column(DataType.STRING(100))
    storefrontCategory?: string

    @Column(DataType.TEXT)
    storefrontImage?: string

    @Default(true)
    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    isVisible!: boolean

    @Default(true)
    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    isActive!: boolean

    @Default(0)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    sortOrder!: number

    @Default(true)
    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    allowDirectPurchase!: boolean

    @Default(false)
    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    allowAiCustomization!: boolean

    @Default(false)
    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    aiCustomOnly!: boolean

    @Column(DataType.DECIMAL(10, 2))
    retailPrice?: string

    @Column(DataType.JSON)
    images?: object[]

    @Column(DataType.JSON)
    tags?: string[]

    @Column(DataType.STRING(100))
    blueprintId?: string

    @Column(DataType.STRING(100))
    printProviderId?: string

    @Column(DataType.JSON)
    printifyMetadata?: object

    @Default(ProductStatus.DRAFT)
    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(ProductStatus)))
    status!: ProductStatus

    @Default(false)
    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    visible!: boolean

    @Column(DataType.DATE)
    printifyUpdatedAt?: Date

    @Column(DataType.DATE)
    catalogSyncedAt?: Date

    @HasMany(() => ProductVariant)
    variants?: ProductVariant[]
}

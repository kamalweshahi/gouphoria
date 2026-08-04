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
import { AdminNote } from './admin-note'
import { CartItem } from './cart-item'
import { AIApprovalStatus, AIDesignStatus } from './model-enums'
import { OrderItem } from './order-item'
import { ProductVariant } from './product-variant'
import { Product } from './product'
import { UploadedImage } from './uploaded-image'
import { User } from './user'
import { AIGeneration } from './ai-generation'

@Table({
    tableName: 'ai_designs',
    timestamps: true,
    underscored: true,
    indexes: [
        { name: 'ai_designs_owner_created', fields: ['user_id', 'created_at'] },
        { name: 'ai_designs_review_queue', fields: ['approval_status', 'status'] }
    ]
})
export class AIDesign extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @ForeignKey(() => User)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    userId!: number

    @ForeignKey(() => ProductVariant)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    productVariantId!: number

    @ForeignKey(() => Product)
    @Column(DataType.BIGINT.UNSIGNED)
    productId?: number

    @AllowNull(false)
    @Column(DataType.TEXT)
    prompt!: string

    @Column(DataType.TEXT)
    revisionPrompt?: string

    @Column(DataType.TEXT)
    artworkUrl?: string

    @Column(DataType.TEXT)
    mockupUrl?: string

    @Column(DataType.STRING(500))
    originalArtworkKey?: string

    @Column(DataType.STRING(500))
    currentArtworkKey?: string

    @Column(DataType.STRING(500))
    mockupKey?: string

    @Column(DataType.STRING(80))
    mockupTemplateId?: string

    @Column(DataType.JSON)
    artworkPlacement?: object

    @Column(DataType.DATE)
    mockupGeneratedAt?: Date

    @Column(DataType.STRING(80))
    provider?: string

    @Column(DataType.STRING(120))
    model?: string

    @Column(DataType.DATE)
    generatedAt?: Date

    @Column(DataType.STRING(120))
    lastErrorCode?: string

    @Column(DataType.JSON)
    generationMetadata?: object

    @Default(AIDesignStatus.DRAFT)
    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(AIDesignStatus)))
    status!: AIDesignStatus

    @Default(AIApprovalStatus.NOT_REQUIRED)
    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(AIApprovalStatus)))
    approvalStatus!: AIApprovalStatus

    @Default(0)
    @AllowNull(false)
    @Column(DataType.INTEGER.UNSIGNED)
    creditsUsed!: number

    @Default(0)
    @AllowNull(false)
    @Column(DataType.TINYINT.UNSIGNED)
    generationCount!: number

    @Default(false)
    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    ownershipConfirmed!: boolean

    @Column(DataType.DATE)
    ownershipConfirmedAt?: Date

    @BelongsTo(() => User)
    user?: User

    @BelongsTo(() => ProductVariant)
    productVariant?: ProductVariant

    @BelongsTo(() => Product)
    product?: Product

    @HasMany(() => UploadedImage)
    uploadedImages?: UploadedImage[]

    @HasMany(() => CartItem)
    cartItems?: CartItem[]

    @HasMany(() => OrderItem)
    orderItems?: OrderItem[]

    @HasMany(() => AdminNote)
    adminNotes?: AdminNote[]

    @HasMany(() => AIGeneration)
    generations?: AIGeneration[]
}

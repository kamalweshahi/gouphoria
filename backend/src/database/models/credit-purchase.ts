import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    DataType,
    Default,
    ForeignKey,
    HasOne,
    Model,
    PrimaryKey,
    Table,
    Unique
} from 'sequelize-typescript'
import { CreditPackage } from './credit-package'
import { CreditTransaction } from './credit-transaction'
import { CreditPurchaseStatus } from './model-enums'
import { User } from './user'

@Table({
    tableName: 'credit_purchases',
    timestamps: true,
    underscored: true,
    indexes: [
        { name: 'credit_purchases_user_created', fields: ['user_id', 'created_at'] },
        { name: 'credit_purchases_user_idempotency', fields: ['user_id', 'idempotency_key'], unique: true }
    ]
})
export class CreditPurchase extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @ForeignKey(() => User)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    userId!: number

    @ForeignKey(() => CreditPackage)
    @AllowNull(false)
    @Column(DataType.STRING(64))
    packageId!: string

    @AllowNull(false)
    @Column(DataType.STRING(120))
    packageNameSnapshot!: string

    @AllowNull(false)
    @Column(DataType.INTEGER.UNSIGNED)
    creditAmount!: number

    @AllowNull(false)
    @Column(DataType.DECIMAL(10, 2))
    price!: string

    @AllowNull(false)
    @Column(DataType.CHAR(3))
    currency!: string

    @Unique
    @Column(DataType.STRING(120))
    paypalOrderId?: string

    @Unique
    @Column(DataType.STRING(120))
    paypalCaptureId?: string

    @Default(CreditPurchaseStatus.CREATED)
    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(CreditPurchaseStatus)))
    status!: CreditPurchaseStatus

    @Default(false)
    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    creditsGranted!: boolean

    @AllowNull(false)
    @Column(DataType.STRING(120))
    idempotencyKey!: string

    @Column(DataType.JSON)
    providerMetadata?: object

    @Column(DataType.DATE)
    capturedAt?: Date

    @Column(DataType.DATE)
    creditsGrantedAt?: Date

    @BelongsTo(() => User)
    user?: User

    @BelongsTo(() => CreditPackage)
    package?: CreditPackage

    @HasOne(() => CreditTransaction)
    creditTransaction?: CreditTransaction
}

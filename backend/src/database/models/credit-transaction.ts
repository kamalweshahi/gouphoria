import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    DataType,
    ForeignKey,
    Model,
    PrimaryKey,
    Table
} from 'sequelize-typescript'
import { CreditAccount } from './credit-account'
import { CreditTransactionReason } from './model-enums'
import { User } from './user'
import { AIDesign } from './ai-design'
import { CreditPurchase } from './credit-purchase'
import { Order } from './order'

@Table({
    tableName: 'credit_transactions',
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [{ name: 'credit_transactions_user_created', fields: ['user_id', 'created_at'] }]
})
export class CreditTransaction extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @ForeignKey(() => CreditAccount)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    creditAccountId!: number

    @ForeignKey(() => User)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    userId!: number

    @AllowNull(false)
    @Column(DataType.INTEGER)
    amount!: number

    @AllowNull(false)
    @Column(DataType.INTEGER.UNSIGNED)
    balanceAfter!: number

    @AllowNull(false)
    @Column(DataType.INTEGER.UNSIGNED)
    balanceBefore!: number

    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(CreditTransactionReason)))
    reason!: CreditTransactionReason

    @Column(DataType.STRING(160))
    referenceId?: string

    @ForeignKey(() => AIDesign)
    @Column(DataType.BIGINT.UNSIGNED)
    aiDesignId?: number

    @ForeignKey(() => CreditPurchase)
    @Column(DataType.BIGINT.UNSIGNED)
    creditPurchaseId?: number

    @ForeignKey(() => Order)
    @Column(DataType.BIGINT.UNSIGNED)
    orderId?: number

    @ForeignKey(() => User)
    @Column(DataType.BIGINT.UNSIGNED)
    adminUserId?: number

    @Column(DataType.STRING(120))
    idempotencyKey?: string

    @Column(DataType.JSON)
    metadata?: object

    @BelongsTo(() => CreditAccount)
    creditAccount?: CreditAccount

    @BelongsTo(() => User)
    user?: User

    @BelongsTo(() => AIDesign)
    aiDesign?: AIDesign

    @BelongsTo(() => CreditPurchase)
    creditPurchase?: CreditPurchase

    @BelongsTo(() => Order)
    order?: Order

    @BelongsTo(() => User, 'adminUserId')
    adminUser?: User
}

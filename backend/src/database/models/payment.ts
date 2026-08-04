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
    Table,
    Unique
} from 'sequelize-typescript'
import { Order } from './order'
import { PaymentStatus } from './model-enums'

@Table({ tableName: 'payments', timestamps: true, underscored: true })
export class Payment extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @ForeignKey(() => Order)
    @Unique
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    orderId!: number

    @Default('paypal')
    @AllowNull(false)
    @Column(DataType.STRING(32))
    provider!: string

    @Unique
    @AllowNull(false)
    @Column(DataType.STRING(120))
    providerOrderId!: string

    @Column(DataType.STRING(120))
    providerTransactionId?: string

    @AllowNull(false)
    @Column(DataType.DECIMAL(10, 2))
    amount!: string

    @Default('USD')
    @AllowNull(false)
    @Column(DataType.CHAR(3))
    currency!: string

    @Default(PaymentStatus.CREATED)
    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(PaymentStatus)))
    status!: PaymentStatus

    @Column(DataType.JSON)
    providerResponse?: object

    @Column(DataType.DATE)
    capturedAt?: Date

    @BelongsTo(() => Order)
    order?: Order
}

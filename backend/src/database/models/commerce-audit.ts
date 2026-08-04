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
import { AIDesign } from './ai-design'
import { Order } from './order'
import { OrderItem } from './order-item'
import { User } from './user'

@Table({ tableName: 'commerce_audits', timestamps: true, updatedAt: false, underscored: true })
export class CommerceAudit extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @ForeignKey(() => User)
    @Column(DataType.BIGINT.UNSIGNED)
    actorUserId?: number

    @ForeignKey(() => Order)
    @Column(DataType.BIGINT.UNSIGNED)
    orderId?: number

    @ForeignKey(() => OrderItem)
    @Column(DataType.BIGINT.UNSIGNED)
    orderItemId?: number

    @ForeignKey(() => AIDesign)
    @Column(DataType.BIGINT.UNSIGNED)
    aiDesignId?: number

    @AllowNull(false)
    @Column(DataType.STRING(80))
    action!: string

    @Column(DataType.STRING(80))
    statusBefore?: string

    @Column(DataType.STRING(80))
    statusAfter?: string

    @Column(DataType.JSON)
    metadata?: object

    @BelongsTo(() => User)
    actorUser?: User

    @BelongsTo(() => Order)
    order?: Order

    @BelongsTo(() => OrderItem)
    orderItem?: OrderItem

    @BelongsTo(() => AIDesign)
    aiDesign?: AIDesign
}

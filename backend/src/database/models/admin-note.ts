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
import { AdminNoteVisibility } from './model-enums'
import { Order } from './order'
import { OrderItem } from './order-item'
import { User } from './user'

@Table({ tableName: 'admin_notes', timestamps: true, updatedAt: false, underscored: true })
export class AdminNote extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @ForeignKey(() => User)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    adminUserId!: number

    @ForeignKey(() => Order)
    @Column(DataType.BIGINT.UNSIGNED)
    orderId?: number

    @ForeignKey(() => AIDesign)
    @Column(DataType.BIGINT.UNSIGNED)
    aiDesignId?: number

    @ForeignKey(() => OrderItem)
    @Column(DataType.BIGINT.UNSIGNED)
    orderItemId?: number

    @ForeignKey(() => User)
    @Column(DataType.BIGINT.UNSIGNED)
    targetUserId?: number

    @Column(DataType.STRING(80))
    action?: string

    @Column(DataType.STRING(80))
    statusBefore?: string

    @Column(DataType.STRING(80))
    statusAfter?: string

    @AllowNull(false)
    @Column(DataType.TEXT)
    note!: string

    @Default(AdminNoteVisibility.INTERNAL)
    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(AdminNoteVisibility)))
    visibility!: AdminNoteVisibility

    @BelongsTo(() => User)
    adminUser?: User

    @BelongsTo(() => User, 'targetUserId')
    targetUser?: User

    @BelongsTo(() => Order)
    order?: Order

    @BelongsTo(() => AIDesign)
    aiDesign?: AIDesign

    @BelongsTo(() => OrderItem)
    orderItem?: OrderItem
}

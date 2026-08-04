import { AllowNull, Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript'

@Table({ tableName: 'printify_webhook_events', timestamps: true, updatedAt: false, underscored: true })
export class PrintifyWebhookEvent extends Model {
    @PrimaryKey
    @Column(DataType.UUID)
    id!: string

    @AllowNull(false)
    @Column(DataType.STRING(80))
    topic!: string

    @AllowNull(false)
    @Column(DataType.STRING(120))
    resourceId!: string

    @AllowNull(false)
    @Column(DataType.STRING(100))
    shopId!: string

    @AllowNull(false)
    @Column(DataType.STRING(40))
    outcome!: string
}

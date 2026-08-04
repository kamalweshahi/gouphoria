import {
    AllowNull,
    BelongsTo,
    Column,
    DataType,
    ForeignKey,
    Model,
    PrimaryKey,
    Table
} from 'sequelize-typescript'
import { User } from './user'

@Table({ tableName: 'system_settings', timestamps: true, createdAt: false, underscored: true })
export class SystemSetting extends Model {
    @PrimaryKey
    @Column(DataType.STRING(120))
    key!: string

    @AllowNull(false)
    @Column(DataType.JSON)
    value!: unknown

    @Column(DataType.STRING(500))
    description?: string

    @ForeignKey(() => User)
    @Column(DataType.BIGINT.UNSIGNED)
    updatedByUserId?: number

    @BelongsTo(() => User)
    updatedByUser?: User
}

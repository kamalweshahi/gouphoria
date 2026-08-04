import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    DataType,
    ForeignKey,
    Model,
    PrimaryKey,
    Table,
    Unique
} from 'sequelize-typescript'
import { User } from './user'

@Table({ tableName: 'user_sessions', timestamps: true, underscored: true })
export class UserSession extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @ForeignKey(() => User)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    userId!: number

    @Unique
    @AllowNull(false)
    @Column(DataType.STRING(128))
    tokenHash!: string

    @AllowNull(false)
    @Column(DataType.DATE)
    expiresAt!: Date

    @Column(DataType.DATE)
    revokedAt?: Date

    @Column(DataType.STRING(45))
    ipAddress?: string

    @Column(DataType.STRING(500))
    userAgent?: string

    @BelongsTo(() => User)
    user?: User
}

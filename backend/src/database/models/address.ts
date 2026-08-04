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
import { User } from './user'

@Table({ tableName: 'addresses', timestamps: true, underscored: true })
export class Address extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @ForeignKey(() => User)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    userId!: number

    @AllowNull(false)
    @Column(DataType.STRING(80))
    firstName!: string

    @AllowNull(false)
    @Column(DataType.STRING(80))
    lastName!: string

    @AllowNull(false)
    @Column(DataType.STRING(254))
    email!: string

    @AllowNull(false)
    @Column(DataType.STRING(120))
    recipientName!: string

    @AllowNull(false)
    @Column(DataType.STRING(180))
    line1!: string

    @Column(DataType.STRING(180))
    line2?: string

    @AllowNull(false)
    @Column(DataType.STRING(120))
    city!: string

    @Column(DataType.STRING(120))
    state?: string

    @AllowNull(false)
    @Column(DataType.STRING(32))
    postalCode!: string

    @AllowNull(false)
    @Column(DataType.CHAR(2))
    countryCode!: string

    @Column(DataType.STRING(32))
    phone?: string

    @Default(false)
    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    isDefault!: boolean

    @BelongsTo(() => User)
    user?: User
}

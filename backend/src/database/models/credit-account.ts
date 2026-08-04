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
    Table,
    Unique
} from 'sequelize-typescript'
import { CreditTransaction } from './credit-transaction'
import { User } from './user'

@Table({ tableName: 'credit_accounts', timestamps: true, underscored: true })
export class CreditAccount extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @ForeignKey(() => User)
    @Unique
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    userId!: number

    @Default(0)
    @AllowNull(false)
    @Column(DataType.INTEGER.UNSIGNED)
    balance!: number

    @Default(false)
    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    freeProjectUsed!: boolean

    @BelongsTo(() => User)
    user?: User

    @HasMany(() => CreditTransaction)
    transactions?: CreditTransaction[]
}

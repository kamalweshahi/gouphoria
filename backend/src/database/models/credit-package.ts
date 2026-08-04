import {
    AllowNull,
    Column,
    DataType,
    Default,
    HasMany,
    Model,
    PrimaryKey,
    Table
} from 'sequelize-typescript'
import { CreditPurchase } from './credit-purchase'

@Table({ tableName: 'credit_packages', timestamps: true, underscored: true })
export class CreditPackage extends Model {
    @PrimaryKey
    @Column(DataType.STRING(64))
    id!: string

    @AllowNull(false)
    @Column(DataType.STRING(120))
    name!: string

    @AllowNull(false)
    @Column(DataType.INTEGER.UNSIGNED)
    creditAmount!: number

    @AllowNull(false)
    @Column(DataType.DECIMAL(10, 2))
    price!: string

    @Default('USD')
    @AllowNull(false)
    @Column(DataType.CHAR(3))
    currency!: string

    @Default(true)
    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    active!: boolean

    @Default(0)
    @AllowNull(false)
    @Column(DataType.INTEGER.UNSIGNED)
    sortOrder!: number

    @HasMany(() => CreditPurchase)
    purchases?: CreditPurchase[]
}

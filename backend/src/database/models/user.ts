import {
    AllowNull,
    AutoIncrement,
    Column,
    DataType,
    Default,
    HasMany,
    HasOne,
    Model,
    PrimaryKey,
    Table,
    Unique
} from 'sequelize-typescript'
import { Address } from './address'
import { AdminNote } from './admin-note'
import { AIDesign } from './ai-design'
import { AIGeneration } from './ai-generation'
import { Cart } from './cart'
import { CreditAccount } from './credit-account'
import { CreditTransaction } from './credit-transaction'
import { CreditPurchase } from './credit-purchase'
import { Order } from './order'
import { UploadedImage } from './uploaded-image'
import { UserRole, UserStatus } from './model-enums'
import { UserSession } from './user-session'

@Table({
    tableName: 'users',
    timestamps: true,
    underscored: true,
    defaultScope: { attributes: { exclude: ['passwordHash'] } },
    scopes: { withPassword: { attributes: { include: ['passwordHash'] } } }
})
export class User extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @AllowNull(false)
    @Column(DataType.STRING(120))
    name!: string

    @Unique
    @AllowNull(false)
    @Column(DataType.STRING(254))
    email!: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    passwordHash!: string

    @Default(UserRole.USER)
    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(UserRole)))
    role!: UserRole

    @Default(UserStatus.ACTIVE)
    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(UserStatus)))
    status!: UserStatus

    @Column(DataType.DATE)
    lastLoginAt?: Date

    @HasMany(() => Address)
    addresses?: Address[]

    @HasMany(() => Cart)
    carts?: Cart[]

    @HasMany(() => Order)
    orders?: Order[]

    @HasMany(() => AIDesign)
    aiDesigns?: AIDesign[]

    @HasMany(() => AIGeneration)
    aiGenerations?: AIGeneration[]

    @HasMany(() => UploadedImage)
    uploadedImages?: UploadedImage[]

    @HasOne(() => CreditAccount)
    creditAccount?: CreditAccount

    @HasMany(() => CreditTransaction)
    creditTransactions?: CreditTransaction[]

    @HasMany(() => CreditPurchase)
    creditPurchases?: CreditPurchase[]

    @HasMany(() => UserSession)
    sessions?: UserSession[]

    @HasMany(() => AdminNote, 'targetUserId')
    adminNotes?: AdminNote[]
}

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

@Table({ tableName: 'catalog_product_deletions', timestamps: true, updatedAt: false, underscored: true })
export class CatalogProductDeletion extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @Unique
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    originalProductId!: number

    @Unique
    @AllowNull(false)
    @Column(DataType.STRING(100))
    externalProductId!: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    productName!: string

    @AllowNull(false)
    @Column(DataType.ENUM('deleted', 'archived'))
    action!: 'deleted' | 'archived'

    @ForeignKey(() => User)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    actorUserId!: number

    @Column(DataType.STRING(500))
    reason?: string

    @BelongsTo(() => User)
    actor?: User
}

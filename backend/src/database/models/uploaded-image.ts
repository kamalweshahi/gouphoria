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
import { AIDesign } from './ai-design'
import { User } from './user'

@Table({ tableName: 'uploaded_images', timestamps: true, updatedAt: false, underscored: true })
export class UploadedImage extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @ForeignKey(() => User)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    userId!: number

    @ForeignKey(() => AIDesign)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    aiDesignId!: number

    @AllowNull(false)
    @Column(DataType.STRING(255))
    originalFilename!: string

    @Unique
    @AllowNull(false)
    @Column(DataType.STRING(500))
    storageKey!: string

    @AllowNull(false)
    @Column(DataType.STRING(100))
    mimeType!: string

    @AllowNull(false)
    @Column(DataType.INTEGER.UNSIGNED)
    sizeBytes!: number

    @AllowNull(false)
    @Column(DataType.STRING(12))
    extension!: string

    @AllowNull(false)
    @Column(DataType.CHAR(64))
    checksumSha256!: string

    @Column(DataType.INTEGER.UNSIGNED)
    width?: number

    @Column(DataType.INTEGER.UNSIGNED)
    height?: number

    @BelongsTo(() => User)
    user?: User

    @BelongsTo(() => AIDesign)
    aiDesign?: AIDesign
}

import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    DataType,
    ForeignKey,
    Model,
    PrimaryKey,
    Table
} from 'sequelize-typescript'
import { AIGenerationKind, AIGenerationStatus } from './model-enums'
import { AIDesign } from './ai-design'
import { User } from './user'

@Table({
    tableName: 'ai_generations',
    timestamps: true,
    underscored: true,
    indexes: [
        { name: 'ai_generations_design_created', fields: ['ai_design_id', 'created_at'] },
        { name: 'ai_generations_user_created', fields: ['user_id', 'created_at'] },
        { name: 'ai_generations_design_idempotency', unique: true, fields: ['ai_design_id', 'idempotency_key'] }
    ]
})
export class AIGeneration extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.BIGINT.UNSIGNED)
    id!: number

    @ForeignKey(() => AIDesign)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    aiDesignId!: number

    @ForeignKey(() => User)
    @AllowNull(false)
    @Column(DataType.BIGINT.UNSIGNED)
    userId!: number

    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(AIGenerationKind)))
    kind!: AIGenerationKind

    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(AIGenerationStatus)))
    status!: AIGenerationStatus

    @AllowNull(false)
    @Column(DataType.STRING(120))
    idempotencyKey!: string

    @AllowNull(false)
    @Column(DataType.CHAR(64))
    requestHash!: string

    @AllowNull(false)
    @Column(DataType.TEXT)
    prompt!: string

    @Column(DataType.STRING(80))
    provider?: string

    @Column(DataType.STRING(120))
    model?: string

    @Column(DataType.STRING(500))
    artworkStorageKey?: string

    @Column(DataType.STRING(500))
    mockupStorageKey?: string

    @Column(DataType.STRING(120))
    providerRequestId?: string

    @Column(DataType.STRING(120))
    safeErrorCode?: string

    @Column(DataType.JSON)
    metadata?: object

    @Column(DataType.DATE)
    completedAt?: Date

    @BelongsTo(() => AIDesign)
    aiDesign?: AIDesign

    @BelongsTo(() => User)
    user?: User
}

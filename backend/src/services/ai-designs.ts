import { createHash } from 'crypto'
import { basename } from 'path'
import { UniqueConstraintError } from 'sequelize'
import { getDatabase } from '../database/database'
import { AIDesign } from '../database/models/ai-design'
import { AIGeneration } from '../database/models/ai-generation'
import { CreditAccount } from '../database/models/credit-account'
import { CreditTransaction } from '../database/models/credit-transaction'
import { CommerceAudit } from '../database/models/commerce-audit'
import {
    AIApprovalStatus,
    AIDesignStatus,
    AIGenerationKind,
    AIGenerationStatus,
    CreditTransactionReason,
    AdminReviewAction,
    ProductStatus
} from '../database/models/model-enums'
import { Product } from '../database/models/product'
import { ProductVariant } from '../database/models/product-variant'
import { UploadedImage } from '../database/models/uploaded-image'
import { AdminNote } from '../database/models/admin-note'
import { Order } from '../database/models/order'
import { OrderItem } from '../database/models/order-item'
import HttpError from '../errors/http-error'
import { buildPhoneCaseArtworkPrompt, normalizeGeneratedPhoneCaseArtwork } from './ai-artwork'
import { validateUploadedImage } from './ai-images'
import {
    AIModerationRejectedError,
    AIProviderTimeoutError,
    AIProviderUnavailableError,
    getAIImageProvider,
    type AIImageProvider,
    type AIImageResult
} from './ai-provider'
import { mimeTypeForStorageKey, privateStorage, type PrivateStorageService } from './ai-storage'
import { composeMockupPreview, mockupPreviewStatusForVariant, mockupTemplateIdForVariant } from './mockup-templates'

export const MAX_AI_UPLOADS = 2

const transitionMap: Record<AIDesignStatus, AIDesignStatus[]> = {
    [AIDesignStatus.DRAFT]: [AIDesignStatus.GENERATING, AIDesignStatus.FAILED, AIDesignStatus.CANCELLED],
    [AIDesignStatus.GENERATING]: [AIDesignStatus.WAITING_FOR_USER, AIDesignStatus.FAILED],
    [AIDesignStatus.GENERATED]: [AIDesignStatus.WAITING_FOR_USER, AIDesignStatus.APPROVED, AIDesignStatus.REVISION_REQUESTED, AIDesignStatus.FAILED],
    [AIDesignStatus.WAITING_FOR_USER]: [AIDesignStatus.APPROVED, AIDesignStatus.REVISION_REQUESTED, AIDesignStatus.FAILED],
    [AIDesignStatus.REVISION_REQUESTED]: [AIDesignStatus.GENERATING, AIDesignStatus.FAILED],
    [AIDesignStatus.FAILED]: [AIDesignStatus.GENERATING, AIDesignStatus.REVISION_REQUESTED, AIDesignStatus.CANCELLED],
    [AIDesignStatus.APPROVED]: [AIDesignStatus.ADDED_TO_CART, AIDesignStatus.CANCELLED],
    [AIDesignStatus.ADDED_TO_CART]: [AIDesignStatus.APPROVED, AIDesignStatus.PURCHASED, AIDesignStatus.CANCELLED],
    [AIDesignStatus.PURCHASED]: [AIDesignStatus.PENDING_ADMIN_REVIEW, AIDesignStatus.CANCELLED],
    [AIDesignStatus.PENDING_ADMIN_REVIEW]: [AIDesignStatus.APPROVED_FOR_PRINT, AIDesignStatus.REJECTED, AIDesignStatus.CHANGES_REQUESTED],
    [AIDesignStatus.APPROVED_FOR_PRINT]: [AIDesignStatus.COMPLETED, AIDesignStatus.CANCELLED],
    [AIDesignStatus.REJECTED]: [AIDesignStatus.CANCELLED],
    [AIDesignStatus.CHANGES_REQUESTED]: [AIDesignStatus.CANCELLED],
    [AIDesignStatus.COMPLETED]: [],
    [AIDesignStatus.CANCELLED]: []
}

export function assertAIDesignTransition(from: AIDesignStatus, to: AIDesignStatus) {
    if (from === to) return
    if (!transitionMap[from]?.includes(to)) {
        throw new HttpError(409, `This design cannot move from ${from.replace(/_/g, ' ')} to ${to.replace(/_/g, ' ')}.`)
    }
}

function requestHash(kind: AIGenerationKind, prompt: string) {
    return createHash('sha256').update(`${kind}\n${prompt}`).digest('hex')
}

function generationLeaseMs() {
    const configured = Number(process.env.AI_GENERATION_TIMEOUT_MS ?? 120000)
    return (Number.isInteger(configured) && configured >= 10000 && configured <= 300000 ? configured : 120000) + 60000
}

function publicAssetUrl(designId: number, kind: 'original' | 'current' | 'mockup', version?: Date) {
    const path = `/ai/assets/designs/${designId}/${kind}`
    return version ? `${path}?v=${version.getTime()}` : path
}

function safeOriginalFilename(value: string) {
    return basename(value).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 255) || 'reference-image'
}

function mockupProductTitle(product?: Product | null) {
    return [product?.displayName, product?.title].filter(Boolean).join(' · ')
}

async function validateCatalogSelection(printifyProductId: string, printifyVariantId: string, transaction?: any) {
    const product = await Product.findOne({
        where: { printifyProductId, status: ProductStatus.ACTIVE, visible: true, isVisible: true, isActive: true },
        transaction
    })
    if (!product || !product.allowAiCustomization) throw new HttpError(422, 'Choose an AI-customizable phone case product.')
    if (!product.blueprintId || !/^\d+$/.test(product.blueprintId) || !product.printProviderId || !/^\d+$/.test(product.printProviderId)) {
        throw new HttpError(422, 'This phone case is not configured for customization.')
    }
    const variant = await ProductVariant.findOne({
        where: {
            productId: product.id,
            printifyVariantId,
            isEnabled: true,
            isStorefrontEnabled: true,
            available: true
        },
        transaction
    })
    if (!variant) throw new HttpError(422, 'Choose an available phone model and case type for this product.')
    const mockupStatus = mockupPreviewStatusForVariant({
        phoneModel: variant.phoneModel,
        caseType: variant.caseType,
        productTitle: mockupProductTitle(product),
        mockupTemplateId: variant.mockupTemplateId
    })
    if (mockupStatus.status === 'unsupported-model') {
        throw new HttpError(422, `A realistic preview is not supported for the exact phone model "${variant.phoneModel}".`)
    }
    return { product, variant }
}

async function ownedDesign(userId: number, designId: number, lock?: any, transaction?: any) {
    const design = await AIDesign.findOne({
        where: { id: designId, userId },
        transaction,
        ...(lock ? { lock } : {})
    })
    if (!design) throw new HttpError(404, 'Design not found.')
    return design
}

async function loadDesignForView(userId: number, designId: number) {
    const design = await AIDesign.findOne({
        where: { id: designId, userId },
        include: [
            Product,
            ProductVariant,
            UploadedImage,
            { model: AIGeneration, separate: true, order: [['createdAt', 'ASC']] }
        ]
    })
    if (!design) throw new HttpError(404, 'Design not found.')
    return design
}

async function creditBalance(userId: number) {
    const account = await CreditAccount.findOne({ where: { userId } })
    return account?.balance ?? 0
}

function serializeGeneration(generation: AIGeneration) {
    return {
        id: Number(generation.id),
        kind: generation.kind,
        status: generation.status,
        createdAt: generation.createdAt,
        completedAt: generation.completedAt
    }
}

async function serializeDesign(design: AIDesign) {
    const id = Number(design.id)
    const artworkUrl = design.currentArtworkKey ? publicAssetUrl(id, 'current') : undefined
    const mockupPreviewStatus = design.productVariant ? mockupPreviewStatusForVariant({
        phoneModel: design.productVariant.phoneModel,
        caseType: design.productVariant.caseType,
        productTitle: mockupProductTitle(design.product),
        mockupTemplateId: design.productVariant.mockupTemplateId
    }) : undefined
    const mockupPreviewUrl = design.mockupKey && mockupPreviewStatus?.status === 'supported'
        ? publicAssetUrl(id, 'mockup', design.mockupGeneratedAt ?? design.updatedAt)
        : undefined
    const purchases = await OrderItem.findAll({
        where: { aiDesignId: id },
        include: [Order, { model: AdminNote, where: { visibility: 'user' }, required: false }],
        order: [['createdAt', 'DESC']]
    })
    return {
        id,
        prompt: design.prompt,
        revisionPrompt: design.revisionPrompt,
        status: design.status,
        approvalStatus: design.approvalStatus,
        ownershipConfirmed: design.ownershipConfirmed,
        ownershipConfirmedAt: design.ownershipConfirmedAt,
        creditsUsed: design.creditsUsed,
        generationCount: design.generationCount,
        revisionAvailable: design.generationCount === 1 && [AIDesignStatus.WAITING_FOR_USER, AIDesignStatus.GENERATED, AIDesignStatus.FAILED].includes(design.status),
        generatedAt: design.generatedAt,
        artworkUrl,
        mockupPreviewUrl,
        mockupPreviewStatus,
        mockupTemplateId: design.mockupTemplateId,
        selectedVariantId: design.productVariant?.printifyVariantId,
        artworkPlacement: design.artworkPlacement,
        mockupGeneratedAt: design.mockupGeneratedAt,
        product: design.product ? {
            id: design.product.printifyProductId,
            title: design.product.displayName || design.product.title,
            available: design.product.status === ProductStatus.ACTIVE && design.product.visible && design.product.isVisible
                && design.product.isActive && design.product.allowAiCustomization
                && Boolean(design.product.blueprintId && /^\d+$/.test(design.product.blueprintId))
                && Boolean(design.product.printProviderId && /^\d+$/.test(design.product.printProviderId))
                && Boolean(design.productVariant?.isEnabled && design.productVariant?.isStorefrontEnabled && design.productVariant?.available)
        } : undefined,
        variant: design.productVariant ? {
            id: design.productVariant.printifyVariantId,
            title: design.productVariant.title,
            phoneModel: design.productVariant.phoneModel,
            caseType: design.productVariant.caseType
        } : undefined,
        uploads: (design.uploadedImages ?? []).map(upload => ({
            id: Number(upload.id),
            url: `/ai/assets/uploads/${upload.id}`,
            mimeType: upload.mimeType,
            sizeBytes: upload.sizeBytes,
            width: upload.width,
            height: upload.height
        })),
        artwork: {
            originalUrl: design.originalArtworkKey ? publicAssetUrl(id, 'original') : undefined,
            currentUrl: artworkUrl,
            mockupUrl: mockupPreviewUrl
        },
        commerce: purchases.map(item => ({
            orderId: item.orderId ? Number(item.orderId) : undefined,
            orderNumber: item.order?.orderNumber,
            orderItemId: Number(item.id),
            paymentStatus: item.order?.paymentStatus,
            reviewStatus: item.status,
            customerMessage: [...(item.adminNotes ?? [])].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.note,
            createdAt: item.createdAt
        })),
        generations: (design.generations ?? []).map(serializeGeneration),
        createdAt: design.createdAt,
        updatedAt: design.updatedAt
    }
}

export async function createAIDesign(userId: number, input: {
    productId: string
    variantId: string
    prompt: string
    ownershipConfirmed: boolean
}) {
    if (!input.ownershipConfirmed) throw new HttpError(422, 'Confirm that you own the rights to upload and use these images.')
    const { product, variant } = await validateCatalogSelection(input.productId, input.variantId)
    const created = await AIDesign.create({
        userId,
        productId: product.id,
        productVariantId: variant.id,
        prompt: input.prompt.trim().replace(/\r\n/g, '\n'),
        ownershipConfirmed: true,
        ownershipConfirmedAt: new Date(),
        status: AIDesignStatus.DRAFT,
        approvalStatus: AIApprovalStatus.NOT_REQUIRED
    })
    return serializeDesign(await loadDesignForView(userId, Number(created.id)))
}

export async function addAIDesignUploads(
    userId: number,
    designId: number,
    files: Express.Multer.File[],
    storage: PrivateStorageService = privateStorage
) {
    if (!files.length) throw new HttpError(422, 'Choose at least one reference image.')
    const design = await ownedDesign(userId, designId)
    if (design.generationCount > 0 || ![AIDesignStatus.DRAFT, AIDesignStatus.FAILED].includes(design.status)) {
        throw new HttpError(409, 'Reference images cannot be changed after generation has started.')
    }
    const existingCount = await UploadedImage.count({ where: { userId, aiDesignId: designId } })
    if (existingCount + files.length > MAX_AI_UPLOADS) throw new HttpError(422, `You may upload up to ${MAX_AI_UPLOADS} reference images per design.`)

    const stored: Array<{
        storageKey: string
        originalFilename: string
        mimeType: 'image/jpeg'
        sizeBytes: number
        extension: 'jpg'
        checksumSha256: string
        width: number
        height: number
    }> = []
    try {
        // Image decoding, resizing, compression, and file writes deliberately happen
        // before the short database transaction so normal phone photos never hold row locks.
        for (const file of files) {
            const validated = await validateUploadedImage(file)
            console.info('AI reference image normalized', {
                userId,
                designId,
                sourceDimensions: `${validated.originalWidth}x${validated.originalHeight}`,
                normalizedDimensions: `${validated.width}x${validated.height}`,
                normalizedMimeType: validated.mimeType,
                creditState: 'not_charged'
            })
            const storageKey = await storage.write('uploads', validated.sanitizedBytes, validated.extension)
            stored.push({
                storageKey,
                originalFilename: safeOriginalFilename(file.originalname),
                mimeType: validated.mimeType,
                sizeBytes: validated.sanitizedBytes.length,
                extension: validated.extension,
                checksumSha256: validated.checksumSha256,
                width: validated.width,
                height: validated.height
            })
        }
        await getDatabase().transaction(async transaction => {
            const current = await ownedDesign(userId, designId, transaction.LOCK.UPDATE, transaction)
            if (current.generationCount > 0 || ![AIDesignStatus.DRAFT, AIDesignStatus.FAILED].includes(current.status)) {
                throw new HttpError(409, 'Reference images cannot be changed after generation has started.')
            }
            const currentCount = await UploadedImage.count({ where: { userId, aiDesignId: designId }, transaction })
            if (currentCount + stored.length > MAX_AI_UPLOADS) throw new HttpError(422, `You may upload up to ${MAX_AI_UPLOADS} reference images per design.`)
            for (const image of stored) await UploadedImage.create({ userId, aiDesignId: designId, ...image }, { transaction })
        })
    } catch (error) {
        await Promise.all(stored.map(image => storage.remove(image.storageKey)))
        throw error
    }
    return serializeDesign(await loadDesignForView(userId, designId))
}

async function referenceImages(userId: number, designId: number, storage: PrivateStorageService) {
    const uploads = await UploadedImage.findAll({ where: { userId, aiDesignId: designId }, order: [['createdAt', 'ASC']] })
    return Promise.all(uploads.map(async upload => ({
        bytes: await storage.read(upload.storageKey),
        mimeType: upload.mimeType
    })))
}

function failureDetails(error: unknown, stage: string) {
    if (error instanceof AIModerationRejectedError) {
        return { code: 'moderation_rejected', status: 422, message: 'We could not create this design from the current request. Try adjusting your idea or reference image.', recoverable: true }
    }
    if (error instanceof AIProviderUnavailableError) {
        return { code: 'provider_failed', status: 503, message: 'We could not finish your design right now. Your work is saved; please try again.', recoverable: true }
    }
    if (error instanceof AIProviderTimeoutError) {
        return { code: 'provider_timeout', status: 504, message: 'Your design took longer than expected. Your work is saved; please try again.', recoverable: true }
    }
    if (error instanceof HttpError) {
        const code = stage === 'output_normalization' ? 'invalid_provider_output'
            : stage === 'reference_loading' ? 'preprocessing_failed'
                : stage === 'mockup_composition' || stage === 'database_finalize' ? 'internal_processing_failed'
                    : error.status >= 500 ? 'internal_processing_failed' : 'validation_failed'
        return { code, status: error.status, message: error.message, recoverable: error.status >= 500 }
    }
    const code = stage === 'mockup_composition' || stage === 'database_finalize' || stage === 'reference_loading'
        ? 'internal_processing_failed'
        : 'provider_failed'
    return { code, status: 502, message: 'We could not finish your design. Your work is saved; please try again.', recoverable: true }
}

async function recordFailedGeneration(
    userId: number,
    designId: number,
    kind: AIGenerationKind,
    idempotencyKey: string,
    prompt: string,
    hash: string,
    code: string
) {
    await getDatabase().transaction(async transaction => {
        const design = await ownedDesign(userId, designId, transaction.LOCK.UPDATE, transaction)
        const existing = await AIGeneration.findOne({ where: { aiDesignId: designId, idempotencyKey }, transaction, lock: transaction.LOCK.UPDATE })
        if (!existing) {
            await AIGeneration.create({
                aiDesignId: designId,
                userId,
                kind,
                status: AIGenerationStatus.FAILED,
                idempotencyKey,
                requestHash: hash,
                prompt,
                safeErrorCode: code,
                completedAt: new Date()
            }, { transaction })
        } else if (existing.status !== AIGenerationStatus.SUCCEEDED) {
            existing.status = AIGenerationStatus.FAILED
            existing.safeErrorCode = code
            existing.completedAt = new Date()
            await existing.save({ transaction })
        }
        if (![AIDesignStatus.APPROVED, AIDesignStatus.CANCELLED, AIDesignStatus.COMPLETED].includes(design.status)) {
            assertAIDesignTransition(design.status, AIDesignStatus.FAILED)
            design.status = AIDesignStatus.FAILED
            design.lastErrorCode = code
            await design.save({ transaction })
        }
    })
}

interface PreparedGeneration {
    idempotent: boolean
    generationId?: number
    attemptedPrompt: string
    hash: string
    designPrompt?: string
    currentArtworkKey?: string
    productTitle?: string
    selectedVariant?: {
        phoneModel: string
        caseType: string
        mockupTemplateId?: string
    }
}

async function prepareGeneration(
    userId: number,
    designId: number,
    kind: AIGenerationKind,
    idempotencyKey: string,
    revisionInstructions: string | undefined
): Promise<PreparedGeneration> {
    return getDatabase().transaction(async transaction => {
        const design = await ownedDesign(userId, designId, transaction.LOCK.UPDATE, transaction)
        const account = await CreditAccount.findOne({ where: { userId }, transaction, lock: transaction.LOCK.UPDATE })
        if (!account) throw new HttpError(409, 'Your credit account is unavailable.')

        const attemptedPrompt = kind === AIGenerationKind.INITIAL ? design.prompt : (revisionInstructions ?? '')
        const hash = requestHash(kind, attemptedPrompt)
        const active = await AIGeneration.findOne({
            where: { aiDesignId: designId, status: AIGenerationStatus.PROCESSING },
            order: [['createdAt', 'DESC']],
            transaction,
            lock: transaction.LOCK.UPDATE
        })
        if (active) {
            const age = Date.now() - active.createdAt.getTime()
            if (age <= generationLeaseMs()) {
                if (active.idempotencyKey === idempotencyKey && active.requestHash !== hash) {
                    throw new HttpError(409, 'This request identifier was already used for a different generation request.')
                }
                throw new HttpError(409, 'This design is already being prepared. Your saved project is still processing.')
            }
            active.status = AIGenerationStatus.FAILED
            active.safeErrorCode = 'provider_timeout'
            active.completedAt = new Date()
            await active.save({ transaction })
            if (design.status === AIDesignStatus.GENERATING) {
                design.status = AIDesignStatus.FAILED
                design.lastErrorCode = 'provider_timeout'
                await design.save({ transaction })
            }
        }
        const existing = await AIGeneration.findOne({ where: { aiDesignId: designId, idempotencyKey }, transaction, lock: transaction.LOCK.UPDATE })
        if (existing) {
            if (existing.requestHash !== hash || existing.kind !== kind) throw new HttpError(409, 'This request identifier was already used for a different generation request.')
            if (existing.status === AIGenerationStatus.SUCCEEDED) return { idempotent: true, attemptedPrompt, hash }
            if (existing.status === AIGenerationStatus.FAILED) throw new HttpError(409, 'This generation request already failed. Retry with a new request identifier.')
            throw new HttpError(409, 'This generation request is already in progress. Your saved project is still being prepared.')
        }

        if (!design.ownershipConfirmed || !design.ownershipConfirmedAt) {
            throw new HttpError(422, 'Confirm that you own the rights to upload and use these images.')
        }
        if (kind === AIGenerationKind.INITIAL) {
            if (design.generationCount !== 0 || ![AIDesignStatus.DRAFT, AIDesignStatus.FAILED].includes(design.status)) {
                throw new HttpError(409, 'The initial artwork has already been generated for this project.')
            }
            const referenceCount = await UploadedImage.count({ where: { userId, aiDesignId: designId }, transaction })
            if (referenceCount === 0) throw new HttpError(422, 'Upload one or two reference images before generating artwork.')
        } else {
            if (design.generationCount !== 1 || !design.currentArtworkKey) throw new HttpError(409, 'The one available revision cannot be used for this project.')
            if ([AIDesignStatus.APPROVED, AIDesignStatus.CANCELLED].includes(design.status)) throw new HttpError(409, 'This design can no longer be revised.')
            design.revisionPrompt = revisionInstructions
            if (design.status !== AIDesignStatus.REVISION_REQUESTED) {
                assertAIDesignTransition(design.status, AIDesignStatus.REVISION_REQUESTED)
                design.status = AIDesignStatus.REVISION_REQUESTED
            }
        }
        if (account.balance < 1) throw new HttpError(402, 'You do not have enough AI credits for this generation.')

        const selectedVariant = await ProductVariant.findByPk(design.productVariantId, { transaction })
        if (!selectedVariant) throw new HttpError(409, 'The selected phone-case variant is no longer available.')
        const selectedProduct = design.productId ? await Product.findByPk(design.productId, { transaction }) : undefined
        assertAIDesignTransition(design.status, AIDesignStatus.GENERATING)
        design.status = AIDesignStatus.GENERATING
        design.lastErrorCode = undefined
        await design.save({ transaction })

        const generation = await AIGeneration.create({
            aiDesignId: designId,
            userId,
            kind,
            status: AIGenerationStatus.PROCESSING,
            idempotencyKey,
            requestHash: hash,
            prompt: attemptedPrompt
        }, { transaction })
        return {
            idempotent: false,
            generationId: Number(generation.id),
            attemptedPrompt,
            hash,
            designPrompt: design.prompt,
            currentArtworkKey: design.currentArtworkKey,
            productTitle: mockupProductTitle(selectedProduct),
            selectedVariant: {
                phoneModel: selectedVariant.phoneModel,
                caseType: selectedVariant.caseType,
                mockupTemplateId: selectedVariant.mockupTemplateId
            }
        }
    })
}

async function runGeneration(
    userId: number,
    designId: number,
    kind: AIGenerationKind,
    idempotencyKey: string,
    revisionInstructions: string | undefined,
    provider: AIImageProvider,
    storage: PrivateStorageService
) {
    let artworkKey: string | undefined
    let mockupKey: string | undefined
    let attemptedPrompt = ''
    let hash = ''
    let processingStarted = false
    let failureStage = 'validation'
    try {
        const prepared = await prepareGeneration(userId, designId, kind, idempotencyKey, revisionInstructions)
        attemptedPrompt = prepared.attemptedPrompt
        hash = prepared.hash
        if (prepared.idempotent) {
            const design = await loadDesignForView(userId, designId)
            return { design: await serializeDesign(design), credits: { balance: await creditBalance(userId) }, idempotent: true }
        }
        processingStarted = true
        const generationId = prepared.generationId!
        const selectedVariant = prepared.selectedVariant!

        // Moderation, the external AI call, image processing, mockup composition,
        // and private file writes are intentionally outside any DB transaction.
        failureStage = 'reference_loading'
        const references = await referenceImages(userId, designId, storage)
        if (kind === AIGenerationKind.INITIAL && references.length === 0) {
            throw new HttpError(422, 'Upload one or two reference images before generating artwork.')
        }
        const generatedPrompt = buildPhoneCaseArtworkPrompt({
            userPrompt: prepared.designPrompt!,
            phoneModel: selectedVariant.phoneModel,
            revisionInstructions: kind === AIGenerationKind.REVISION ? revisionInstructions : undefined
        })
        failureStage = 'moderation'
        const moderation = await provider.moderate(generatedPrompt, references)
        if (moderation.flagged) throw new AIModerationRejectedError('Moderation rejected the request')

        failureStage = 'provider_generation'
        const result: AIImageResult = kind === AIGenerationKind.INITIAL
            ? await provider.generate(generatedPrompt, references)
            : await provider.revise(generatedPrompt, await storage.read(prepared.currentArtworkKey!), references)
        if (!result.bytes.length) throw new Error('Image provider returned an empty result')
        failureStage = 'output_normalization'
        const normalizedArtwork = await normalizeGeneratedPhoneCaseArtwork(result.bytes)
        const printReadiness = normalizedArtwork.inspection

        failureStage = 'mockup_composition'
        artworkKey = await storage.write('artwork', normalizedArtwork.bytes, 'png')
        const mockup = await composeMockupPreview(normalizedArtwork.bytes, {
            phoneModel: selectedVariant.phoneModel,
            caseType: selectedVariant.caseType,
            productTitle: prepared.productTitle,
            mockupTemplateId: selectedVariant.mockupTemplateId
        })
        mockupKey = await storage.write('mockups', mockup.bytes, 'png')

        failureStage = 'database_finalize'
        await getDatabase().transaction(async transaction => {
            const design = await ownedDesign(userId, designId, transaction.LOCK.UPDATE, transaction)
            const generation = await AIGeneration.findOne({
                where: { id: generationId, aiDesignId: designId, userId },
                transaction,
                lock: transaction.LOCK.UPDATE
            })
            if (!generation || generation.status !== AIGenerationStatus.PROCESSING || design.status !== AIDesignStatus.GENERATING) {
                throw new HttpError(409, 'This saved generation is no longer active. Please open the design before retrying.')
            }
            const account = await CreditAccount.findOne({ where: { userId }, transaction, lock: transaction.LOCK.UPDATE })
            if (!account) throw new HttpError(409, 'Your credit account is unavailable.')
            const before = account.balance
            const after = before - 1
            if (after < 0) throw new HttpError(402, 'You do not have enough AI credits for this generation.')
            account.balance = after
            account.freeProjectUsed = after === 0
            await account.save({ transaction })
            await CreditTransaction.create({
                creditAccountId: account.id,
                userId,
                amount: -1,
                balanceBefore: before,
                balanceAfter: after,
                reason: kind === AIGenerationKind.INITIAL ? CreditTransactionReason.GENERATION : CreditTransactionReason.REVISION,
                referenceId: `ai-generation:${generation.id}`,
                aiDesignId: designId,
                idempotencyKey,
                metadata: { generationId: Number(generation.id), kind }
            }, { transaction })

            if (kind === AIGenerationKind.INITIAL) design.originalArtworkKey = artworkKey
            design.currentArtworkKey = artworkKey
            design.mockupKey = mockupKey
            design.mockupTemplateId = mockup.templateId
            design.artworkPlacement = mockup.placement
            design.mockupGeneratedAt = new Date()
            design.artworkUrl = publicAssetUrl(designId, 'current')
            design.mockupUrl = publicAssetUrl(designId, 'mockup')
            design.provider = result.provider
            design.model = result.model
            design.generatedAt = new Date()
            design.generationCount += 1
            design.creditsUsed += 1
            assertAIDesignTransition(design.status, AIDesignStatus.WAITING_FOR_USER)
            design.status = AIDesignStatus.WAITING_FOR_USER
            design.generationMetadata = {
                latestGenerationId: Number(generation.id),
                kind,
                provider: result.provider,
                model: result.model,
                referenceCount: references.length,
                mockupTemplateId: mockup.templateId,
                ...result.metadata,
                normalizedPhoneModel: mockup.normalizedPhoneModel,
                cameraTemplateId: mockup.cameraTemplateId,
                shellTemplateId: mockup.shellTemplateId,
                placementReview: mockup.placementReview,
                printReadiness
            }
            await design.save({ transaction })

            generation.status = AIGenerationStatus.SUCCEEDED
            generation.provider = result.provider
            generation.model = result.model
            generation.artworkStorageKey = artworkKey
            generation.mockupStorageKey = mockupKey
            generation.providerRequestId = result.requestId
            generation.metadata = {
                ...result.metadata,
                printReadiness,
                mockup: {
                    templateId: mockup.templateId,
                    normalizedPhoneModel: mockup.normalizedPhoneModel,
                    cameraTemplateId: mockup.cameraTemplateId,
                    shellTemplateId: mockup.shellTemplateId,
                    placementReview: mockup.placementReview
                }
            }
            generation.completedAt = new Date()
            await generation.save({ transaction })
            console.info('AI generation completed', {
                userId,
                designId,
                generationId: Number(generation.id),
                kind,
                sourceDimensions: `${printReadiness.sourceWidth}x${printReadiness.sourceHeight}`,
                normalizedDimensions: `${printReadiness.width}x${printReadiness.height}`,
                creditState: 'charged_once'
            })
        })

        const design = await loadDesignForView(userId, designId)
        return { design: await serializeDesign(design), credits: { balance: await creditBalance(userId) }, idempotent: false }
    } catch (error) {
        if (artworkKey) await storage.remove(artworkKey)
        if (mockupKey) await storage.remove(mockupKey)
        const details = failureDetails(error, failureStage)
        if (processingStarted && attemptedPrompt && hash) {
            try {
                await recordFailedGeneration(userId, designId, kind, idempotencyKey, attemptedPrompt, hash, details.code)
            } catch (recordError: any) {
                if (!(recordError instanceof UniqueConstraintError)) console.error('Could not record AI failure', {
                    name: recordError?.name,
                    code: recordError?.code
                })
            }
        }
        const safeTechnical = error as any
        console.error('AI generation failed', {
            userId,
            designId,
            kind,
            failureStage,
            category: details.code,
            providerStatus: safeTechnical?.response?.status,
            creditState: 'not_charged'
        })
        throw new HttpError(details.status, details.message, undefined, details.recoverable)
    }
}

export function generateInitialArtwork(
    userId: number,
    designId: number,
    idempotencyKey: string,
    provider: AIImageProvider = getAIImageProvider(),
    storage: PrivateStorageService = privateStorage
) {
    return runGeneration(userId, designId, AIGenerationKind.INITIAL, idempotencyKey, undefined, provider, storage)
}

export function reviseArtwork(
    userId: number,
    designId: number,
    instructions: string,
    idempotencyKey: string,
    provider: AIImageProvider = getAIImageProvider(),
    storage: PrivateStorageService = privateStorage
) {
    return runGeneration(userId, designId, AIGenerationKind.REVISION, idempotencyKey, instructions.trim(), provider, storage)
}

const variantChangeStatuses = [
    AIDesignStatus.DRAFT,
    AIDesignStatus.FAILED,
    AIDesignStatus.GENERATED,
    AIDesignStatus.WAITING_FOR_USER,
    AIDesignStatus.REVISION_REQUESTED,
    AIDesignStatus.APPROVED
]

export async function changeAIDesignVariant(
    userId: number,
    designId: number,
    input: { productId: string; variantId: string },
    storage: PrivateStorageService = privateStorage
) {
    const current = await ownedDesign(userId, designId)
    if (!variantChangeStatuses.includes(current.status)) {
        throw new HttpError(409, 'The phone model cannot be changed after this design enters the cart or an order.')
    }
    const { product, variant } = await validateCatalogSelection(input.productId, input.variantId)
    const existingArtworkKey = current.currentArtworkKey
    let nextMockupKey: string | undefined
    let composed: Awaited<ReturnType<typeof composeMockupPreview>> | undefined

    try {
        if (existingArtworkKey) {
            const artwork = await storage.read(existingArtworkKey)
            composed = await composeMockupPreview(artwork, {
                phoneModel: variant.phoneModel,
                caseType: variant.caseType,
                productTitle: mockupProductTitle(product),
                mockupTemplateId: variant.mockupTemplateId
            })
            nextMockupKey = await storage.write('mockups', composed.bytes, 'png')
        }

        await getDatabase().transaction(async transaction => {
            const design = await ownedDesign(userId, designId, transaction.LOCK.UPDATE, transaction)
            if (!variantChangeStatuses.includes(design.status)) {
                throw new HttpError(409, 'The phone model cannot be changed after this design enters the cart or an order.')
            }
            if (design.currentArtworkKey !== existingArtworkKey) {
                throw new HttpError(409, 'The artwork changed while the preview was being prepared. Please try again.')
            }
            const validated = await validateCatalogSelection(input.productId, input.variantId, transaction)
            design.productId = validated.product.id
            design.productVariantId = validated.variant.id
            design.mockupTemplateId = composed?.templateId ?? mockupTemplateIdForVariant({
                phoneModel: validated.variant.phoneModel,
                caseType: validated.variant.caseType,
                productTitle: mockupProductTitle(validated.product),
                mockupTemplateId: validated.variant.mockupTemplateId
            })
            if (composed && nextMockupKey) {
                design.mockupKey = nextMockupKey
                design.mockupUrl = publicAssetUrl(designId, 'mockup')
                design.artworkPlacement = composed.placement
                design.mockupGeneratedAt = new Date()
                design.generationMetadata = {
                    ...((design.generationMetadata ?? {}) as Record<string, unknown>),
                    latestMockup: {
                        trigger: 'variant-change',
                        templateId: composed.templateId,
                        normalizedPhoneModel: composed.normalizedPhoneModel,
                        cameraTemplateId: composed.cameraTemplateId,
                        shellTemplateId: composed.shellTemplateId,
                        placementReview: composed.placementReview,
                        generatedAt: design.mockupGeneratedAt.toISOString()
                    }
                }
            }
            await design.save({ transaction })
        })
    } catch (error) {
        if (nextMockupKey) await storage.remove(nextMockupKey)
        throw error
    }

    return {
        design: await serializeDesign(await loadDesignForView(userId, designId)),
        credits: { balance: await creditBalance(userId) },
        creditConsumed: false
    }
}

export async function approveAIDesign(userId: number, designId: number) {
    await getDatabase().transaction(async transaction => {
        const design = await ownedDesign(userId, designId, transaction.LOCK.UPDATE, transaction)
        if (!design.currentArtworkKey || !design.mockupKey) throw new HttpError(409, 'Generate artwork before approving this design.')
        assertAIDesignTransition(design.status, AIDesignStatus.APPROVED)
        const before = design.status
        design.status = AIDesignStatus.APPROVED
        await design.save({ transaction })
        await CommerceAudit.create({
            actorUserId: userId,
            aiDesignId: design.id,
            action: AdminReviewAction.CUSTOMER_APPROVED,
            statusBefore: before,
            statusAfter: AIDesignStatus.APPROVED,
            metadata: { artworkStorageKey: design.currentArtworkKey }
        }, { transaction })
    })
    return serializeDesign(await loadDesignForView(userId, designId))
}

export async function listAIDesigns(userId: number) {
    const designs = await AIDesign.findAll({
        where: { userId },
        include: [Product, ProductVariant, UploadedImage, AIGeneration],
        order: [['createdAt', 'DESC']]
    })
    return Promise.all(designs.map(serializeDesign))
}

export async function getAIDesign(userId: number, designId: number) {
    return serializeDesign(await loadDesignForView(userId, designId))
}

export async function readOwnedUpload(userId: number, uploadId: number, storage: PrivateStorageService = privateStorage) {
    const upload = await UploadedImage.findOne({ where: { id: uploadId, userId } })
    if (!upload) throw new HttpError(404, 'Image not found.')
    return { bytes: await storage.read(upload.storageKey), mimeType: upload.mimeType }
}

export async function readOwnedDesignAsset(
    userId: number,
    designId: number,
    kind: 'original' | 'current' | 'mockup',
    storage: PrivateStorageService = privateStorage
) {
    const design = await ownedDesign(userId, designId)
    const key = kind === 'original' ? design.originalArtworkKey : kind === 'current' ? design.currentArtworkKey : design.mockupKey
    if (!key) throw new HttpError(404, 'Design image not found.')
    return { bytes: await storage.read(key), mimeType: mimeTypeForStorageKey(key) }
}

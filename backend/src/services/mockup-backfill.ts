import { Op } from 'sequelize'
import { getDatabase } from '../database/database'
import { AIDesign } from '../database/models/ai-design'
import { CartItem } from '../database/models/cart-item'
import { OrderItem } from '../database/models/order-item'
import { Product } from '../database/models/product'
import { ProductVariant } from '../database/models/product-variant'
import { privateStorage, type PrivateStorageService } from './ai-storage'
import { composeMockupPreview } from './mockup-templates'

export interface MockupBackfillResult {
    candidates: number
    regenerated: number
    skipped: number
    failed: number
}

export async function backfillRealisticMockupPreviews(storage: PrivateStorageService = privateStorage): Promise<MockupBackfillResult> {
    const designs = await AIDesign.findAll({
        where: {
            currentArtworkKey: { [Op.not]: null },
            mockupTemplateId: null
        } as any,
        include: [Product, ProductVariant],
        order: [['id', 'ASC']]
    })
    const result: MockupBackfillResult = { candidates: designs.length, regenerated: 0, skipped: 0, failed: 0 }

    for (const candidate of designs) {
        let generatedKey: string | undefined
        let committed = false
        try {
            if (!candidate.currentArtworkKey || !candidate.productVariant) {
                result.skipped += 1
                continue
            }
            const sourceArtworkKey = candidate.currentArtworkKey
            const previousMockupKey = candidate.mockupKey
            const artwork = await storage.read(sourceArtworkKey)
            const composed = await composeMockupPreview(artwork, {
                phoneModel: candidate.productVariant.phoneModel,
                caseType: candidate.productVariant.caseType,
                productTitle: [candidate.product?.displayName, candidate.product?.title].filter(Boolean).join(' · '),
                mockupTemplateId: candidate.productVariant.mockupTemplateId
            })
            generatedKey = await storage.write('mockups', composed.bytes, 'png')

            await getDatabase().transaction(async transaction => {
                const design = await AIDesign.findByPk(candidate.id, { transaction, lock: transaction.LOCK.UPDATE })
                if (!design || design.mockupTemplateId || design.currentArtworkKey !== sourceArtworkKey) return
                await design.update({
                    mockupKey: generatedKey,
                    mockupUrl: `/ai/assets/designs/${design.id}/mockup`,
                    mockupTemplateId: composed.templateId,
                    artworkPlacement: composed.placement,
                    mockupGeneratedAt: new Date(),
                    generationMetadata: {
                        ...((design.generationMetadata ?? {}) as Record<string, unknown>),
                        latestMockup: {
                            trigger: 'model-camera-backfill',
                            templateId: composed.templateId,
                            normalizedPhoneModel: composed.normalizedPhoneModel,
                            cameraTemplateId: composed.cameraTemplateId,
                            shellTemplateId: composed.shellTemplateId,
                            placementReview: composed.placementReview
                        }
                    }
                }, { transaction })
                if (previousMockupKey) {
                    await CartItem.update({ mockupStorageKey: generatedKey }, {
                        where: { aiDesignId: design.id, artworkStorageKey: sourceArtworkKey, mockupStorageKey: previousMockupKey }, transaction
                    })
                    await OrderItem.update({ mockupStorageKey: generatedKey }, {
                        where: { aiDesignId: design.id, artworkStorageKey: sourceArtworkKey, mockupStorageKey: previousMockupKey }, transaction
                    })
                }
                committed = true
            })
            if (committed) result.regenerated += 1
            else result.skipped += 1
        } catch (error: any) {
            result.failed += 1
            console.warn('realistic mockup backfill skipped a design', {
                designId: Number(candidate.id),
                name: error?.name,
                code: error?.code
            })
        } finally {
            if (generatedKey && !committed) await storage.remove(generatedKey)
        }
    }
    return result
}

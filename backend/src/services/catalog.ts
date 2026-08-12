import { Op, type Transaction } from 'sequelize'
import { getDatabase } from '../database/database'
import { ProductStatus } from '../database/models/model-enums'
import { Product } from '../database/models/product'
import { ProductVariant } from '../database/models/product-variant'
import { CommerceAudit } from '../database/models/commerce-audit'
import { CartItem } from '../database/models/cart-item'
import { OrderItem } from '../database/models/order-item'
import { AIDesign } from '../database/models/ai-design'
import { ShippingQuote } from '../database/models/shipping-quote'
import { CatalogProductDeletion } from '../database/models/catalog-product-deletion'
import HttpError from '../errors/http-error'
import { moneyToCents } from './pricing'
import { mockupPreviewStatusForVariant, mockupTemplateIdForVariant } from './mockup-templates'
import {
    getRawPrintifyProducts,
    isPhoneCaseProduct,
    mapPrintifyProduct,
    type RawPrintifyProduct
} from './printify'
import { customerCatalogImageUrl } from './catalog-media'

export interface CatalogSyncResult {
    productsCreated: number
    productsUpdated: number
    productsRestored: number
    variantsCreated: number
    variantsUpdated: number
    productsMarkedUnavailable: number
    variantsMarkedUnavailable: number
}

function printifyDate(value: string | undefined) {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
}

function markerCreatedAt(marker: CatalogProductDeletion) {
    const value = marker.get('createdAt')
    const date = value instanceof Date ? value : new Date(String(value ?? ''))
    return Number.isNaN(date.getTime()) ? undefined : date
}

function isExplicitProviderRepublish(rawProduct: RawPrintifyProduct, marker: CatalogProductDeletion, active: boolean) {
    const providerUpdatedAt = printifyDate(rawProduct.updated_at)
    const deletedAt = markerCreatedAt(marker)
    return active && Boolean(providerUpdatedAt && deletedAt && providerUpdatedAt.getTime() > deletedAt.getTime())
}

export async function synchronizePhoneCaseCatalog(
    rawProducts?: RawPrintifyProduct[],
    options: { markMissing?: boolean } = { markMissing: true }
): Promise<CatalogSyncResult> {
    const database = getDatabase()
    const sourceProducts = rawProducts ?? await getRawPrintifyProducts()
    const phoneCases = sourceProducts.filter(isPhoneCaseProduct)
    const synchronizedAt = new Date()
    const result: CatalogSyncResult = {
        productsCreated: 0,
        productsUpdated: 0,
        productsRestored: 0,
        variantsCreated: 0,
        variantsUpdated: 0,
        productsMarkedUnavailable: 0,
        variantsMarkedUnavailable: 0
    }

    await database.transaction(async transaction => {
        const synchronizedProductIds: string[] = []
        const deletionMarkers = await CatalogProductDeletion.findAll({ transaction })
        const deletionMarkersByExternalId = new Map(deletionMarkers.map(marker => [marker.externalProductId, marker]))

        for (const rawProduct of phoneCases) {
            const mapped = mapPrintifyProduct(rawProduct, { includeDisabled: true })
            if (!mapped.variants.length) continue
            const active = mapped.visible && mapped.variants.some(variant => variant.isEnabled && variant.available)
            const deletionMarker = deletionMarkersByExternalId.get(rawProduct.id)
            const providerRepublished = Boolean(deletionMarker && isExplicitProviderRepublish(rawProduct, deletionMarker, active))
            if (deletionMarker && !providerRepublished) continue
            synchronizedProductIds.push(mapped.printifyProductId)

            const productValues = {
                title: mapped.title,
                description: mapped.description,
                thumbnailUrl: mapped.image,
                images: mapped.images,
                tags: mapped.tags,
                blueprintId: mapped.blueprintId,
                printProviderId: mapped.printProviderId,
                printifyMetadata: {
                    source: 'printify',
                    variantCount: mapped.variants.length
                },
                status: active ? ProductStatus.ACTIVE : ProductStatus.ARCHIVED,
                visible: mapped.visible,
                printifyUpdatedAt: printifyDate(mapped.updatedAt),
                catalogSyncedAt: synchronizedAt
            }

            let product = await Product.findOne({
                where: { printifyProductId: mapped.printifyProductId },
                transaction
            })
            if (product) {
                await product.update({
                    ...productValues,
                    ...(providerRepublished ? {
                        isVisible: true,
                        isActive: active,
                        allowDirectPurchase: true,
                        allowAiCustomization: false,
                        aiCustomOnly: false
                    } : {})
                }, { transaction })
                result.productsUpdated += 1
            } else {
                product = await Product.create({
                    printifyProductId: mapped.printifyProductId,
                    isVisible: mapped.visible,
                    isActive: active,
                    allowDirectPurchase: true,
                    allowAiCustomization: false,
                    aiCustomOnly: false,
                    ...productValues
                }, { transaction })
                result.productsCreated += 1
            }

            const synchronizedVariantIds: string[] = []
            for (const variant of mapped.variants) {
                synchronizedVariantIds.push(variant.printifyVariantId)
                const variantValues = {
                    title: variant.title,
                    phoneModel: variant.phoneModel,
                    caseType: variant.caseType,
                    sku: variant.sku,
                    imageUrl: variant.image,
                    printifyMetadata: variant.metadata,
                    mockupTemplateId: mockupTemplateIdForVariant({
                        phoneModel: variant.phoneModel,
                        caseType: variant.caseType,
                        productTitle: mapped.title
                    }),
                    price: variant.price.toFixed(2),
                    currency: variant.currency,
                    available: variant.available,
                    isEnabled: variant.isEnabled,
                    ...(providerRepublished ? { isStorefrontEnabled: true } : {})
                }

                const existingVariant = await ProductVariant.findOne({
                    where: {
                        productId: product.id,
                        printifyVariantId: variant.printifyVariantId
                    },
                    transaction
                })
                if (existingVariant) {
                    await existingVariant.update(variantValues, { transaction })
                    result.variantsUpdated += 1
                } else {
                    await ProductVariant.create({
                        productId: product.id,
                        printifyVariantId: variant.printifyVariantId,
                        ...variantValues
                    }, { transaction })
                    result.variantsCreated += 1
                }
            }

            if (providerRepublished && deletionMarker) {
                await CommerceAudit.create({
                    action: 'product_republished',
                    statusBefore: deletionMarker.action,
                    statusAfter: active ? ProductStatus.ACTIVE : ProductStatus.ARCHIVED,
                    metadata: {
                        productId: Number(product.id),
                        externalProductId: mapped.printifyProductId,
                        deletionMarkerId: Number(deletionMarker.id),
                        providerUpdatedAt: mapped.updatedAt,
                        restoredAt: synchronizedAt.toISOString()
                    }
                }, { transaction })
                await deletionMarker.destroy({ transaction })
                result.productsRestored += 1
            }

            const [markedVariants] = await ProductVariant.update(
                { available: false, isEnabled: false },
                {
                    where: {
                        productId: product.id,
                        printifyVariantId: { [Op.notIn]: synchronizedVariantIds },
                        [Op.or]: [{ available: true }, { isEnabled: true }]
                    },
                    transaction
                }
            )
            result.variantsMarkedUnavailable += markedVariants
        }

        // An unexpectedly empty upstream response must never archive the whole catalog.
        if (options.markMissing !== false && sourceProducts.length > 0) {
            const missingWhere = synchronizedProductIds.length
                ? { printifyProductId: { [Op.notIn]: synchronizedProductIds } }
                : {}
            const missingProducts = await Product.findAll({ where: missingWhere, transaction })
            for (const product of missingProducts) {
                if (product.visible || product.status !== ProductStatus.ARCHIVED) {
                    await product.update({ visible: false, status: ProductStatus.ARCHIVED, catalogSyncedAt: synchronizedAt }, { transaction })
                    result.productsMarkedUnavailable += 1
                }
                const [markedVariants] = await ProductVariant.update(
                    { available: false, isEnabled: false },
                    { where: { productId: product.id, [Op.or]: [{ available: true }, { isEnabled: true }] }, transaction }
                )
                result.variantsMarkedUnavailable += markedVariants
            }
        }
    })

    return result
}

function effectivePrice(product: Product, variant: ProductVariant) {
    return product.retailPrice ?? variant.price
}

function imageSources(product: Product) {
    return (product.images ?? []).flatMap(image => {
        const value = image as { src?: unknown }
        return typeof value.src === 'string' ? [value.src] : []
    })
}

function truncateAtWord(value: string, maximum: number) {
    const normalized = value.replace(/\s+/g, ' ').trim()
    if (normalized.length <= maximum) return normalized
    const candidate = normalized.slice(0, maximum + 1)
    const boundary = candidate.lastIndexOf(' ')
    return `${candidate.slice(0, boundary > maximum * 0.65 ? boundary : maximum).trim()}…`
}

function fallbackDisplayName(title: string) {
    const firstSection = title.split(/\s+[|–—]\s+|\s+-\s+/)[0]?.trim() || title
    return truncateAtWord(firstSection, 72)
}

function customerSafeText(value: string) {
    return value
        .replace(/\bPrintify\b/gi, '')
        .replace(/\b(?:print|fulfillment) provider\b/gi, 'production service')
        .replace(/\bproduction partner\b/gi, 'production service')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim()
}

// Integration and API smoke-test products can exist in the connected Printify
// shop. Keep them available to administrators for deliberate cleanup, but never
// present internal-looking records as customer merchandise.
export function isCustomerFacingCatalogTitle(value: string) {
    const title = value.replace(/\s+/g, ' ').trim()
    if (!title) return false
    return ![
        /^api(?:\s|[-_])*(?:phase\s*\d+|cs(?:\s|[-_])*\d+)/i,
        /^phase\s*\d+\s*(?:test|fixture|api)\b/i,
        /^(?:integration|catalog|commerce)\s+test\b/i,
        /^(?:test|fixture|smoke)(?:\s|[-_])+(?:product|phone case|case)\b/i
    ].some(pattern => pattern.test(title))
}

function isCustomerFacingProduct(product: Product) {
    return isCustomerFacingCatalogTitle(product.displayName?.trim() || product.title)
}

function fallbackShortDescription(description?: string) {
    if (!description?.trim()) return 'Printed phone case available in supported models.'
    const normalized = description.replace(/\s+/g, ' ').trim()
    const firstSentence = normalized.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || normalized
    return truncateAtWord(firstSentence, 220)
}

export function serializeCatalogProduct(product: Product, admin = false) {
    const sourceVariants = admin
        ? [...(product.variants ?? [])]
        : [...(product.variants ?? [])].filter(variant => variant.isEnabled && variant.isStorefrontEnabled)
    const variants = sourceVariants
        .sort((left, right) => left.phoneModel.localeCompare(right.phoneModel) || left.caseType.localeCompare(right.caseType))
        .map(variant => {
            const priceValue = effectivePrice(product, variant)
            const priceCents = moneyToCents(priceValue)
            const mockupPreviewStatus = mockupPreviewStatusForVariant({
                phoneModel: variant.phoneModel,
                caseType: variant.caseType,
                productTitle: [product.displayName, product.title].filter(Boolean).join(' · '),
                mockupTemplateId: variant.mockupTemplateId
            })
            return {
                id: variant.printifyVariantId,
                title: variant.title,
                phoneModel: variant.phoneModel,
                caseType: variant.caseType,
                priceCents,
                price: priceCents / 100,
                currency: variant.currency,
                available: variant.available,
                isEnabled: variant.isEnabled && variant.isStorefrontEnabled,
                storefrontEnabled: variant.isStorefrontEnabled,
                image: customerCatalogImageUrl(variant.imageUrl),
                sku: variant.sku,
                mockupTemplateId: variant.mockupTemplateId,
                mockupPreviewStatus,
                ...(admin ? {
                    databaseId: Number(variant.id),
                    printifyVariantId: variant.printifyVariantId,
                    providerEnabled: variant.isEnabled,
                    metadata: variant.printifyMetadata
                } : {})
            }
        })
    const purchasable = variants.filter(variant => variant.isEnabled && variant.available)
    const prices = purchasable.map(variant => variant.price)
    const displayName = customerSafeText(product.displayName?.trim() || fallbackDisplayName(product.title))
    const shortDescription = customerSafeText(product.shortDescription?.trim() || fallbackShortDescription(product.description))
    const storefrontImage = customerCatalogImageUrl(product.storefrontImage?.trim() || product.thumbnailUrl)
    return {
        id: product.printifyProductId,
        title: displayName,
        displayName,
        description: shortDescription,
        shortDescription,
        storefrontCategory: product.storefrontCategory?.trim() || 'Phone case',
        image: storefrontImage,
        storefrontImage,
        images: imageSources(product).map(src => ({ src: customerCatalogImageUrl(src) })),
        price: prices.length ? Math.min(...prices) : null,
        currency: purchasable[0]?.currency ?? 'USD',
        variantsCount: variants.length,
        variants,
        phoneModels: [...new Set(purchasable.map(variant => variant.phoneModel))],
        caseTypes: [...new Set(purchasable.map(variant => variant.caseType))],
        visible: product.visible && product.isVisible,
        isVisible: product.isVisible,
        isActive: product.isActive,
        sortOrder: product.sortOrder,
        allowDirectPurchase: product.allowDirectPurchase,
        allowAiCustomization: product.allowAiCustomization,
        aiCustomOnly: product.aiCustomOnly,
        tags: product.tags ?? [],
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        ...(admin ? {
            databaseId: Number(product.id),
            printifyProductId: product.printifyProductId,
            printifyTitle: product.title,
            printifyDescription: product.description,
            printifyImage: product.thumbnailUrl,
            providerVisible: product.visible,
            providerStatus: product.status,
            retailPrice: product.retailPrice === undefined || product.retailPrice === null ? null : Number(product.retailPrice),
            blueprintId: product.blueprintId,
            printProviderId: product.printProviderId,
            catalogSyncedAt: product.catalogSyncedAt,
            printifyUpdatedAt: product.printifyUpdatedAt
        } : {})
    }
}

function publicProductWhere() {
    return {
        status: ProductStatus.ACTIVE,
        visible: true,
        isVisible: true,
        isActive: true
    }
}

export async function refreshConfiguredCatalog() {
    await synchronizePhoneCaseCatalog()
}

export async function listStorefrontProducts(options: { aiOnly?: boolean; refresh?: boolean } = {}) {
    if (options.refresh !== false) await refreshConfiguredCatalog()
    const products = await Product.findAll({
        where: {
            ...publicProductWhere(),
            ...(options.aiOnly ? { allowAiCustomization: true } : {})
        },
        include: [ProductVariant],
        order: [['sortOrder', 'ASC'], ['id', 'ASC']]
    })
    return products
        .filter(isCustomerFacingProduct)
        .filter(product => !options.aiOnly || Boolean(
            product.blueprintId && /^\d+$/.test(product.blueprintId)
            && product.printProviderId && /^\d+$/.test(product.printProviderId)
        ))
        .map(product => serializeCatalogProduct(product))
        .map(product => {
            if (!options.aiOnly) return product
            const variants = product.variants.filter(variant => Boolean(variant.mockupTemplateId))
            const purchasable = variants.filter(variant => variant.isEnabled && variant.available)
            return {
                ...product,
                variants,
                variantsCount: variants.length,
                phoneModels: [...new Set(purchasable.map(variant => variant.phoneModel))],
                caseTypes: [...new Set(purchasable.map(variant => variant.caseType))],
                price: purchasable.length ? Math.min(...purchasable.map(variant => variant.price)) : null
            }
        })
        .filter(product => product.variants.some(variant => variant.isEnabled && variant.available))
}

export async function getStorefrontProduct(printifyProductId: string) {
    const rawProducts = await getRawPrintifyProducts()
    const raw = rawProducts.find(product => product.id === printifyProductId)
    if (raw) await synchronizePhoneCaseCatalog([raw], { markMissing: false })
    const product = await Product.findOne({
        where: { printifyProductId, ...publicProductWhere() },
        include: [ProductVariant]
    })
    if (!product || !isCustomerFacingProduct(product)) throw new HttpError(404, 'This phone case is not currently available.')
    const serialized = serializeCatalogProduct(product)
    if (!serialized.variants.some(variant => variant.isEnabled && variant.available)) {
        throw new HttpError(404, 'This phone case has no available options.')
    }
    return serialized
}

export async function listAdminProducts(options: { refresh?: boolean } = {}) {
    if (options.refresh) {
        try {
            await synchronizePhoneCaseCatalog(undefined, { markMissing: false })
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.warn(`Printify catalog refresh failed while loading admin products; serving saved catalog: ${message}`)
        }
    }
    const [products, deletedMarkers] = await Promise.all([
        Product.findAll({ include: [ProductVariant], order: [['sortOrder', 'ASC'], ['id', 'ASC']] }),
        CatalogProductDeletion.findAll({ where: { action: 'deleted' }, attributes: ['originalProductId'] })
    ])
    const deletedProductIds = new Set(deletedMarkers.map(marker => Number(marker.originalProductId)))
    return products.filter(product => !deletedProductIds.has(Number(product.id))).map(product => serializeCatalogProduct(product, true))
}

export async function getAdminProduct(productId: number) {
    const product = await Product.findByPk(productId, { include: [ProductVariant] })
    if (!product) throw new HttpError(404, 'Product not found.')
    return serializeCatalogProduct(product, true)
}

export async function updateAdminProduct(productId: number, input: {
    displayName?: string | null
    shortDescription?: string | null
    storefrontCategory?: string | null
    storefrontImage?: string | null
    isVisible: boolean
    isActive: boolean
    sortOrder: number
    allowDirectPurchase: boolean
    allowAiCustomization: boolean
    aiCustomOnly: boolean
    retailPrice?: number | null
    blueprintId?: string | null
    printProviderId?: string | null
    variants?: Array<{ id: number; enabled: boolean }>
}, adminUserId?: number) {
    if (!input.allowDirectPurchase && !input.allowAiCustomization) {
        throw new HttpError(422, 'Enable direct purchasing, AI customization, or both.')
    }
    if (input.aiCustomOnly && (input.allowDirectPurchase || !input.allowAiCustomization)) {
        throw new HttpError(422, 'AI-custom-only products must disable direct purchasing and enable AI customization.')
    }
    const product = await Product.findByPk(productId, { include: [ProductVariant] })
    if (!product) throw new HttpError(404, 'Product not found.')
    const before = {
        isVisible: product.isVisible, isActive: product.isActive, allowDirectPurchase: product.allowDirectPurchase,
        allowAiCustomization: product.allowAiCustomization, aiCustomOnly: product.aiCustomOnly,
        variants: (product.variants ?? []).map(variant => ({ id: Number(variant.id), enabled: variant.isStorefrontEnabled }))
    }
    await getDatabase().transaction(async transaction => {
        await product.update({
            displayName: input.displayName?.trim() || null,
            shortDescription: input.shortDescription?.trim() || null,
            storefrontCategory: input.storefrontCategory?.trim() || null,
            storefrontImage: input.storefrontImage?.trim() || null,
            isVisible: input.isVisible,
            isActive: input.isActive,
            sortOrder: input.sortOrder,
            allowDirectPurchase: input.allowDirectPurchase,
            allowAiCustomization: input.allowAiCustomization,
            aiCustomOnly: input.aiCustomOnly,
            retailPrice: input.retailPrice === null || input.retailPrice === undefined ? null : input.retailPrice.toFixed(2),
            blueprintId: input.blueprintId?.trim() || null,
            printProviderId: input.printProviderId?.trim() || null
        }, { transaction })
        for (const variantInput of input.variants ?? []) {
            const variant = (product.variants ?? []).find(value => Number(value.id) === variantInput.id)
            if (!variant) throw new HttpError(422, 'A selected variant does not belong to this product.')
            await variant.update({ isStorefrontEnabled: variantInput.enabled }, { transaction })
        }
        if (adminUserId) {
            await CommerceAudit.create({
                actorUserId: adminUserId,
                action: 'product_settings_changed',
                statusBefore: before.isVisible && before.isActive ? 'active' : 'disabled',
                statusAfter: input.isVisible && input.isActive ? 'active' : 'disabled',
                metadata: {
                    productId,
                    printifyProductId: product.printifyProductId,
                    before,
                    after: {
                        isVisible: input.isVisible, isActive: input.isActive, allowDirectPurchase: input.allowDirectPurchase,
                        allowAiCustomization: input.allowAiCustomization, aiCustomOnly: input.aiCustomOnly,
                        variants: input.variants ?? []
                    }
                }
            }, { transaction })
        }
    })
    return getAdminProduct(productId)
}

export interface ProductReferenceSummary {
    orderItems: number
    cartItems: number
    savedDesigns: number
    shippingQuotes: number
    auditRecords: number
    total: number
}

export interface ProductDeletionPlan {
    productId: number
    productName: string
    action: 'delete' | 'archive'
    references: ProductReferenceSummary
    message: string
    alreadyProcessed?: 'deleted' | 'archived'
    archivedWithHistory?: boolean
}

function jsonContainsProduct(value: unknown, productId: number, externalProductId: string, variantIds: Set<number>): boolean {
    if (Array.isArray(value)) return value.some(item => jsonContainsProduct(item, productId, externalProductId, variantIds))
    if (!value || typeof value !== 'object') return false
    return Object.entries(value as Record<string, unknown>).some(([key, item]) => {
        const normalizedKey = key.toLowerCase()
        if (normalizedKey.includes('productid') && (String(item) === String(productId) || String(item) === externalProductId)) return true
        if (normalizedKey.includes('variantid') && variantIds.has(Number(item))) return true
        return jsonContainsProduct(item, productId, externalProductId, variantIds)
    })
}

async function analyzeProductReferences(product: Product, transaction?: Transaction): Promise<ProductReferenceSummary> {
    const variants = product.variants ?? await ProductVariant.findAll({ where: { productId: product.id }, transaction })
    const variantIds = new Set(variants.map(variant => Number(variant.id)))
    const [orderItems, cartItems, savedDesigns, quotes, audits] = await Promise.all([
        OrderItem.count({ where: { productId: product.id }, transaction }),
        CartItem.count({ where: { productId: product.id }, transaction }),
        AIDesign.count({ where: { productId: product.id }, transaction }),
        ShippingQuote.findAll({ attributes: ['itemSnapshot'], transaction }),
        CommerceAudit.findAll({ attributes: ['metadata'], transaction })
    ])
    const shippingQuotes = quotes.filter(quote => jsonContainsProduct(quote.itemSnapshot, Number(product.id), product.printifyProductId, variantIds)).length
    const auditRecords = audits.filter(audit => jsonContainsProduct(audit.metadata, Number(product.id), product.printifyProductId, variantIds)).length
    return {
        orderItems,
        cartItems,
        savedDesigns,
        shippingQuotes,
        auditRecords,
        total: orderItems + cartItems + savedDesigns + shippingQuotes + auditRecords
    }
}

export async function getAdminProductDeletionPlan(productId: number): Promise<ProductDeletionPlan> {
    const existingMarker = await CatalogProductDeletion.findOne({ where: { originalProductId: productId } })
    if (existingMarker) {
        if (existingMarker.action === 'archived') {
            const archivedProduct = await Product.findByPk(productId, { include: [ProductVariant] })
            const references = archivedProduct
                ? await analyzeProductReferences(archivedProduct)
                : { orderItems: 0, cartItems: 0, savedDesigns: 0, shippingQuotes: 0, auditRecords: 0, total: 0 }
            return {
                productId,
                productName: existingMarker.productName,
                action: 'delete',
                references,
                archivedWithHistory: true,
                message: 'This archived product can be permanently removed from catalog management. Existing order, payment, design, and fulfillment history will remain preserved.'
            }
        }
        return {
            productId,
            productName: existingMarker.productName,
            action: 'delete',
            references: { orderItems: 0, cartItems: 0, savedDesigns: 0, shippingQuotes: 0, auditRecords: 0, total: 0 },
            message: `This product was already ${existingMarker.action}.`,
            alreadyProcessed: existingMarker.action
        }
    }
    const product = await Product.findByPk(productId, { include: [ProductVariant] })
    if (!product) {
        throw new HttpError(404, 'Product not found.')
    }
    const references = await analyzeProductReferences(product)
    const action = references.total > 0 ? 'archive' : 'delete'
    return {
        productId,
        productName: product.displayName?.trim() || product.title,
        action,
        references,
        message: action === 'archive'
            ? 'This product has existing order, design, cart, shipping, or audit history. It will be removed from the storefront while historical records remain available.'
            : 'This product has no commerce or design history. It and its unused variants can be permanently removed.'
    }
}

export async function deleteOrArchiveAdminProduct(productId: number, adminUserId: number, confirmation: string) {
    return getDatabase().transaction(async transaction => {
        const product = await Product.findByPk(productId, {
            include: [ProductVariant],
            transaction,
            lock: transaction.LOCK.UPDATE
        })
        const existingMarker = await CatalogProductDeletion.findOne({ where: { originalProductId: productId }, transaction })
        if (existingMarker?.action === 'deleted') return { success: true, action: existingMarker.action, alreadyProcessed: true }
        if (existingMarker?.action === 'archived') {
            const productName = existingMarker.productName
            if (confirmation !== 'DELETE' && confirmation !== productName) {
                throw new HttpError(422, 'Type the product name or DELETE to confirm permanent removal from the archived catalog.')
            }
            const references = product ? await analyzeProductReferences(product, transaction) : {
                orderItems: 0, cartItems: 0, savedDesigns: 0, shippingQuotes: 0, auditRecords: 0, total: 0
            }
            await existingMarker.update({
                action: 'deleted',
                actorUserId: adminUserId,
                reason: 'Archived product permanently removed from catalog management; historical records preserved'
            }, { transaction })
            if (product) {
                await product.update({
                    status: ProductStatus.ARCHIVED,
                    visible: false,
                    isVisible: false,
                    isActive: false,
                    allowDirectPurchase: false,
                    allowAiCustomization: false,
                    aiCustomOnly: false
                }, { transaction })
                await ProductVariant.update({ isStorefrontEnabled: false }, { where: { productId: product.id }, transaction })
            }
            await CommerceAudit.create({
                actorUserId: adminUserId,
                action: 'product_deleted',
                statusBefore: 'archived',
                statusAfter: 'deleted',
                metadata: {
                    productId,
                    productName,
                    externalProductId: existingMarker.externalProductId,
                    references,
                    historicalCatalogRecordRetained: Boolean(product),
                    occurredAt: new Date().toISOString()
                }
            }, { transaction })
            return { success: true, action: 'deleted' as const, historyPreserved: true, references }
        }
        if (!product) {
            throw new HttpError(404, 'Product not found.')
        }

        const references = await analyzeProductReferences(product, transaction)
        const productName = product.displayName?.trim() || product.title
        const action = references.total > 0 ? 'archived' : 'deleted'
        if (action === 'deleted' && confirmation !== 'DELETE' && confirmation !== productName) {
            throw new HttpError(422, 'Type the product name or DELETE to confirm permanent deletion.')
        }
        if (action === 'archived' && confirmation !== 'ARCHIVE') {
            throw new HttpError(422, 'Confirm archival before removing this product from the storefront.')
        }

        const reason = action === 'archived' ? 'Product has historical references' : 'Unused product permanently deleted'
        await CatalogProductDeletion.create({
            originalProductId: Number(product.id),
            externalProductId: product.printifyProductId,
            productName,
            action,
            actorUserId: adminUserId,
            reason
        }, { transaction })
        await CommerceAudit.create({
            actorUserId: adminUserId,
            action: action === 'archived' ? 'product_archived' : 'product_deleted',
            statusBefore: product.status,
            statusAfter: action,
            metadata: {
                productId: Number(product.id),
                productName,
                externalProductId: product.printifyProductId,
                references,
                occurredAt: new Date().toISOString()
            }
        }, { transaction })

        if (action === 'archived') {
            await product.update({
                status: ProductStatus.ARCHIVED,
                visible: false,
                isVisible: false,
                isActive: false,
                allowDirectPurchase: false,
                allowAiCustomization: false,
                aiCustomOnly: false
            }, { transaction })
            await ProductVariant.update({ isStorefrontEnabled: false }, { where: { productId: product.id }, transaction })
        } else {
            await ProductVariant.destroy({ where: { productId: product.id }, transaction })
            await product.destroy({ transaction })
        }
        return { success: true, action, ...(action === 'archived' ? { reason } : {}), references }
    })
}

import type { Transaction } from 'sequelize'
import { Cart } from '../database/models/cart'
import { CartItem } from '../database/models/cart-item'
import { createHash } from 'crypto'
import { AIDesign } from '../database/models/ai-design'
import { CommerceAudit } from '../database/models/commerce-audit'
import { AIDesignStatus, AdminReviewAction, CartStatus, CommerceItemType, ProductStatus } from '../database/models/model-enums'
import { Product } from '../database/models/product'
import { ProductVariant } from '../database/models/product-variant'
import { User } from '../database/models/user'
import { getDatabase } from '../database/database'
import HttpError from '../errors/http-error'
import { synchronizePhoneCaseCatalog } from './catalog'
import { getRawPrintifyProduct, selectPrintifyVariant } from './printify'
import { privateStorage, type PrivateStorageService } from './ai-storage'
import { assertAIDesignTransition } from './ai-designs'
import { calculatePricing, centsToMoney, moneyToCents } from './pricing'
import { customerCatalogImageUrl } from './catalog-media'

export const MAX_CART_ITEM_QUANTITY = 10

export interface CartViewItem {
    id: number
    productId: string
    variantId: string
    quantity: number
    unitPrice: number
    unitPriceCents: number
    lineTotal: number
    lineTotalCents: number
    currency: string
    productTitle: string
    variantTitle: string
    phoneModel: string
    caseType: string
    image?: string
    itemType: CommerceItemType
    aiDesignId?: number
    basePrice: number
    artwork?: string
    mockup?: string
}

export interface CartView {
    id: number
    status: CartStatus
    items: CartViewItem[]
    itemCount: number
    currency: string
    subtotal: number
    subtotalCents: number
}

function lineTotal(unitPrice: string | number, quantity: number) {
    return centsToMoney(moneyToCents(unitPrice) * quantity)
}

async function activeCart(userId: number, transaction?: Transaction, lock = false) {
    return Cart.findOne({
        where: { userId, status: CartStatus.ACTIVE },
        transaction,
        ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {})
    })
}

export async function getOrCreateActiveCart(userId: number, transaction?: Transaction) {
    if (transaction) {
        await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE })
        const existing = await activeCart(userId, transaction, true)
        return existing ?? Cart.create({ userId, status: CartStatus.ACTIVE }, { transaction })
    }

    return getDatabase().transaction(inner => getOrCreateActiveCart(userId, inner))
}

async function loadCart(cartId: number, transaction?: Transaction): Promise<Cart> {
    const cart = await Cart.findByPk(cartId, {
        include: [{
            model: CartItem,
            include: [Product, ProductVariant, AIDesign]
        }],
        transaction
    })
    if (!cart) throw new HttpError(404, 'Cart not found.')
    return cart
}

export function serializeCart(cart: Cart): CartView {
    const items = [...(cart.items ?? [])]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(item => ({
        id: Number(item.id),
        productId: item.product?.printifyProductId ?? String(item.productId),
        variantId: item.productVariant?.printifyVariantId ?? String(item.productVariantId),
        quantity: item.quantity,
        unitPrice: centsToMoney(moneyToCents(item.unitPrice)),
        unitPriceCents: moneyToCents(item.unitPrice),
        lineTotal: lineTotal(item.unitPrice, item.quantity),
        lineTotalCents: moneyToCents(item.unitPrice) * item.quantity,
        currency: item.currency,
        productTitle: item.productTitle,
        variantTitle: item.variantTitle,
        phoneModel: item.phoneModel,
        caseType: item.caseType,
        image: customerCatalogImageUrl(item.imageUrl),
        itemType: item.itemType,
        aiDesignId: item.aiDesignId ? Number(item.aiDesignId) : undefined,
        basePrice: centsToMoney(moneyToCents(item.basePrice)),
        artwork: item.aiDesignId ? `/ai/assets/designs/${item.aiDesignId}/current` : undefined,
        mockup: item.aiDesignId ? `/ai/assets/designs/${item.aiDesignId}/mockup` : undefined
        }))
    const currencies = new Set(items.map(item => item.currency))
    const currency = currencies.values().next().value ?? 'USD'
    const pricing = calculatePricing(items, 0, currency)

    return {
        id: Number(cart.id),
        status: cart.status,
        items,
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
        currency,
        subtotal: pricing.subtotal,
        subtotalCents: pricing.subtotalCents
    }
}

export async function getCart(userId: number) {
    const cart = await getOrCreateActiveCart(userId)
    return serializeCart(await loadCart(Number(cart.id)))
}

export async function validatedCatalogVariant(printifyProductId: string, printifyVariantId: string) {
    const rawProduct = await getRawPrintifyProduct(printifyProductId)
    const selected = selectPrintifyVariant(rawProduct, printifyVariantId)
    await synchronizePhoneCaseCatalog([rawProduct], { markMissing: false })

    const product = await Product.findOne({ where: { printifyProductId } })
    if (!product) throw new HttpError(409, 'This product is not available in the store catalog yet.')
    if (product.status !== ProductStatus.ACTIVE || !product.visible || !product.isVisible || !product.isActive) {
        throw new HttpError(409, 'This product is not currently available for purchase.')
    }
    if (!product.allowDirectPurchase || product.aiCustomOnly) {
        throw new HttpError(409, 'This product must be customized before it can be purchased.')
    }
    const variant = await ProductVariant.findOne({
        where: { productId: product.id, printifyVariantId }
    })
    if (!variant) throw new HttpError(409, 'This phone case option is not available in the store catalog yet.')
    if (!variant.isEnabled || !variant.isStorefrontEnabled || !variant.available) {
        throw new HttpError(409, 'This phone case option is not currently available.')
    }

    if (product.retailPrice !== undefined && product.retailPrice !== null) {
        const price = Number(product.retailPrice)
        selected.variant.price = price
        selected.variant.priceCents = moneyToCents(product.retailPrice)
    }

    return { ...selected, databaseProduct: product, databaseVariant: variant }
}

export async function addCartItem(userId: number, input: { productId: string; variantId: string; quantity: number }) {
    const selected = await validatedCatalogVariant(input.productId, input.variantId)

    const cartId = await getDatabase().transaction(async transaction => {
        const cart = await getOrCreateActiveCart(userId, transaction)
        const existing = await CartItem.findOne({
            where: { cartId: cart.id, productVariantId: selected.databaseVariant.id, aiDesignId: null },
            transaction,
            lock: transaction.LOCK.UPDATE
        })
        const nextQuantity = (existing?.quantity ?? 0) + input.quantity
        if (nextQuantity > MAX_CART_ITEM_QUANTITY) {
            throw new HttpError(422, `You can add up to ${MAX_CART_ITEM_QUANTITY} of one phone case option.`)
        }

        const snapshot = {
            productId: selected.databaseProduct.id,
            productVariantId: selected.databaseVariant.id,
            quantity: nextQuantity,
            unitPrice: selected.variant.price.toFixed(2),
            basePrice: selected.variant.price.toFixed(2),
            itemType: CommerceItemType.STANDARD,
            currency: selected.variant.currency,
            productTitle: selected.product.title,
            variantTitle: selected.variant.title,
            phoneModel: selected.variant.phoneModel,
            caseType: selected.variant.caseType,
            imageUrl: selected.variant.image ?? selected.product.image
        }

        if (existing) await existing.update(snapshot, { transaction })
        else await CartItem.create({ cartId: cart.id, ...snapshot }, { transaction })
        return Number(cart.id)
    })

    return serializeCart(await loadCart(cartId))
}

export async function addAIDesignCartItem(
    userId: number,
    designId: number,
    quantity = 1,
    storage: PrivateStorageService = privateStorage
) {
    const cartId = await getDatabase().transaction(async transaction => {
        const design = await AIDesign.findOne({
            where: { id: designId, userId },
            include: [Product, ProductVariant],
            transaction,
            lock: transaction.LOCK.UPDATE
        })
        if (!design) throw new HttpError(404, 'Design not found.')
        if (design.status === AIDesignStatus.ADDED_TO_CART) {
            const cart = await getOrCreateActiveCart(userId, transaction)
            const existing = await CartItem.findOne({ where: { cartId: cart.id, aiDesignId: design.id }, transaction, lock: transaction.LOCK.UPDATE })
            if (existing) return Number(cart.id)
            throw new HttpError(409, 'This design is already reserved for a cart or order.')
        }
        if (design.status !== AIDesignStatus.APPROVED || !design.currentArtworkKey || !design.mockupKey) {
            throw new HttpError(409, 'Approve the final generated artwork before adding this design to your cart.')
        }
        const product = design.product
        const variant = design.productVariant
        if (!product || !variant || Number(variant.productId) !== Number(product.id)
            || product.status !== ProductStatus.ACTIVE || !product.visible || !product.isVisible || !product.isActive
            || !product.allowAiCustomization || !variant.isEnabled || !variant.isStorefrontEnabled || !variant.available) {
            throw new HttpError(409, 'The selected phone case option is no longer available.')
        }
        if (quantity < 1 || quantity > MAX_CART_ITEM_QUANTITY) throw new HttpError(422, 'Choose a valid quantity.')

        const cart = await getOrCreateActiveCart(userId, transaction)
        const existing = await CartItem.findOne({ where: { cartId: cart.id, aiDesignId: design.id }, transaction, lock: transaction.LOCK.UPDATE })
        if (existing) return Number(cart.id)

        const artwork = await storage.read(design.currentArtworkKey)
        const checksum = createHash('sha256').update(artwork).digest('hex')
        const basePrice = centsToMoney(moneyToCents(product.retailPrice ?? variant.price))
        await CartItem.create({
            cartId: cart.id,
            productId: product.id,
            productVariantId: variant.id,
            aiDesignId: design.id,
            itemType: CommerceItemType.AI_CUSTOM,
            quantity,
            basePrice: basePrice.toFixed(2),
            unitPrice: basePrice.toFixed(2),
            currency: variant.currency,
            productTitle: product.title,
            variantTitle: variant.title,
            phoneModel: variant.phoneModel,
            caseType: variant.caseType,
            imageUrl: variant.imageUrl ?? product.thumbnailUrl,
            artworkStorageKey: design.currentArtworkKey,
            mockupStorageKey: design.mockupKey,
            artworkChecksumSha256: checksum
        }, { transaction })
        assertAIDesignTransition(design.status, AIDesignStatus.ADDED_TO_CART)
        await design.update({ status: AIDesignStatus.ADDED_TO_CART }, { transaction })
        await CommerceAudit.create({
            actorUserId: userId,
            aiDesignId: design.id,
            action: AdminReviewAction.ADDED_TO_CART,
            statusBefore: AIDesignStatus.APPROVED,
            statusAfter: AIDesignStatus.ADDED_TO_CART,
            metadata: { quantity, unitPrice: basePrice, artworkChecksumSha256: checksum }
        }, { transaction })
        return Number(cart.id)
    })
    return serializeCart(await loadCart(cartId))
}

async function ownedCartItem(userId: number, itemId: number) {
    const item = await CartItem.findByPk(itemId, {
        include: [
            { model: Cart, where: { userId, status: CartStatus.ACTIVE }, required: true },
            Product,
            ProductVariant
        ]
    })
    if (!item?.cart || !item.product || !item.productVariant) {
        throw new HttpError(404, 'Cart item not found.')
    }
    return item
}

export async function updateCartItem(userId: number, itemId: number, quantity: number) {
    const current = await ownedCartItem(userId, itemId)
    if (current.itemType === CommerceItemType.AI_CUSTOM) {
        await current.update({ quantity })
        return serializeCart(await loadCart(Number(current.cartId)))
    }
    const selected = await validatedCatalogVariant(current.product.printifyProductId, current.productVariant.printifyVariantId)

    await getDatabase().transaction(async transaction => {
        const item = await CartItem.findByPk(itemId, { transaction, lock: transaction.LOCK.UPDATE })
        if (!item || Number(item.cartId) !== Number(current.cartId)) throw new HttpError(404, 'Cart item not found.')
        await item.update({
            quantity,
            unitPrice: selected.variant.price.toFixed(2),
            currency: selected.variant.currency,
            productTitle: selected.product.title,
            variantTitle: selected.variant.title,
            phoneModel: selected.variant.phoneModel,
            caseType: selected.variant.caseType,
            imageUrl: selected.variant.image ?? selected.product.image
        }, { transaction })
    })
    return serializeCart(await loadCart(Number(current.cartId)))
}

export async function removeCartItem(userId: number, itemId: number) {
    const item = await ownedCartItem(userId, itemId)
    await getDatabase().transaction(async transaction => {
        if (item.aiDesignId) {
            const design = await AIDesign.findOne({ where: { id: item.aiDesignId, userId }, transaction, lock: transaction.LOCK.UPDATE })
            if (design?.status === AIDesignStatus.ADDED_TO_CART) {
                assertAIDesignTransition(design.status, AIDesignStatus.APPROVED)
                await design.update({ status: AIDesignStatus.APPROVED }, { transaction })
            }
        }
        await CartItem.destroy({ where: { id: item.id }, transaction })
    })
    return serializeCart(await loadCart(Number(item.cartId)))
}

export async function clearCart(userId: number) {
    const cart = await getOrCreateActiveCart(userId)
    await getDatabase().transaction(async transaction => {
        const items = await CartItem.findAll({ where: { cartId: cart.id }, transaction, lock: transaction.LOCK.UPDATE })
        const designIds = items.flatMap(item => item.aiDesignId ? [Number(item.aiDesignId)] : [])
        if (designIds.length) {
            const designs = await AIDesign.findAll({ where: { id: designIds, userId }, transaction, lock: transaction.LOCK.UPDATE })
            for (const design of designs) {
                if (design.status === AIDesignStatus.ADDED_TO_CART) await design.update({ status: AIDesignStatus.APPROVED }, { transaction })
            }
        }
        await CartItem.destroy({ where: { cartId: cart.id }, transaction })
    })
    return serializeCart(await loadCart(Number(cart.id)))
}

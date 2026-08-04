import { createHash, randomBytes } from 'crypto'
import { Op } from 'sequelize'
import { CartItem } from '../database/models/cart-item'
import { Address } from '../database/models/address'
import { AdminNote } from '../database/models/admin-note'
import { AIDesign } from '../database/models/ai-design'
import { AdminNoteVisibility, AIDesignStatus, CommerceItemType, FulfillmentStatus, OrderItemStatus, OrderStatus, PaymentStatus, ProductStatus } from '../database/models/model-enums'
import { Order } from '../database/models/order'
import { OrderItem } from '../database/models/order-item'
import { Payment } from '../database/models/payment'
import { Product } from '../database/models/product'
import { ProductVariant } from '../database/models/product-variant'
import { getDatabase } from '../database/database'
import HttpError from '../errors/http-error'
import { getCart, getOrCreateActiveCart, MAX_CART_ITEM_QUANTITY, validatedCatalogVariant, type CartViewItem } from './cart'
import { mimeTypeForStorageKey, privateStorage, type PrivateStorageService } from './ai-storage'
import { calculatePricing, centsToDecimal, centsToMoney, moneyToCents } from './pricing'
import { customerCatalogImageUrl } from './catalog-media'
import {
    getOwnedShippingSelection,
    normalizeShippingAddress,
    shippingAddressHash,
    shippingLineHash,
    type ShippingAddressInput,
    type ShippingQuoteLine
} from './shipping'

export type { ShippingAddressInput } from './shipping'

function orderNumber() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    return `CS-${date}-${randomBytes(5).toString('hex').toUpperCase()}`
}

function snapshotHash(items: CartViewItem[]) {
    const value = items
        .map(item => `${item.id}:${item.productId}:${item.variantId}:${item.quantity}:${item.unitPrice.toFixed(2)}`)
        .sort()
        .join('|')
    return createHash('sha256').update(value).digest('hex')
}

async function reusableAddress(userId: number, shipping: ShippingAddressInput, transaction: any) {
    const [address] = await Address.findOrCreate({
        where: {
            userId,
            firstName: shipping.firstName,
            lastName: shipping.lastName,
            email: shipping.email,
            phone: shipping.phone,
            line1: shipping.address1,
            line2: shipping.address2 ?? null,
            city: shipping.city,
            state: shipping.state ?? null,
            postalCode: shipping.postalCode,
            countryCode: shipping.countryCode
        },
        defaults: {
            userId,
            firstName: shipping.firstName,
            lastName: shipping.lastName,
            email: shipping.email,
            recipientName: `${shipping.firstName} ${shipping.lastName}`,
            phone: shipping.phone,
            line1: shipping.address1,
            line2: shipping.address2,
            city: shipping.city,
            state: shipping.state,
            postalCode: shipping.postalCode,
            countryCode: shipping.countryCode
        },
        transaction
    })
    return address
}

const orderIncludes = [{
    model: OrderItem,
    include: [{
        model: AdminNote,
        where: { visibility: AdminNoteVisibility.USER },
        required: false
    }]
}, Payment]

export function serializeOrder(order: Order) {
    const items = (order.items ?? []).map(item => ({
        id: Number(item.id),
        productId: Number(item.productId),
        variantId: Number(item.productVariantId),
        productTitle: item.productTitle,
        variantTitle: item.variantTitle,
        phoneModel: item.phoneModel,
        caseType: item.caseType,
        image: customerCatalogImageUrl(item.imageUrl),
        quantity: item.quantity,
        unitPrice: centsToMoney(moneyToCents(item.unitPrice)),
        unitPriceCents: moneyToCents(item.unitPrice),
        lineTotal: centsToMoney(moneyToCents(item.totalPrice)),
        lineTotalCents: moneyToCents(item.totalPrice),
        currency: item.currency,
        itemType: item.itemType,
        status: item.status,
        aiDesignId: item.aiDesignId ? Number(item.aiDesignId) : undefined,
        basePrice: centsToMoney(moneyToCents(item.basePrice)),
        artwork: item.artworkStorageKey ? `/orders/${order.id}/items/${item.id}/assets/artwork` : undefined,
        mockup: item.mockupStorageKey ? `/orders/${order.id}/items/${item.id}/assets/mockup` : undefined,
        reviewMessage: [...(item.adminNotes ?? [])].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.note
    }))
    const fulfillmentStatuses = items.map(item => item.status)
    const fulfillmentStarted = fulfillmentStatuses.filter(status => [
        OrderItemStatus.SENT_TO_PRINTIFY,
        OrderItemStatus.IN_PRODUCTION,
        OrderItemStatus.SHIPPED,
        OrderItemStatus.DELIVERED
    ].includes(status as OrderItemStatus)).length
    return {
        id: Number(order.id),
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        currency: order.currency,
        subtotal: centsToMoney(moneyToCents(order.subtotal)),
        subtotalCents: moneyToCents(order.subtotal),
        shippingAmount: centsToMoney(moneyToCents(order.shippingAmount)),
        shippingAmountCents: moneyToCents(order.shippingAmount),
        taxAmount: centsToMoney(moneyToCents(order.taxAmount)),
        taxAmountCents: moneyToCents(order.taxAmount),
        total: centsToMoney(moneyToCents(order.totalAmount)),
        totalCents: moneyToCents(order.totalAmount),
        shippingMethod: order.shippingMethodId ? {
            id: order.shippingMethodId,
            name: order.shippingMethodName,
            shippingMethod: order.shippingMethodCode
        } : undefined,
        paypalOrderId: order.paypalOrderId,
        productionStarted: Boolean(order.printifyOrderId),
        fulfillmentStatus: order.fulfillmentStatus,
        fulfillmentSummary: {
            totalItems: items.length,
            awaitingReview: fulfillmentStatuses.filter(status => [
                OrderItemStatus.PENDING_DESIGN_REVIEW,
                OrderItemStatus.CHANGES_REQUESTED
            ].includes(status as OrderItemStatus)).length,
            submitted: fulfillmentStatuses.filter(status => status === OrderItemStatus.SENT_TO_PRINTIFY).length,
            inProduction: fulfillmentStatuses.filter(status => status === OrderItemStatus.IN_PRODUCTION).length,
            shipped: fulfillmentStatuses.filter(status => status === OrderItemStatus.SHIPPED).length,
            delivered: fulfillmentStatuses.filter(status => status === OrderItemStatus.DELIVERED).length,
            failed: fulfillmentStatuses.filter(status => status === OrderItemStatus.FULFILLMENT_FAILED).length,
            partial: order.status === OrderStatus.PARTIALLY_FULFILLED
                || order.fulfillmentStatus === FulfillmentStatus.PARTIAL
                || (fulfillmentStarted > 0 && fulfillmentStarted < fulfillmentStatuses.length)
        },
        fulfillmentFailure: order.fulfillmentStatus === 'failed' ? 'Fulfillment needs attention and can be retried.' : undefined,
        shippingAddress: order.shippingAddressSnapshot,
        tracking: order.trackingNumber ? {
            carrier: order.trackingCarrier,
            number: order.trackingNumber,
            url: order.trackingUrl,
            shippedAt: order.shippedAt,
            deliveredAt: order.deliveredAt
        } : undefined,
        paidAt: order.paidAt,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items
    }
}

async function loadOrder(orderId: number, userId?: number) {
    const order = await Order.findOne({
        where: { id: orderId, ...(userId === undefined ? {} : { userId }) },
        include: orderIncludes
    })
    if (!order) throw new HttpError(404, 'Order not found.')
    return order
}

function orderItemValues(item: CartViewItem, product: Product, variant: ProductVariant, stored: CartItem) {
    return {
        productId: product.id,
        productVariantId: variant.id,
        productTitle: item.productTitle,
        variantTitle: item.variantTitle,
        phoneModel: item.phoneModel,
        caseType: item.caseType,
        imageUrl: item.image,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        basePrice: centsToDecimal(moneyToCents(stored.basePrice)),
        totalPrice: centsToDecimal(item.unitPriceCents * item.quantity),
        currency: item.currency,
        aiDesignId: stored.aiDesignId,
        itemType: stored.itemType,
        status: OrderItemStatus.PENDING_PAYMENT,
        artworkStorageKey: stored.artworkStorageKey,
        mockupStorageKey: stored.mockupStorageKey,
        artworkChecksumSha256: stored.artworkChecksumSha256,
        printifyProductIdSnapshot: product.printifyProductId,
        printifyVariantIdSnapshot: variant.printifyVariantId,
        printifyBlueprintIdSnapshot: product.blueprintId,
        printifyProviderIdSnapshot: product.printProviderId
    }
}

export async function createPendingOrderFromCart(
    userId: number,
    shippingInput: ShippingAddressInput,
    shippingQuoteId: string,
    shippingOptionId: string
) {
    const cart = await getCart(userId)
    if (!cart.items.length) throw new HttpError(422, 'Your cart is empty.')

    const storedCartItems = await CartItem.findAll({
        where: { cartId: cart.id },
        include: [Product, ProductVariant, AIDesign]
    })
    const refreshed: Array<{ item: CartViewItem; product: Product; variant: ProductVariant; stored: CartItem }> = []
    for (const item of cart.items) {
        const stored = storedCartItems.find(entry => Number(entry.id) === item.id)
        if (!stored?.product || !stored.productVariant) {
            throw new HttpError(409, 'A cart item is no longer available.', 'CART_CHANGED', true)
        }
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_CART_ITEM_QUANTITY) {
            throw new HttpError(409, `Cart quantities must be between 1 and ${MAX_CART_ITEM_QUANTITY}.`, 'INVALID_QUANTITY', true)
        }
        if (stored.itemType === CommerceItemType.AI_CUSTOM) {
            const design = stored.aiDesign
            if (!design || Number(design.userId) !== userId || design.status !== AIDesignStatus.ADDED_TO_CART
                || Number(design.productId) !== Number(stored.product.id)
                || Number(design.productVariantId) !== Number(stored.productVariant.id)
                || !stored.aiDesignId || !stored.artworkStorageKey || !stored.mockupStorageKey || !stored.artworkChecksumSha256
                || stored.artworkStorageKey !== design.currentArtworkKey || stored.mockupStorageKey !== design.mockupKey
                || Number(stored.productVariant.productId) !== Number(stored.product.id)
                || stored.product.status !== ProductStatus.ACTIVE || !stored.product.visible || !stored.product.isVisible || !stored.product.isActive
                || !stored.product.allowAiCustomization || !stored.productVariant.available || !stored.productVariant.isEnabled
                || !stored.productVariant.isStorefrontEnabled
                || moneyToCents(stored.unitPrice) !== moneyToCents(stored.basePrice)
                || moneyToCents(stored.basePrice) !== moneyToCents(stored.product.retailPrice ?? stored.productVariant.price)) {
                throw new HttpError(409, 'This customized design or its current price changed. Review your cart and refresh shipping.', 'AI_DESIGN_NOT_READY', true)
            }
            refreshed.push({ item, product: stored.product, variant: stored.productVariant, stored })
            continue
        }

        const selected = await validatedCatalogVariant(item.productId, item.variantId)
        refreshed.push({
            item: {
                ...item,
                unitPrice: selected.variant.price,
                unitPriceCents: moneyToCents(selected.variant.price),
                lineTotal: centsToMoney(moneyToCents(selected.variant.price) * item.quantity),
                lineTotalCents: moneyToCents(selected.variant.price) * item.quantity,
                productTitle: selected.product.title,
                variantTitle: selected.variant.title,
                phoneModel: selected.variant.phoneModel,
                caseType: selected.variant.caseType,
                image: selected.variant.image ?? selected.product.image,
                currency: selected.variant.currency
            },
            product: selected.databaseProduct,
            variant: selected.databaseVariant,
            stored
        })
    }

    const currentItems = refreshed.map(entry => entry.item)
    const shipping = normalizeShippingAddress(shippingInput)
    const quoteLines: ShippingQuoteLine[] = refreshed.map(entry => ({
        cartItemId: entry.item.id,
        productId: entry.product.printifyProductId,
        variantId: entry.variant.printifyVariantId,
        blueprintId: entry.product.blueprintId,
        printProviderId: entry.product.printProviderId,
        quantity: entry.item.quantity,
        unitPrice: centsToDecimal(entry.item.unitPriceCents),
        currency: entry.item.currency,
        itemType: entry.stored.itemType
    }))
    const selection = await getOwnedShippingSelection(userId, shippingQuoteId, shippingOptionId)
    if (selection.quote.context !== 'cart' || Number(selection.quote.cartId) !== Number(cart.id)
        || selection.quote.addressHash !== shippingAddressHash(shipping)
        || selection.quote.itemSnapshotHash !== shippingLineHash(quoteLines)) {
        throw new HttpError(409, 'Your cart or shipping address changed. Request updated shipping options.', 'SHIPPING_QUOTE_MISMATCH', true)
    }
    const pricing = calculatePricing(currentItems, selection.option.priceCents, cart.currency)
    const hash = createHash('sha256').update(`${snapshotHash(currentItems)}:${selection.quote.id}:${selection.option.id}`).digest('hex')
    const sourceCart = await getOrCreateActiveCart(userId)

    const orderId = await getDatabase().transaction(async transaction => {
        const lockedCart = await getOrCreateActiveCart(userId, transaction)
        if (Number(lockedCart.id) !== Number(sourceCart.id)) {
            throw new HttpError(409, 'Your active cart changed. Please try checkout again.', 'CART_CHANGED', true)
        }
        const lockedItems = await CartItem.findAll({ where: { cartId: lockedCart.id }, transaction, lock: transaction.LOCK.UPDATE })
        const expected = new Map(cart.items.map(item => [item.id, item.quantity]))
        if (lockedItems.length !== expected.size || lockedItems.some(item => expected.get(Number(item.id)) !== item.quantity)) {
            throw new HttpError(409, 'Your cart changed during checkout. Review it and try again.', 'CART_CHANGED', true)
        }
        for (const entry of refreshed.filter(value => value.stored.itemType === CommerceItemType.AI_CUSTOM)) {
            const locked = lockedItems.find(item => Number(item.id) === entry.item.id)
            if (!locked || locked.artworkStorageKey !== entry.stored.artworkStorageKey
                || locked.mockupStorageKey !== entry.stored.mockupStorageKey
                || locked.artworkChecksumSha256 !== entry.stored.artworkChecksumSha256
                || locked.unitPrice !== entry.stored.unitPrice || locked.aiDesignId !== entry.stored.aiDesignId) {
                throw new HttpError(409, 'Your customized cart item changed. Review it and try checkout again.', 'CART_CHANGED', true)
            }
        }

        const existing = await Order.findOne({
            where: {
                userId,
                sourceCartId: lockedCart.id,
                cartSnapshotHash: hash,
                status: OrderStatus.PENDING,
                paymentStatus: { [Op.ne]: PaymentStatus.FAILED }
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        })
        if (existing) return Number(existing.id)

        const address = await reusableAddress(userId, shipping, transaction)

        for (const entry of refreshed.filter(entry => entry.stored.itemType === CommerceItemType.STANDARD)) {
            const stored = lockedItems.find(item => Number(item.id) === entry.item.id)!
            await stored.update({
                unitPrice: entry.item.unitPrice.toFixed(2),
                basePrice: entry.item.unitPrice.toFixed(2),
                currency: entry.item.currency,
                productTitle: entry.item.productTitle,
                variantTitle: entry.item.variantTitle,
                phoneModel: entry.item.phoneModel,
                caseType: entry.item.caseType,
                imageUrl: entry.item.image
            }, { transaction })
        }

        const order = await Order.create({
            userId,
            orderNumber: orderNumber(),
            sourceCartId: lockedCart.id,
            shippingAddressId: address.id,
            shippingAddressSnapshot: shipping,
            cartSnapshotHash: hash,
            shippingQuoteId: selection.quote.id,
            shippingMethodId: selection.option.id,
            shippingMethodCode: selection.option.shippingMethod,
            shippingMethodName: selection.option.name,
            shippingQuoteExpiresAt: selection.quote.expiresAt,
            status: OrderStatus.PENDING,
            paymentStatus: PaymentStatus.CREATED,
            subtotal: centsToDecimal(pricing.subtotalCents),
            shippingAmount: centsToDecimal(pricing.shippingCents),
            taxAmount: centsToDecimal(pricing.taxCents),
            totalAmount: centsToDecimal(pricing.totalCents),
            currency: cart.currency
        }, { transaction })

        await OrderItem.bulkCreate(refreshed.map(entry => ({
            orderId: order.id,
            ...orderItemValues(entry.item, entry.product, entry.variant, entry.stored)
        })), { transaction })
        return Number(order.id)
    })

    return serializeOrder(await loadOrder(orderId, userId))
}

export async function createPendingOrderForVariant(
    userId: number,
    printifyProductId: string,
    printifyVariantId: string,
    shippingInput: ShippingAddressInput,
    shippingQuoteId: string,
    shippingOptionId: string,
    quantity = 1
) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CART_ITEM_QUANTITY) {
        throw new HttpError(422, `Quantity must be between 1 and ${MAX_CART_ITEM_QUANTITY}.`, 'INVALID_QUANTITY')
    }
    const selected = await validatedCatalogVariant(printifyProductId, printifyVariantId)
    const shipping = normalizeShippingAddress(shippingInput)
    const quoteLines: ShippingQuoteLine[] = [{
        productId: selected.databaseProduct.printifyProductId,
        variantId: selected.databaseVariant.printifyVariantId,
        blueprintId: selected.databaseProduct.blueprintId,
        printProviderId: selected.databaseProduct.printProviderId,
        quantity,
        unitPrice: selected.variant.price.toFixed(2),
        currency: selected.variant.currency,
        itemType: CommerceItemType.STANDARD
    }]
    const selection = await getOwnedShippingSelection(userId, shippingQuoteId, shippingOptionId)
    if (selection.quote.context !== 'direct' || selection.quote.addressHash !== shippingAddressHash(shipping)
        || selection.quote.itemSnapshotHash !== shippingLineHash(quoteLines)) {
        throw new HttpError(409, 'Your product selection or shipping address changed. Request updated shipping options.', 'SHIPPING_QUOTE_MISMATCH', true)
    }
    const pricing = calculatePricing(quoteLines, selection.option.priceCents, selected.variant.currency)
    const hash = createHash('sha256').update(`direct:${shippingQuoteId}:${shippingOptionId}`).digest('hex')

    const orderId = await getDatabase().transaction(async transaction => {
        const existing = await Order.findOne({
            where: { userId, sourceCartId: null, cartSnapshotHash: hash, status: OrderStatus.PENDING },
            transaction,
            lock: transaction.LOCK.UPDATE
        })
        if (existing) return Number(existing.id)

        const address = await reusableAddress(userId, shipping, transaction)

        const order = await Order.create({
            userId,
            orderNumber: orderNumber(),
            cartSnapshotHash: hash,
            shippingAddressId: address.id,
            shippingAddressSnapshot: shipping,
            shippingQuoteId: selection.quote.id,
            shippingMethodId: selection.option.id,
            shippingMethodCode: selection.option.shippingMethod,
            shippingMethodName: selection.option.name,
            shippingQuoteExpiresAt: selection.quote.expiresAt,
            status: OrderStatus.PENDING,
            paymentStatus: PaymentStatus.CREATED,
            subtotal: centsToDecimal(pricing.subtotalCents),
            shippingAmount: centsToDecimal(pricing.shippingCents),
            taxAmount: centsToDecimal(pricing.taxCents),
            totalAmount: centsToDecimal(pricing.totalCents),
            currency: selected.variant.currency
        }, { transaction })
        await OrderItem.create({
            orderId: order.id,
            productId: selected.databaseProduct.id,
            productVariantId: selected.databaseVariant.id,
            productTitle: selected.product.title,
            variantTitle: selected.variant.title,
            phoneModel: selected.variant.phoneModel,
            caseType: selected.variant.caseType,
            imageUrl: selected.variant.image ?? selected.product.image,
            quantity,
            unitPrice: selected.variant.price.toFixed(2),
            basePrice: selected.variant.price.toFixed(2),
            itemType: CommerceItemType.STANDARD,
            status: OrderItemStatus.PENDING_PAYMENT,
            totalPrice: centsToDecimal(moneyToCents(selected.variant.price) * quantity),
            currency: selected.variant.currency,
            printifyProductIdSnapshot: selected.databaseProduct.printifyProductId,
            printifyVariantIdSnapshot: selected.databaseVariant.printifyVariantId,
            printifyBlueprintIdSnapshot: selected.databaseProduct.blueprintId,
            printifyProviderIdSnapshot: selected.databaseProduct.printProviderId
        }, { transaction })
        return Number(order.id)
    })
    return loadOrder(orderId, userId)
}

export async function getUserOrders(userId: number) {
    const orders = await Order.findAll({
        where: { userId },
        include: orderIncludes,
        order: [['createdAt', 'DESC']]
    })
    return orders.map(serializeOrder)
}

export async function getUserOrder(userId: number, orderId: number) {
    return serializeOrder(await loadOrder(orderId, userId))
}

export async function getOwnedOrderModel(userId: number, orderId: number) {
    return loadOrder(orderId, userId)
}

export async function readOwnedOrderItemAsset(
    userId: number,
    orderId: number,
    itemId: number,
    kind: 'artwork' | 'mockup',
    storage: PrivateStorageService = privateStorage
) {
    const item = await OrderItem.findOne({
        where: { id: itemId, orderId },
        include: [{ model: Order, where: { userId }, required: true }]
    })
    if (!item) throw new HttpError(404, 'Order item image not found.')
    const key = kind === 'artwork' ? item.artworkStorageKey : item.mockupStorageKey
    if (!key) throw new HttpError(404, 'Order item image not found.')
    return { bytes: await storage.read(key), mimeType: mimeTypeForStorageKey(key) }
}

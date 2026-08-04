import { createHash, randomUUID } from 'crypto'
import { Op, type Transaction } from 'sequelize'
import { CartItem } from '../database/models/cart-item'
import { AIDesign } from '../database/models/ai-design'
import { AIDesignStatus, CommerceItemType, ProductStatus } from '../database/models/model-enums'
import { Product } from '../database/models/product'
import { ProductVariant } from '../database/models/product-variant'
import { ShippingQuote } from '../database/models/shipping-quote'
import { Order } from '../database/models/order'
import { OrderItem } from '../database/models/order-item'
import HttpError from '../errors/http-error'
import { getCart, MAX_CART_ITEM_QUANTITY, validatedCatalogVariant } from './cart'
import { calculatePricing, moneyToCents } from './pricing'
import { calculatePrintifyShipping, type PrintifyShippingPayload } from './printify'

export interface ShippingAddressInput {
    firstName: string
    lastName: string
    email: string
    phone: string
    address1: string
    address2?: string
    city: string
    state?: string
    postalCode: string
    countryCode: string
}

export interface ShippingOption {
    id: string
    name: string
    shippingMethod: number
    priceCents: number
    price: number
    currency: string
    components?: Array<{ group: string; priceCents: number }>
}

export interface ShippingQuoteLine {
    cartItemId?: number
    productId: string
    variantId: string
    blueprintId?: string
    printProviderId?: string
    quantity: number
    unitPrice: string
    currency: string
    itemType: CommerceItemType
}

export interface ShippingApi {
    calculate: typeof calculatePrintifyShipping
}

const defaultApi: ShippingApi = { calculate: calculatePrintifyShipping }
const activeQuoteRequests = new Map<string, Promise<ReturnType<typeof serializeQuote>>>()
const methodCodes: Record<string, number> = {
    standard: 1,
    express: 2,
    priority: 2,
    printify_express: 3,
    economy: 4
}

function title(value: string) {
    return value.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
}

export function normalizePrintifyShippingOptions(response: Record<string, unknown>, currency = 'USD') {
    return Object.entries(response).flatMap(([id, amount]) => {
        const priceCents = Number(amount)
        const shippingMethod = methodCodes[id]
        if (!shippingMethod || !Number.isSafeInteger(priceCents) || priceCents < 0) return []
        return [{ id, name: `${title(id)} Shipping`, shippingMethod, priceCents, price: priceCents / 100, currency }]
    }).sort((left, right) => left.priceCents - right.priceCents || left.name.localeCompare(right.name))
}

function fulfillmentGroups(lines: ShippingQuoteLine[]) {
    const standard = lines.filter(line => line.itemType === CommerceItemType.STANDARD)
    return [
        ...(standard.length ? [{ id: 'standard-items', lines: standard }] : []),
        ...lines.filter(line => line.itemType === CommerceItemType.AI_CUSTOM).map((line, index) => ({
            id: `custom-item-${line.cartItemId ?? index + 1}`,
            lines: [line]
        }))
    ]
}

function aggregateOptions(groups: Array<{ id: string; options: ShippingOption[] }>, currency: string) {
    if (!groups.length) return []
    const ids = groups[0].options.map(option => option.id).filter(id => groups.every(group => group.options.some(option => option.id === id)))
    return ids.map(id => {
        const components = groups.map(group => ({
            group: group.id,
            priceCents: group.options.find(option => option.id === id)!.priceCents
        }))
        const first = groups[0].options.find(option => option.id === id)!
        const priceCents = components.reduce((sum, component) => sum + component.priceCents, 0)
        return { ...first, priceCents, price: priceCents / 100, currency, components }
    }).sort((left, right) => left.priceCents - right.priceCents || left.name.localeCompare(right.name))
}

export function normalizeShippingAddress(input: ShippingAddressInput): ShippingAddressInput {
    return {
        firstName: String(input?.firstName ?? '').trim(),
        lastName: String(input?.lastName ?? '').trim(),
        email: String(input?.email ?? '').trim().toLowerCase(),
        phone: String(input?.phone ?? '').trim(),
        address1: String(input?.address1 ?? '').trim(),
        address2: String(input?.address2 ?? '').trim() || undefined,
        city: String(input?.city ?? '').trim(),
        state: String(input?.state ?? '').trim() || undefined,
        postalCode: String(input?.postalCode ?? '').trim(),
        countryCode: String(input?.countryCode ?? '').trim().toUpperCase()
    }
}

export function validateShippingAddress(input: ShippingAddressInput) {
    const address = normalizeShippingAddress(input)
    if (!address.firstName || !address.lastName) {
        throw new HttpError(422, 'First and last name are required for shipping.', 'INVALID_SHIPPING_ADDRESS')
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address.email)) {
        throw new HttpError(422, 'Enter a valid shipping email.', 'INVALID_SHIPPING_ADDRESS')
    }
    if (!/^[+()\d\s.-]{6,32}$/.test(address.phone)) {
        throw new HttpError(422, 'Enter a valid shipping phone number.', 'INVALID_SHIPPING_ADDRESS')
    }
    if (address.address1.length < 3 || !address.city || address.postalCode.length < 2) {
        throw new HttpError(422, 'Complete the street address, city, and postal code.', 'INVALID_SHIPPING_ADDRESS')
    }
    if (!/^[A-Z]{2}$/.test(address.countryCode)) {
        throw new HttpError(422, 'Use a valid two-letter destination country code.', 'UNSUPPORTED_DESTINATION')
    }
    if (['US', 'CA', 'AU'].includes(address.countryCode) && !address.state) {
        throw new HttpError(422, 'State or region is required for this destination.', 'INVALID_SHIPPING_ADDRESS')
    }
    return address
}

function stableHash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function shippingLineHash(lines: ShippingQuoteLine[]) {
    return stableHash([...lines].sort((a, b) => (a.cartItemId ?? 0) - (b.cartItemId ?? 0) || a.variantId.localeCompare(b.variantId)))
}

export function shippingAddressHash(address: ShippingAddressInput) {
    return stableHash(normalizeShippingAddress(address))
}

function quoteTtlMs() {
    const minutes = Number(process.env.PRINTIFY_SHIPPING_QUOTE_MINUTES ?? 15)
    return (Number.isFinite(minutes) && minutes >= 1 && minutes <= 60 ? minutes : 15) * 60_000
}

function printifyAddress(address: ShippingAddressInput): PrintifyShippingPayload['address_to'] {
    return {
        first_name: address.firstName,
        last_name: address.lastName,
        email: address.email,
        phone: address.phone,
        country: address.countryCode,
        region: address.state,
        address1: address.address1,
        address2: address.address2,
        city: address.city,
        zip: address.postalCode
    }
}

function printifyLine(line: ShippingQuoteLine, index: number): PrintifyShippingPayload['line_items'][number] {
    if (!/^\d+$/.test(line.variantId)) throw new HttpError(409, 'A selected phone case option is invalid.')
    if (line.itemType === CommerceItemType.AI_CUSTOM) {
        if (!line.blueprintId || !line.printProviderId || !/^\d+$/.test(line.blueprintId) || !/^\d+$/.test(line.printProviderId)) {
            throw new HttpError(409, 'A customized item is missing required production information.')
        }
        return {
            print_provider_id: Number(line.printProviderId),
            blueprint_id: Number(line.blueprintId),
            variant_id: Number(line.variantId),
            quantity: line.quantity,
            external_id: `shipping-item-${index + 1}`
        }
    }
    return {
        product_id: line.productId,
        variant_id: Number(line.variantId),
        quantity: line.quantity,
        external_id: `shipping-item-${index + 1}`
    }
}

async function cartLines(userId: number) {
    const cart = await getCart(userId)
    if (!cart.items.length) throw new HttpError(422, 'Your cart is empty.')
    const stored = await CartItem.findAll({ where: { cartId: cart.id }, include: [Product, ProductVariant, AIDesign] })
    const lines: ShippingQuoteLine[] = []
    for (const view of cart.items) {
        const item = stored.find(value => Number(value.id) === view.id)
        if (!item?.product || !item.productVariant || Number(item.productVariant.productId) !== Number(item.product.id)) {
            throw new HttpError(409, 'A cart item is no longer available.')
        }
        if (item.product.status !== ProductStatus.ACTIVE || !item.product.visible || !item.product.isVisible || !item.product.isActive
            || !item.productVariant.isEnabled || !item.productVariant.isStorefrontEnabled || !item.productVariant.available) {
            throw new HttpError(409, 'A selected phone case option is no longer available.', 'VARIANT_UNAVAILABLE', true)
        }
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_CART_ITEM_QUANTITY) {
            throw new HttpError(409, `Cart quantities must be between 1 and ${MAX_CART_ITEM_QUANTITY}.`, 'INVALID_QUANTITY', true)
        }
        if (item.itemType === CommerceItemType.STANDARD) {
            const selected = await validatedCatalogVariant(item.product.printifyProductId, item.productVariant.printifyVariantId)
            await item.update({ unitPrice: selected.variant.price.toFixed(2), basePrice: selected.variant.price.toFixed(2), currency: selected.variant.currency })
        } else if (!item.product.allowAiCustomization || !item.aiDesign || Number(item.aiDesign.userId) !== userId
            || Number(item.aiDesign.productId) !== Number(item.product.id)
            || Number(item.aiDesign.productVariantId) !== Number(item.productVariant.id)
            || item.aiDesign.status !== AIDesignStatus.ADDED_TO_CART || !item.artworkChecksumSha256) {
            throw new HttpError(409, 'A customized design is not ready for checkout.', 'AI_DESIGN_NOT_READY', true)
        } else {
            const currentPrice = item.product.retailPrice ?? item.productVariant.price
            await item.update({
                unitPrice: currentPrice,
                basePrice: currentPrice,
                currency: item.productVariant.currency
            })
        }
        lines.push({
            cartItemId: Number(item.id),
            productId: item.product.printifyProductId,
            variantId: item.productVariant.printifyVariantId,
            blueprintId: item.product.blueprintId,
            printProviderId: item.product.printProviderId,
            quantity: item.quantity,
            unitPrice: item.basePrice,
            currency: item.currency,
            itemType: item.itemType
        })
    }
    return { cartId: cart.id, lines }
}

async function directLines(productId: string, variantId: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CART_ITEM_QUANTITY) {
        throw new HttpError(422, `Quantity must be between 1 and ${MAX_CART_ITEM_QUANTITY}.`, 'INVALID_QUANTITY')
    }
    const selected = await validatedCatalogVariant(productId, variantId)
    return [{
        productId: selected.databaseProduct.printifyProductId,
        variantId: selected.databaseVariant.printifyVariantId,
        blueprintId: selected.databaseProduct.blueprintId,
        printProviderId: selected.databaseProduct.printProviderId,
        quantity,
        unitPrice: selected.variant.price.toFixed(2),
        currency: selected.variant.currency,
        itemType: CommerceItemType.STANDARD
    }] satisfies ShippingQuoteLine[]
}

function serializeQuote(quote: ShippingQuote, lines: ShippingQuoteLine[], reused = false) {
    const options = quote.options as ShippingOption[]
    const shippingOptions = options.map(({ components: _components, ...option }) => ({
        ...option,
        pricing: calculatePricing(lines, option.priceCents, quote.currency)
    }))
    return { id: quote.id, expiresAt: quote.expiresAt, shippingOptions, context: quote.context, reused }
}

async function createOrReuseShippingQuote(userId: number, input: {
    shippingAddress: ShippingAddressInput
    productId?: string
    variantId?: string
    quantity?: number
}, api: ShippingApi) {
    const address = validateShippingAddress(input.shippingAddress)
    const direct = Boolean(input.productId)
    const source = direct
        ? { cartId: undefined, lines: await directLines(input.productId!, input.variantId!, input.quantity ?? 1) }
        : await cartLines(userId)
    const currencies = new Set(source.lines.map(line => line.currency.toUpperCase()))
    if (currencies.size !== 1) throw new HttpError(409, 'All checkout items must use one currency.')
    const currency = [...currencies][0]
    const itemSnapshotHash = shippingLineHash(source.lines)
    const addressHash = shippingAddressHash(address)
    const existing = await ShippingQuote.findOne({
        where: {
            userId,
            context: direct ? 'direct' : 'cart',
            ...(source.cartId ? { cartId: source.cartId } : { cartId: null }),
            itemSnapshotHash,
            addressHash,
            currency,
            expiresAt: { [Op.gt]: new Date() }
        },
        order: [['createdAt', 'DESC']]
    })
    if (existing) return serializeQuote(existing, source.lines, true)

    const groups = fulfillmentGroups(source.lines)
    let quotedGroups: Array<{ id: string; options: ShippingOption[] }>
    try {
        quotedGroups = await Promise.all(groups.map(async group => ({
            id: group.id,
            options: normalizePrintifyShippingOptions(await api.calculate({
                line_items: group.lines.map(printifyLine),
                address_to: printifyAddress(address)
            }), currency)
        })))
    } catch (error) {
        if (error instanceof HttpError) throw error
        throw new HttpError(422, 'Shipping could not be validated for this destination. Review the address and try again.', 'SHIPPING_UNAVAILABLE', true)
    }
    const options = aggregateOptions(quotedGroups, currency)
    if (!options.length) throw new HttpError(422, 'Shipping is not available to this address for the selected items.', 'SHIPPING_UNAVAILABLE', true)
    const expiresAt = new Date(Date.now() + quoteTtlMs())
    const quote = await ShippingQuote.create({
        id: randomUUID(),
        userId,
        cartId: source.cartId,
        context: direct ? 'direct' : 'cart',
        itemSnapshot: source.lines,
        itemSnapshotHash,
        addressSnapshot: address,
        addressHash,
        options,
        currency,
        expiresAt
    })
    return serializeQuote(quote, source.lines)
}

export async function createShippingQuote(userId: number, input: {
    shippingAddress: ShippingAddressInput
    productId?: string
    variantId?: string
    quantity?: number
}, api: ShippingApi = defaultApi) {
    const direct = Boolean(input.productId)
    const address = validateShippingAddress(input.shippingAddress)
    const requestKey = stableHash({
        userId,
        context: direct ? 'direct' : 'cart',
        productId: input.productId,
        variantId: input.variantId,
        quantity: input.quantity ?? 1,
        address
    })
    const active = activeQuoteRequests.get(requestKey)
    if (active) return active
    const request = createOrReuseShippingQuote(userId, { ...input, shippingAddress: address }, api)
    activeQuoteRequests.set(requestKey, request)
    try {
        return await request
    } finally {
        if (activeQuoteRequests.get(requestKey) === request) activeQuoteRequests.delete(requestKey)
    }
}

export async function getOwnedShippingSelection(userId: number, quoteId: string, optionId: string) {
    const quote = await ShippingQuote.findOne({ where: { id: quoteId, userId } })
    if (!quote) throw new HttpError(404, 'Shipping quote not found.', 'SHIPPING_QUOTE_INVALID', true)
    if (quote.expiresAt.getTime() <= Date.now()) {
        throw new HttpError(409, 'Your shipping quote expired. Request updated shipping options.', 'SHIPPING_QUOTE_EXPIRED', true)
    }
    const options = quote.options as ShippingOption[]
    const option = options.find(value => value.id === optionId)
    if (!option || option.currency.toUpperCase() !== quote.currency.toUpperCase()) {
        throw new HttpError(422, 'Select a valid shipping method.', 'SHIPPING_METHOD_INVALID', true)
    }
    return { quote, option, lines: quote.itemSnapshot as ShippingQuoteLine[], address: quote.addressSnapshot as ShippingAddressInput }
}

export async function verifyPersistedOrderShipping(order: Order, items: OrderItem[], transaction?: Transaction) {
    if (!order.shippingQuoteId || !order.shippingMethodId || !order.shippingMethodCode) {
        throw new HttpError(409, 'This order is missing a verified shipping method.')
    }
    const quote = await ShippingQuote.findOne({ where: { id: order.shippingQuoteId, userId: order.userId }, transaction })
    const address = validateShippingAddress(order.shippingAddressSnapshot as ShippingAddressInput)
    if (!quote || quote.addressHash !== shippingAddressHash(address)) {
        throw new HttpError(409, 'The saved shipping quote could not be verified.', 'SHIPPING_QUOTE_MISMATCH', true)
    }
    const option = (quote.options as ShippingOption[]).find(value => value.id === order.shippingMethodId)
    if (!option || option.shippingMethod !== order.shippingMethodCode || option.priceCents !== moneyToCents(order.shippingAmount)
        || quote.currency.toUpperCase() !== order.currency.toUpperCase()
        || option.currency.toUpperCase() !== order.currency.toUpperCase()) {
        throw new HttpError(409, 'The saved shipping method, amount, or currency could not be verified.', 'SHIPPING_QUOTE_MISMATCH', true)
    }
    const quotedLines = quote.itemSnapshot as ShippingQuoteLine[]
    const unmatched = [...quotedLines]
    for (const item of items) {
        const index = unmatched.findIndex(line => line.productId === item.printifyProductIdSnapshot
            && line.variantId === item.printifyVariantIdSnapshot
            && line.quantity === item.quantity
            && line.itemType === item.itemType
            && moneyToCents(line.unitPrice) === moneyToCents(item.unitPrice))
        if (index < 0) throw new HttpError(409, 'The saved shipping quote does not match the purchased items.', 'SHIPPING_QUOTE_MISMATCH', true)
        unmatched.splice(index, 1)
    }
    if (unmatched.length) throw new HttpError(409, 'The saved shipping quote does not match the purchased items.', 'SHIPPING_QUOTE_MISMATCH', true)
    return { quote, option }
}

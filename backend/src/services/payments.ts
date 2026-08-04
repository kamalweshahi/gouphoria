import type { Transaction } from 'sequelize'
import { CartItem } from '../database/models/cart-item'
import { AIDesign } from '../database/models/ai-design'
import { CommerceAudit } from '../database/models/commerce-audit'
import { AIApprovalStatus, AIDesignStatus, AdminReviewAction, CommerceItemType, OrderItemStatus, OrderStatus, PaymentStatus } from '../database/models/model-enums'
import { Order } from '../database/models/order'
import { OrderItem } from '../database/models/order-item'
import { Payment } from '../database/models/payment'
import { Product } from '../database/models/product'
import { ProductVariant } from '../database/models/product-variant'
import { getDatabase } from '../database/database'
import HttpError from '../errors/http-error'
import { capturePayPalOrder, createPayPalOrder, getPayPalOrder, type PayPalOrderInput } from './paypal'
import { fulfillStandardOrder } from './fulfillment'
import { assertAIDesignTransition } from './ai-designs'
import { calculatePricing, moneyToCents } from './pricing'
import { MAX_CART_ITEM_QUANTITY } from './cart'
import { verifyPersistedOrderShipping } from './shipping'

export interface PayPalApi {
    create: typeof createPayPalOrder
    get: typeof getPayPalOrder
    capture: typeof capturePayPalOrder
}

const defaultPayPalApi: PayPalApi = { create: createPayPalOrder, get: getPayPalOrder, capture: capturePayPalOrder }

function assertAmount(actualValue: unknown, actualCurrency: unknown, order: Order) {
    let actualCents: number
    try {
        actualCents = moneyToCents(String(actualValue))
    } catch {
        throw new HttpError(409, 'PayPal returned an invalid amount for this order.')
    }
    if (actualCents !== moneyToCents(order.totalAmount)) {
        throw new HttpError(409, 'PayPal returned an amount that does not match this order.')
    }
    if (String(actualCurrency).toUpperCase() !== order.currency.toUpperCase()) {
        throw new HttpError(409, 'PayPal returned a currency that does not match this order.')
    }
}

async function lockedOwnedOrder(userId: number, orderId: number, transaction: Transaction) {
    const order = await Order.findOne({
        where: { id: orderId, userId },
        include: [{
            model: OrderItem,
            include: [Product, ProductVariant, AIDesign]
        }, Payment],
        transaction,
        lock: transaction.LOCK.UPDATE
    })
    if (!order) throw new HttpError(404, 'Order not found.')
    return order
}

function assertCurrentOrderItems(order: Order, userId: number) {
    for (const item of order.items ?? []) {
        const product = item.product
        const variant = item.productVariant
        if (!product || !variant || Number(variant.productId) !== Number(product.id)
            || Number(item.productId) !== Number(product.id)
            || Number(item.productVariantId) !== Number(variant.id)) {
            throw new HttpError(409, 'An order item is no longer available.', 'PRODUCT_UNAVAILABLE', true)
        }
        if (product.status !== 'active' || !product.visible || !product.isVisible || !product.isActive) {
            throw new HttpError(409, 'A product in this order is no longer available.', 'PRODUCT_UNAVAILABLE', true)
        }
        if (!variant.available || !variant.isEnabled || !variant.isStorefrontEnabled) {
            throw new HttpError(409, 'A selected phone case option is no longer available.', 'VARIANT_UNAVAILABLE', true)
        }
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_CART_ITEM_QUANTITY) {
            throw new HttpError(409, `Order quantities must be between 1 and ${MAX_CART_ITEM_QUANTITY}.`, 'INVALID_QUANTITY', true)
        }
        const custom = item.itemType === CommerceItemType.AI_CUSTOM || Boolean(item.aiDesignId)
        if (custom ? !product.allowAiCustomization : (!product.allowDirectPurchase || product.aiCustomOnly)) {
            throw new HttpError(409, custom
                ? 'A customized product in this order is no longer available.'
                : 'A product in this order is no longer directly purchasable.', 'PRODUCT_UNAVAILABLE', true)
        }
        const currentUnitCents = moneyToCents(product.retailPrice ?? variant.price)
        if (moneyToCents(item.unitPrice) !== currentUnitCents
            || moneyToCents(item.totalPrice) !== currentUnitCents * item.quantity
            || item.currency.toUpperCase() !== variant.currency.toUpperCase()
            || item.currency.toUpperCase() !== order.currency.toUpperCase()) {
            throw new HttpError(409, 'A product price changed. Refresh shipping and review the updated total.', 'CART_CHANGED', true)
        }
        if (custom) {
            const design = item.aiDesign
            if (!design || Number(design.userId) !== userId
                || Number(design.productId) !== Number(product.id)
                || Number(design.productVariantId) !== Number(variant.id)
                || design.status !== AIDesignStatus.ADDED_TO_CART
                || !item.artworkStorageKey || !item.mockupStorageKey || !item.artworkChecksumSha256
                || design.currentArtworkKey !== item.artworkStorageKey || design.mockupKey !== item.mockupStorageKey) {
                throw new HttpError(409, 'A customized design changed before payment. Review the design and checkout again.', 'AI_DESIGN_NOT_READY', true)
            }
        }
    }
}

function paypalInput(order: Order): PayPalOrderInput {
    return {
        referenceId: order.orderNumber,
        description: `Phone case order ${order.orderNumber}`,
        total: Number(order.totalAmount),
        currency: order.currency,
        itemTotal: Number(order.subtotal),
        shipping: Number(order.shippingAmount),
        tax: Number(order.taxAmount),
        items: (order.items ?? []).map(item => ({
            name: `${item.productTitle} — ${item.variantTitle}`,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice)
        }))
    }
}

function assertStoredOrderPricing(order: Order) {
    const pricing = calculatePricing(order.items ?? [], moneyToCents(order.shippingAmount), order.currency, moneyToCents(order.taxAmount))
    if (pricing.subtotalCents !== moneyToCents(order.subtotal) || pricing.totalCents !== moneyToCents(order.totalAmount)) {
        throw new HttpError(409, 'The saved order total is inconsistent. Request updated checkout pricing.')
    }
}

export async function createPayPalOrderForSavedOrder(userId: number, orderId: number, paypal: PayPalApi = defaultPayPalApi) {
    return getDatabase().transaction(async transaction => {
        const order = await lockedOwnedOrder(userId, orderId, transaction)
        if (order.status !== OrderStatus.PENDING) {
            throw new HttpError(409, order.status === OrderStatus.PAID ? 'This order is already paid.' : 'This order cannot be paid in its current state.')
        }
        if (!order.items?.length) throw new HttpError(422, 'This order has no items.')
        assertStoredOrderPricing(order)
        const existingPayment = order.payment
        if (existingPayment && [PaymentStatus.CREATED, PaymentStatus.APPROVED].includes(existingPayment.status)) {
            return { id: existingPayment.providerOrderId, orderId: Number(order.id), orderNumber: order.orderNumber, idempotent: true }
        }
        assertCurrentOrderItems(order, userId)
        if (!order.shippingAddressSnapshot) throw new HttpError(422, 'A shipping address is required before payment.')
        if (!order.shippingQuoteId || !order.shippingMethodId || !order.shippingMethodCode || !order.shippingQuoteExpiresAt) {
            throw new HttpError(409, 'Request current shipping options before payment.')
        }
        if (order.shippingQuoteExpiresAt.getTime() <= Date.now()) {
            throw new HttpError(409, 'Your shipping quote expired. Request updated shipping options and review the total.', 'SHIPPING_QUOTE_EXPIRED', true)
        }
        await verifyPersistedOrderShipping(order, order.items, transaction)

        let paypalOrder: any
        try {
            paypalOrder = await paypal.create(paypalInput(order))
        } catch {
            throw new HttpError(502, 'PayPal could not create the payment order. Please try again.', 'PAYPAL_ORDER_CREATE_FAILED', true)
        }
        if (!paypalOrder?.id) throw new HttpError(502, 'PayPal did not create an order. Please try again.')

        if (existingPayment) {
            await existingPayment.update({
                providerOrderId: paypalOrder.id,
                providerTransactionId: null,
                amount: order.totalAmount,
                currency: order.currency,
                status: PaymentStatus.CREATED,
                providerResponse: paypalOrder,
                capturedAt: null
            }, { transaction })
        } else {
            await Payment.create({
                orderId: order.id,
                provider: 'paypal',
                providerOrderId: paypalOrder.id,
                amount: order.totalAmount,
                currency: order.currency,
                status: PaymentStatus.CREATED,
                providerResponse: paypalOrder
            }, { transaction })
        }
        await order.update({ paypalOrderId: paypalOrder.id, paymentStatus: PaymentStatus.CREATED }, { transaction })
        return { id: paypalOrder.id, orderId: Number(order.id), orderNumber: order.orderNumber }
    })
}

function paypalPurchaseUnit(paypalOrder: any, referenceId: string) {
    return (paypalOrder?.purchase_units ?? []).find((unit: any) => unit.reference_id === referenceId)
}

function completedCapture(captureResponse: any) {
    const captures = (captureResponse?.purchase_units ?? []).flatMap((unit: any) => unit?.payments?.captures ?? [])
    return captures.find((capture: any) => capture.status === 'COMPLETED')
}

function assertPayPalReceiver(paypalOrder: any, purchaseUnit: any, capture: any) {
    const expectedMerchantId = process.env.PAYPAL_MERCHANT_ID?.trim()
    const expectedReceiverEmail = process.env.PAYPAL_RECEIVER_EMAIL?.trim().toLowerCase()
    const payee = capture?.payee ?? purchaseUnit?.payee ?? paypalOrder?.payee
    if (expectedMerchantId && String(payee?.merchant_id ?? '') !== expectedMerchantId) {
        throw new HttpError(409, 'PayPal returned a merchant receiver that does not match this store.', 'PAYMENT_VERIFICATION_MISMATCH')
    }
    if (expectedReceiverEmail && String(payee?.email_address ?? '').toLowerCase() !== expectedReceiverEmail) {
        throw new HttpError(409, 'PayPal returned a merchant receiver that does not match this store.', 'PAYMENT_VERIFICATION_MISMATCH')
    }
}

function assertCaptureEligible(order: Order, payment: Payment) {
    if ([OrderStatus.CANCELLED, OrderStatus.REFUNDED, OrderStatus.DELIVERED, OrderStatus.SHIPPED, OrderStatus.PARTIALLY_FULFILLED].includes(order.status)) {
        throw new HttpError(409, 'This order cannot be captured in its current state.', 'PAYMENT_STATE_INVALID')
    }
    if ([PaymentStatus.FAILED, PaymentStatus.REFUNDED].includes(payment.status)) {
        throw new HttpError(409, 'This payment cannot be captured in its current state.', 'PAYMENT_STATE_INVALID')
    }
    if (order.status !== OrderStatus.PENDING) {
        throw new HttpError(409, 'This order cannot be captured in its current state.', 'PAYMENT_STATE_INVALID')
    }
}

type PaymentCompletionMode = 'capture' | 'recover'

async function completeSavedPayPalOrder(
    userId: number,
    orderId: number,
    providerOrderId: string,
    paypal: PayPalApi,
    mode: PaymentCompletionMode
) {
    const paymentResult = await getDatabase().transaction(async transaction => {
        const order = await lockedOwnedOrder(userId, orderId, transaction)
        const payment = order.payment
        assertStoredOrderPricing(order)
        if (!payment || payment.providerOrderId !== providerOrderId || order.paypalOrderId !== providerOrderId) {
            throw new HttpError(403, 'This PayPal order does not belong to your local order.')
        }

        if (payment.status === PaymentStatus.CAPTURED && order.paymentStatus === PaymentStatus.CAPTURED) {
            return {
                ...((payment.providerResponse as object | undefined) ?? {}),
                id: payment.providerTransactionId,
                status: 'COMPLETED',
                orderId: Number(order.id),
                orderNumber: order.orderNumber,
                paymentStatus: PaymentStatus.CAPTURED,
                total: Number(order.totalAmount),
                totalCents: moneyToCents(order.totalAmount),
                currency: order.currency,
                idempotent: true,
                hasStandardItems: (order.items ?? []).some(item => item.itemType === CommerceItemType.STANDARD)
            }
        }

        assertCaptureEligible(order, payment)

        let paypalOrder: any
        try {
            paypalOrder = await paypal.get(providerOrderId)
        } catch {
            throw new HttpError(502, 'PayPal payment status could not be verified. Please retry recovery.', 'PAYPAL_RECOVERY_UNAVAILABLE', true)
        }
        const purchaseUnit = paypalPurchaseUnit(paypalOrder, order.orderNumber)
        if (!purchaseUnit) {
            throw new HttpError(409, 'PayPal order reference does not match this local order.', 'PAYMENT_VERIFICATION_MISMATCH')
        }
        assertAmount(purchaseUnit.amount?.value, purchaseUnit.amount?.currency_code, order)
        let captureResponse = paypalOrder
        let capture = completedCapture(paypalOrder)
        let recovered = Boolean(capture && paypalOrder.status === 'COMPLETED')
        if (!capture || paypalOrder.status !== 'COMPLETED') {
            if (paypalOrder.status !== 'APPROVED') {
                if (mode === 'recover') {
                    return {
                        id: undefined,
                        status: String(paypalOrder.status ?? 'CREATED'),
                        paymentStatus: payment.status,
                        orderId: Number(order.id),
                        orderNumber: order.orderNumber,
                        total: Number(order.totalAmount),
                        totalCents: moneyToCents(order.totalAmount),
                        currency: order.currency,
                        recoverable: true,
                        pendingApproval: true,
                        hasStandardItems: false
                    }
                }
                throw new HttpError(409, 'PayPal has not approved this order for capture.', 'PAYMENT_NOT_APPROVED', true)
            }
            await payment.update({ status: PaymentStatus.APPROVED }, { transaction })
            await order.update({ paymentStatus: PaymentStatus.APPROVED }, { transaction })
            try {
                captureResponse = await paypal.capture(providerOrderId, `capture-${order.orderNumber}`)
            } catch {
                throw new HttpError(502, 'PayPal capture confirmation was interrupted. Retry payment recovery before paying again.', 'PAYPAL_CAPTURE_INTERRUPTED', true)
            }
            capture = completedCapture(captureResponse)
            recovered = mode === 'recover'
        }
        if (!capture || captureResponse.status !== 'COMPLETED') {
            throw new HttpError(409, 'PayPal did not complete the payment capture.', 'PAYPAL_CAPTURE_FAILED', true)
        }
        assertAmount(capture.amount?.value, capture.amount?.currency_code, order)
        assertPayPalReceiver(paypalOrder, purchaseUnit, capture)

        const customItemsBeforeCapture = (order.items ?? []).filter(item => item.itemType === CommerceItemType.AI_CUSTOM || Boolean(item.aiDesignId))
        for (const item of customItemsBeforeCapture) {
            if (!item.aiDesignId || !item.artworkStorageKey || !item.mockupStorageKey || !item.artworkChecksumSha256) {
                throw new HttpError(409, 'A customized order item is missing its approved artwork snapshot.')
            }
            const design = await AIDesign.findByPk(item.aiDesignId, { transaction, lock: transaction.LOCK.UPDATE })
            if (!design || Number(design.userId) !== userId || design.currentArtworkKey !== item.artworkStorageKey
                || design.status !== AIDesignStatus.ADDED_TO_CART) {
                throw new HttpError(409, 'A customized design changed before payment. Please contact support.')
            }
        }

        const capturedAt = capture.create_time ? new Date(capture.create_time) : new Date()
        await payment.update({
            providerTransactionId: capture.id,
            status: PaymentStatus.CAPTURED,
            providerResponse: captureResponse,
            capturedAt
        }, { transaction })
        const aiItems = (order.items ?? []).filter(item => item.itemType === CommerceItemType.AI_CUSTOM || Boolean(item.aiDesignId))
        const standardItems = (order.items ?? []).filter(item => !aiItems.includes(item))
        for (const item of standardItems) await item.update({ status: OrderItemStatus.PAID }, { transaction })
        for (const item of aiItems) {
            if (!item.aiDesignId || !item.artworkStorageKey || !item.mockupStorageKey || !item.artworkChecksumSha256) {
                throw new HttpError(409, 'A customized order item is missing its approved artwork snapshot.')
            }
            const design = await AIDesign.findByPk(item.aiDesignId, { transaction, lock: transaction.LOCK.UPDATE })
            if (!design || Number(design.userId) !== userId || design.currentArtworkKey !== item.artworkStorageKey
                || design.status !== AIDesignStatus.ADDED_TO_CART) {
                throw new HttpError(409, 'A customized design changed before payment. Please contact support.')
            }
            assertAIDesignTransition(design.status, AIDesignStatus.PURCHASED)
            design.status = AIDesignStatus.PURCHASED
            assertAIDesignTransition(design.status, AIDesignStatus.PENDING_ADMIN_REVIEW)
            await design.update({ status: AIDesignStatus.PENDING_ADMIN_REVIEW, approvalStatus: AIApprovalStatus.PENDING }, { transaction })
            await item.update({ status: OrderItemStatus.PENDING_DESIGN_REVIEW }, { transaction })
            await CommerceAudit.create({
                actorUserId: userId,
                orderId: order.id,
                orderItemId: item.id,
                aiDesignId: design.id,
                action: AdminReviewAction.PAYMENT_CAPTURED,
                statusBefore: OrderItemStatus.PENDING_PAYMENT,
                statusAfter: OrderItemStatus.PENDING_DESIGN_REVIEW,
                metadata: { provider: 'paypal', providerTransactionId: capture.id }
            }, { transaction })
        }
        await order.update({
            status: aiItems.length ? OrderStatus.PENDING_AI_REVIEW : OrderStatus.PAID,
            paymentStatus: PaymentStatus.CAPTURED,
            paidAt: capturedAt
        }, { transaction })
        if (order.sourceCartId) await CartItem.destroy({ where: { cartId: order.sourceCartId }, transaction })

        return {
            ...captureResponse,
            orderId: Number(order.id),
            orderNumber: order.orderNumber,
            paymentStatus: PaymentStatus.CAPTURED,
            total: Number(order.totalAmount),
            totalCents: moneyToCents(order.totalAmount),
            currency: order.currency,
            recovered,
            hasStandardItems: standardItems.length > 0
        }
    })

    const { hasStandardItems, ...publicPaymentResult } = paymentResult
    if (publicPaymentResult.paymentStatus !== PaymentStatus.CAPTURED) return publicPaymentResult
    if (!hasStandardItems) {
        return { ...publicPaymentResult, fulfillment: { orderId, status: 'not_ready', customPendingReview: true } }
    }
    try {
        const fulfillment = await fulfillStandardOrder(orderId)
        return { ...publicPaymentResult, fulfillment }
    } catch (error: any) {
        console.error('fulfillment attempt failed', {
            orderId,
            name: error?.name,
            code: error?.code,
            status: error?.status ?? error?.response?.status
        })
        return {
            ...publicPaymentResult,
            fulfillment: { orderId, status: 'failed', retryable: true }
        }
    }
}

export async function captureSavedPayPalOrder(
    userId: number,
    orderId: number,
    providerOrderId: string,
    paypal: PayPalApi = defaultPayPalApi
) {
    return completeSavedPayPalOrder(userId, orderId, providerOrderId, paypal, 'capture')
}

export async function recoverSavedPayPalOrder(
    userId: number,
    orderId: number,
    providerOrderId: string,
    paypal: PayPalApi = defaultPayPalApi
) {
    return completeSavedPayPalOrder(userId, orderId, providerOrderId, paypal, 'recover')
}

import { randomUUID } from 'crypto'
import type { Transaction } from 'sequelize'
import { CreditAccount } from '../database/models/credit-account'
import { CreditPackage } from '../database/models/credit-package'
import { CreditPurchase } from '../database/models/credit-purchase'
import { CreditTransaction } from '../database/models/credit-transaction'
import {
    CreditPurchaseStatus,
    CreditTransactionReason,
    OrderStatus,
    PaymentStatus
} from '../database/models/model-enums'
import { Order } from '../database/models/order'
import { OrderItem } from '../database/models/order-item'
import { Payment } from '../database/models/payment'
import { SystemSetting } from '../database/models/system-setting'
import { User } from '../database/models/user'
import { getDatabase } from '../database/database'
import HttpError from '../errors/http-error'
import { capturePayPalOrder, createPayPalOrder, getPayPalOrder } from './paypal'

export interface CreditPayPalApi {
    create: typeof createPayPalOrder
    get: typeof getPayPalOrder
    capture: typeof capturePayPalOrder
}

const defaultPayPalApi: CreditPayPalApi = {
    create: createPayPalOrder,
    get: getPayPalOrder,
    capture: capturePayPalOrder
}

function money(value: string | number | undefined) {
    return Number(Number(value ?? 0).toFixed(2))
}

function publicPackage(item: CreditPackage) {
    return {
        id: item.id,
        name: item.name,
        credits: item.creditAmount,
        price: money(item.price),
        currency: item.currency
    }
}

function publicPurchase(item: CreditPurchase) {
    return {
        id: Number(item.id),
        packageId: item.packageId,
        packageName: item.packageNameSnapshot,
        credits: item.creditAmount,
        price: money(item.price),
        currency: item.currency,
        paypalOrderId: item.paypalOrderId,
        status: item.status,
        creditsGranted: item.creditsGranted,
        capturedAt: item.capturedAt,
        creditsGrantedAt: item.creditsGrantedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
    }
}

export async function listActiveCreditPackages() {
    const packages = await CreditPackage.findAll({ where: { active: true }, order: [['sortOrder', 'ASC'], ['creditAmount', 'ASC']] })
    return packages.map(publicPackage)
}

function purchaseReference(purchaseId: number) {
    return `CREDIT-${purchaseId}`
}

async function findOwnedPurchase(userId: number, purchaseId: number, transaction?: Transaction, lock = false) {
    const purchase = await CreditPurchase.findOne({
        where: { id: purchaseId, userId },
        transaction,
        ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {})
    })
    if (!purchase) throw new HttpError(404, 'Credit purchase not found.')
    return purchase
}

export async function createCreditPurchase(
    userId: number,
    packageId: string,
    idempotencyKey: string,
    paypal: CreditPayPalApi = defaultPayPalApi
) {
    let purchase = await CreditPurchase.findOne({ where: { userId, idempotencyKey } })
    if (purchase && purchase.packageId !== packageId) {
        throw new HttpError(409, 'This request key was already used for another credit package.')
    }

    if (!purchase) {
        const selectedPackage = await CreditPackage.findByPk(packageId)
        if (!selectedPackage || !selectedPackage.active) throw new HttpError(409, 'This credit package is not currently available.')
        try {
            purchase = await CreditPurchase.create({
                userId,
                packageId: selectedPackage.id,
                packageNameSnapshot: selectedPackage.name,
                creditAmount: selectedPackage.creditAmount,
                price: selectedPackage.price,
                currency: selectedPackage.currency,
                status: CreditPurchaseStatus.CREATED,
                creditsGranted: false,
                idempotencyKey
            })
        } catch (error) {
            purchase = await CreditPurchase.findOne({ where: { userId, idempotencyKey } })
            if (!purchase) throw error
            if (purchase.packageId !== packageId) throw new HttpError(409, 'This request key was already used for another credit package.')
        }
    }

    if (purchase.paypalOrderId || purchase.creditsGranted) return publicPurchase(purchase)

    try {
        return await getDatabase().transaction(async transaction => {
            const locked = await findOwnedPurchase(userId, Number(purchase!.id), transaction, true)
            if (locked.paypalOrderId || locked.creditsGranted) return publicPurchase(locked)

            const providerOrder = await paypal.create({
                referenceId: purchaseReference(Number(locked.id)),
                description: `${locked.creditAmount} AI design credits`,
                total: money(locked.price),
                currency: locked.currency,
                items: [{ name: `${locked.packageNameSnapshot} — ${locked.creditAmount} AI credits`, quantity: 1, unitPrice: money(locked.price) }]
            })
            if (!providerOrder?.id) throw new HttpError(502, 'PayPal did not create the credit purchase. Please try again.')
            await locked.update({
                paypalOrderId: providerOrder.id,
                status: CreditPurchaseStatus.CREATED,
                providerMetadata: { orderStatus: String(providerOrder.status ?? 'CREATED') }
            }, { transaction })
            return publicPurchase(locked)
        })
    } catch (error) {
        await CreditPurchase.update(
            { status: CreditPurchaseStatus.FAILED, providerMetadata: { safeError: 'PAYPAL_ORDER_CREATION_FAILED' } },
            { where: { id: purchase.id, creditsGranted: false, paypalOrderId: null } }
        )
        if (error instanceof HttpError) throw error
        throw new HttpError(502, 'PayPal could not start this credit purchase. Please try again.')
    }
}

function paypalPurchaseUnit(paypalOrder: any, referenceId: string) {
    return (paypalOrder?.purchase_units ?? []).find((unit: any) => unit.reference_id === referenceId)
}

function completedCapture(captureResponse: any) {
    const captures = (captureResponse?.purchase_units ?? []).flatMap((unit: any) => unit?.payments?.captures ?? [])
    return captures.find((capture: any) => capture.status === 'COMPLETED')
}

function assertPurchaseAmount(actualValue: unknown, actualCurrency: unknown, purchase: CreditPurchase) {
    if (money(String(actualValue)) !== money(purchase.price)) {
        throw new HttpError(409, 'PayPal returned an amount that does not match this credit purchase.')
    }
    if (String(actualCurrency).toUpperCase() !== purchase.currency.toUpperCase()) {
        throw new HttpError(409, 'PayPal returned a currency that does not match this credit purchase.')
    }
}

type CaptureOutcome = { error?: HttpError; purchase: ReturnType<typeof publicPurchase>; balance?: number; idempotent?: boolean }

export async function captureCreditPurchase(
    userId: number,
    purchaseId: number,
    providerOrderId: string,
    paypal: CreditPayPalApi = defaultPayPalApi
) {
    const result: CaptureOutcome = await getDatabase().transaction(async transaction => {
        const purchase = await findOwnedPurchase(userId, purchaseId, transaction, true)
        if (!purchase.paypalOrderId || purchase.paypalOrderId !== providerOrderId) {
            throw new HttpError(403, 'This PayPal order does not belong to your credit purchase.')
        }

        if (purchase.creditsGranted && purchase.status === CreditPurchaseStatus.CAPTURED) {
            const account = await CreditAccount.findOne({ where: { userId }, transaction })
            return { purchase: publicPurchase(purchase), balance: account?.balance ?? 0, idempotent: true }
        }

        const providerOrder = await paypal.get(providerOrderId)
        const unit = paypalPurchaseUnit(providerOrder, purchaseReference(Number(purchase.id)))
        if (!unit) throw new HttpError(409, 'PayPal order reference does not match this credit purchase.')
        assertPurchaseAmount(unit.amount?.value, unit.amount?.currency_code, purchase)

        const providerStatus = String(providerOrder.status ?? '').toUpperCase()
        if (['VOIDED', 'CANCELLED'].includes(providerStatus)) {
            await purchase.update({ status: CreditPurchaseStatus.CANCELLED, providerMetadata: { orderStatus: providerStatus } }, { transaction })
            return { purchase: publicPurchase(purchase), error: new HttpError(409, 'This PayPal payment was cancelled. No credits were added.') }
        }
        if (!['APPROVED', 'COMPLETED'].includes(providerStatus)) {
            await purchase.update({ status: CreditPurchaseStatus.FAILED, providerMetadata: { orderStatus: providerStatus || 'UNKNOWN' } }, { transaction })
            return { purchase: publicPurchase(purchase), error: new HttpError(409, 'PayPal has not approved this credit purchase. No credits were added.') }
        }

        await purchase.update({ status: CreditPurchaseStatus.APPROVED, providerMetadata: { orderStatus: providerStatus } }, { transaction })
        let captureResponse: any = providerStatus === 'COMPLETED' ? providerOrder : undefined
        if (!captureResponse) {
            try {
                captureResponse = await paypal.capture(providerOrderId, `credit-purchase-${purchase.id}`)
            } catch {
                await purchase.update({ status: CreditPurchaseStatus.FAILED, providerMetadata: { safeError: 'PAYPAL_CAPTURE_FAILED' } }, { transaction })
                return { purchase: publicPurchase(purchase), error: new HttpError(502, 'PayPal could not complete this payment. No credits were added.') }
            }
        }
        const capture = completedCapture(captureResponse)
        if (!capture || String(captureResponse?.status).toUpperCase() !== 'COMPLETED') {
            await purchase.update({ status: CreditPurchaseStatus.FAILED, providerMetadata: { captureStatus: String(captureResponse?.status ?? 'UNKNOWN') } }, { transaction })
            return { purchase: publicPurchase(purchase), error: new HttpError(409, 'PayPal did not complete this payment. No credits were added.') }
        }
        assertPurchaseAmount(capture.amount?.value, capture.amount?.currency_code, purchase)

        const duplicateCapture = await CreditPurchase.findOne({
            where: { paypalCaptureId: capture.id }, transaction, lock: transaction.LOCK.UPDATE
        })
        if (duplicateCapture && Number(duplicateCapture.id) !== Number(purchase.id)) {
            throw new HttpError(409, 'This PayPal capture is already linked to another credit purchase.')
        }

        const account = await CreditAccount.findOne({ where: { userId }, transaction, lock: transaction.LOCK.UPDATE })
        if (!account) throw new HttpError(409, 'Your credit account is unavailable. Please contact support.')
        const existingTransaction = await CreditTransaction.findOne({ where: { creditPurchaseId: purchase.id }, transaction })
        if (existingTransaction) {
            await purchase.update({
                paypalCaptureId: capture.id,
                status: CreditPurchaseStatus.CAPTURED,
                creditsGranted: true,
                capturedAt: purchase.capturedAt ?? new Date(),
                creditsGrantedAt: purchase.creditsGrantedAt ?? new Date(),
                providerMetadata: { orderStatus: 'COMPLETED', captureStatus: 'COMPLETED' }
            }, { transaction })
            return { purchase: publicPurchase(purchase), balance: account.balance, idempotent: true }
        }

        const before = account.balance
        const after = before + purchase.creditAmount
        await account.update({ balance: after }, { transaction })
        const capturedAt = capture.create_time ? new Date(capture.create_time) : new Date()
        await CreditTransaction.create({
            creditAccountId: account.id,
            userId,
            amount: purchase.creditAmount,
            balanceBefore: before,
            balanceAfter: after,
            reason: CreditTransactionReason.PURCHASE,
            referenceId: `paypal-capture:${capture.id}`,
            creditPurchaseId: purchase.id,
            idempotencyKey: `credit-purchase:${purchase.id}`,
            metadata: { description: `${purchase.packageNameSnapshot} credit purchase` }
        }, { transaction })
        await purchase.update({
            paypalCaptureId: capture.id,
            status: CreditPurchaseStatus.CAPTURED,
            creditsGranted: true,
            capturedAt,
            creditsGrantedAt: new Date(),
            providerMetadata: { orderStatus: 'COMPLETED', captureStatus: 'COMPLETED' }
        }, { transaction })
        return { purchase: publicPurchase(purchase), balance: after, idempotent: false }
    })
    if (result.error) throw result.error
    return result
}

export async function cancelCreditPurchase(userId: number, purchaseId: number, providerOrderId?: string) {
    return getDatabase().transaction(async transaction => {
        const purchase = await findOwnedPurchase(userId, purchaseId, transaction, true)
        if (providerOrderId && purchase.paypalOrderId !== providerOrderId) {
            throw new HttpError(403, 'This PayPal order does not belong to your credit purchase.')
        }
        if (purchase.creditsGranted || purchase.status === CreditPurchaseStatus.CAPTURED) {
            throw new HttpError(409, 'Completed credit purchases cannot be cancelled.')
        }
        await purchase.update({ status: CreditPurchaseStatus.CANCELLED, providerMetadata: { orderStatus: 'CANCELLED_BY_USER' } }, { transaction })
        return publicPurchase(purchase)
    })
}

function transactionDescription(transaction: CreditTransaction) {
    const metadata = transaction.metadata as { description?: string; reason?: string } | undefined
    switch (transaction.reason) {
        case CreditTransactionReason.FREE_PROJECT: return 'Free AI project allowance'
        case CreditTransactionReason.GENERATION: return 'AI artwork generation'
        case CreditTransactionReason.REVISION: return 'AI artwork revision'
        case CreditTransactionReason.PURCHASE: return metadata?.description ?? 'Purchased AI credits'
        case CreditTransactionReason.ADMIN_ADJUSTMENT: return `Admin adjustment: ${metadata?.reason ?? 'Account correction'}`
        case CreditTransactionReason.ORDER_REWARD: return 'Completed phone-case order reward'
        case CreditTransactionReason.REFUND: return 'Credit purchase refund adjustment'
        case CreditTransactionReason.PROMOTION: return 'Promotional AI credits'
    }
}

function publicTransaction(transaction: CreditTransaction) {
    return {
        id: Number(transaction.id),
        date: transaction.createdAt,
        type: transaction.reason,
        amount: transaction.amount,
        balanceAfter: transaction.balanceAfter,
        description: transactionDescription(transaction),
        related: {
            ...(transaction.aiDesignId ? { designId: Number(transaction.aiDesignId) } : {}),
            ...(transaction.creditPurchaseId ? { purchaseId: Number(transaction.creditPurchaseId) } : {}),
            ...(transaction.orderId ? { orderId: Number(transaction.orderId) } : {})
        }
    }
}

export async function getCreditHistory(userId: number) {
    const account = await CreditAccount.findOne({ where: { userId } })
    const [transactions, purchases] = await Promise.all([
        CreditTransaction.findAll({
            where: { userId },
            order: [['createdAt', 'DESC'], ['id', 'DESC']],
            limit: 200
        }),
        CreditPurchase.findAll({
            where: { userId },
            order: [['createdAt', 'DESC'], ['id', 'DESC']],
            limit: 100
        })
    ])
    return {
        balance: account?.balance ?? 0,
        transactions: transactions.map(publicTransaction),
        purchases: purchases.map(purchase => ({
            id: Number(purchase.id),
            packageName: purchase.packageNameSnapshot,
            credits: purchase.creditAmount,
            price: money(purchase.price),
            currency: purchase.currency,
            status: purchase.status,
            creditsGranted: purchase.creditsGranted,
            createdAt: purchase.createdAt,
            capturedAt: purchase.capturedAt
        }))
    }
}

export async function getAdminUserCredits(userId: number) {
    const user = await User.findByPk(userId, { include: [CreditAccount] })
    if (!user) throw new HttpError(404, 'User account not found.')
    const history = await getCreditHistory(userId)
    return { user: { id: Number(user.id), name: user.name, email: user.email }, ...history }
}

export async function adjustUserCredits(adminUserId: number, userId: number, amount: number, reason: string) {
    return getDatabase().transaction(async transaction => {
        const user = await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE })
        if (!user) throw new HttpError(404, 'User account not found.')
        const account = await CreditAccount.findOne({ where: { userId }, transaction, lock: transaction.LOCK.UPDATE })
        if (!account) throw new HttpError(409, 'This user does not have a credit account.')
        const before = account.balance
        const after = before + amount
        if (after < 0) throw new HttpError(409, 'This adjustment would make the credit balance negative.')
        await account.update({ balance: after }, { transaction })
        const entry = await CreditTransaction.create({
            creditAccountId: account.id,
            userId,
            adminUserId,
            amount,
            balanceBefore: before,
            balanceAfter: after,
            reason: CreditTransactionReason.ADMIN_ADJUSTMENT,
            referenceId: `admin-adjustment:${randomUUID()}`,
            metadata: { reason }
        }, { transaction })
        return { balance: after, transaction: publicTransaction(entry) }
    })
}

function rewardAmount(setting: SystemSetting | null) {
    const value = setting?.value as { credits?: unknown } | number | null
    const candidate = typeof value === 'number' ? value : Number(value?.credits ?? 0)
    return Number.isInteger(candidate) && candidate > 0 ? candidate : 0
}

export async function grantCompletedOrderReward(orderId: number, transaction?: Transaction) {
    const execute = async (activeTransaction: Transaction) => {
        const order = await Order.findByPk(orderId, { transaction: activeTransaction, lock: activeTransaction.LOCK.UPDATE })
        if (!order || order.status !== OrderStatus.DELIVERED || order.paymentStatus !== PaymentStatus.CAPTURED) return { granted: false, credits: 0 }
        const [capturedPayment, itemCount] = await Promise.all([
            Payment.findOne({ where: { orderId, status: PaymentStatus.CAPTURED }, transaction: activeTransaction }),
            OrderItem.count({ where: { orderId }, transaction: activeTransaction })
        ])
        if (!capturedPayment || itemCount < 1) return { granted: false, credits: 0 }
        const setting = await SystemSetting.findByPk('phone_case_purchase_reward_credits', { transaction: activeTransaction })
        const credits = rewardAmount(setting)
        if (!credits) return { granted: false, credits: 0 }
        const existing = await CreditTransaction.findOne({
            where: { orderId, reason: CreditTransactionReason.ORDER_REWARD }, transaction: activeTransaction
        })
        if (existing) return { granted: false, credits: existing.amount, idempotent: true }
        const account = await CreditAccount.findOne({ where: { userId: order.userId }, transaction: activeTransaction, lock: activeTransaction.LOCK.UPDATE })
        if (!account) return { granted: false, credits: 0 }
        const before = account.balance
        const after = before + credits
        await account.update({ balance: after }, { transaction: activeTransaction })
        await CreditTransaction.create({
            creditAccountId: account.id,
            userId: order.userId,
            orderId: order.id,
            amount: credits,
            balanceBefore: before,
            balanceAfter: after,
            reason: CreditTransactionReason.ORDER_REWARD,
            referenceId: `order-reward:${order.id}`,
            idempotencyKey: `order-reward:${order.id}`,
            metadata: { description: 'Completed phone-case order reward' }
        }, { transaction: activeTransaction })
        return { granted: true, credits, balance: after }
    }
    return transaction ? execute(transaction) : getDatabase().transaction(execute)
}

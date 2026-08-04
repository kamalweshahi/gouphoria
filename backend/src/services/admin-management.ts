import { Op, QueryTypes } from 'sequelize'
import { AdminNote } from '../database/models/admin-note'
import { AIDesign } from '../database/models/ai-design'
import { CommerceAudit } from '../database/models/commerce-audit'
import { CreditAccount } from '../database/models/credit-account'
import { CreditPurchase } from '../database/models/credit-purchase'
import { CreditTransaction } from '../database/models/credit-transaction'
import { Order } from '../database/models/order'
import { OrderItem } from '../database/models/order-item'
import { Payment } from '../database/models/payment'
import { PrintifyWebhookEvent } from '../database/models/printify-webhook-event'
import { Product } from '../database/models/product'
import { ProductVariant } from '../database/models/product-variant'
import { ShippingQuote } from '../database/models/shipping-quote'
import { User } from '../database/models/user'
import { UserSession } from '../database/models/user-session'
import { AdminNoteVisibility, CommerceItemType, OrderItemStatus, PaymentStatus, UserRole, UserStatus } from '../database/models/model-enums'
import { getDatabase } from '../database/database'
import HttpError from '../errors/http-error'
import { mimeTypeForStorageKey, privateStorage, type PrivateStorageService } from './ai-storage'
import { fulfillOrderByItemType, synchronizeOrderByItemType, type OrderFulfillmentOptions } from './order-fulfillment'
import { Address } from '../database/models/address'

interface PageInput {
    page?: number
    pageSize?: number
    search?: string
    sort?: string
    direction?: 'asc' | 'desc'
}

function pageValues(input: PageInput) {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20
    return { page, pageSize, offset: (page - 1) * pageSize }
}

function safeUser(user: User) {
    return {
        id: Number(user.id),
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt
    }
}

export async function listAdminCustomers(input: PageInput & { status?: UserStatus; role?: UserRole; hasOrders?: boolean; hasDesigns?: boolean }) {
    const { page, pageSize, offset } = pageValues(input)
    const search = input.search?.trim()
    const where: any = {
        ...(input.status ? { status: input.status } : {}),
        ...(input.role ? { role: input.role } : {}),
        ...(search ? { [Op.or]: [
            ...(/^\d+$/.test(search) ? [{ id: Number(search) }] : []),
            { name: { [Op.like]: `%${search}%` } },
            { email: { [Op.like]: `%${search}%` } }
        ] } : {})
    }
    const userFilters: any[] = []
    if (input.hasOrders !== undefined) {
        const orderUsers = await Order.findAll({ attributes: ['userId'], group: ['userId'], raw: true }) as unknown as Array<{ userId: number }>
        userFilters.push({ id: { [input.hasOrders ? Op.in : Op.notIn]: orderUsers.map(row => row.userId) } })
    }
    if (input.hasDesigns !== undefined) {
        const designUsers = await AIDesign.findAll({ attributes: ['userId'], group: ['userId'], raw: true }) as unknown as Array<{ userId: number }>
        userFilters.push({ id: { [input.hasDesigns ? Op.in : Op.notIn]: designUsers.map(row => row.userId) } })
    }
    if (userFilters.length) where[Op.and] = userFilters
    const sortFields: Record<string, string> = { name: 'name', email: 'email', createdAt: 'createdAt', lastLoginAt: 'lastLoginAt', status: 'status', role: 'role' }
    const { rows, count } = await User.findAndCountAll({
        where,
        include: [CreditAccount],
        distinct: true,
        order: [[sortFields[input.sort ?? 'createdAt'] ?? 'createdAt', input.direction === 'asc' ? 'ASC' : 'DESC']],
        limit: pageSize,
        offset
    })
    const userIds = rows.map(user => Number(user.id))
    const [orderMetrics, designMetrics] = userIds.length ? await Promise.all([
        getDatabase().query<{
            userId: number; orders: number; paidOrders: number; totalSpending: string; lastOrderAt?: Date
        }>(
            `SELECT user_id AS userId, COUNT(*) AS orders,
                SUM(CASE WHEN payment_status = 'captured' THEN 1 ELSE 0 END) AS paidOrders,
                SUM(CASE WHEN payment_status = 'captured' THEN total_amount ELSE 0 END) AS totalSpending,
                MAX(created_at) AS lastOrderAt
             FROM orders WHERE user_id IN (:userIds) GROUP BY user_id`,
            { replacements: { userIds }, type: QueryTypes.SELECT }
        ),
        getDatabase().query<{ userId: number; savedDesigns: number }>(
            'SELECT user_id AS userId, COUNT(*) AS savedDesigns FROM ai_designs WHERE user_id IN (:userIds) GROUP BY user_id',
            { replacements: { userIds }, type: QueryTypes.SELECT }
        )
    ]) : [[], []]
    const ordersByUser = new Map(orderMetrics.map(metric => [Number(metric.userId), metric]))
    const designsByUser = new Map(designMetrics.map(metric => [Number(metric.userId), Number(metric.savedDesigns)]))
    const customers = rows.map(user => {
        const metrics = ordersByUser.get(Number(user.id))
        return {
            ...safeUser(user),
            metrics: {
                orders: Number(metrics?.orders ?? 0),
                paidOrders: Number(metrics?.paidOrders ?? 0),
                totalSpending: Number(metrics?.totalSpending ?? 0),
                savedDesigns: designsByUser.get(Number(user.id)) ?? 0,
                creditBalance: user.creditAccount?.balance ?? 0,
                lastOrderAt: metrics?.lastOrderAt
            }
        }
    })
    return { customers, pagination: { page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) } }
}

function adminItem(item: OrderItem) {
    return {
        id: Number(item.id),
        itemType: item.itemType,
        status: item.status,
        productTitle: item.productTitle,
        variantTitle: item.variantTitle,
        phoneModel: item.phoneModel,
        caseType: item.caseType,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        currency: item.currency,
        aiDesignId: item.aiDesignId ? Number(item.aiDesignId) : undefined,
        artwork: item.artworkStorageKey ? `/admin/orders/${item.orderId}/items/${item.id}/assets/artwork` : undefined,
        approvedArtwork: item.approvedArtworkStorageKey ? `/admin/orders/${item.orderId}/items/${item.id}/assets/approved-artwork` : undefined,
        mockup: item.mockupStorageKey ? `/admin/orders/${item.orderId}/items/${item.id}/assets/mockup` : undefined,
        printify: {
            productId: item.printifyProductIdSnapshot,
            blueprintId: item.printifyBlueprintIdSnapshot,
            providerId: item.printifyProviderIdSnapshot,
            variantId: item.printifyVariantIdSnapshot,
            uploadId: item.printifyUploadId,
            orderId: item.printifyOrderId,
            status: item.printifyStatus,
            submittedAt: item.fulfillmentSubmittedAt,
            synchronizedAt: item.fulfillmentSyncedAt,
            failure: item.fulfillmentFailureCode
        },
        design: item.aiDesign ? {
            id: Number(item.aiDesign.id),
            prompt: item.aiDesign.prompt,
            revisionPrompt: item.aiDesign.revisionPrompt,
            status: item.aiDesign.status,
            approvalStatus: item.aiDesign.approvalStatus,
            generationCount: item.aiDesign.generationCount
        } : undefined
    }
}

function adminOrderSummary(order: Order) {
    const quantity = (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0)
    const standardItems = (order.items ?? []).filter(item => item.itemType === CommerceItemType.STANDARD).length
    const customItems = (order.items ?? []).filter(item => item.itemType === CommerceItemType.AI_CUSTOM).length
    return {
        id: Number(order.id),
        orderNumber: order.orderNumber,
        customer: order.user ? safeUser(order.user) : undefined,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        products: [...new Set((order.items ?? []).map(item => item.productTitle))],
        quantity,
        itemCount: (order.items ?? []).length,
        standardItems,
        customItems,
        orderKind: standardItems && customItems ? 'mixed' : customItems ? 'ai_custom' : 'standard',
        awaitingReview: (order.items ?? []).some(item => item.status === OrderItemStatus.PENDING_DESIGN_REVIEW),
        subtotal: Number(order.subtotal),
        shipping: Number(order.shippingAmount),
        total: Number(order.totalAmount),
        currency: order.currency,
        paymentStatus: order.paymentStatus,
        status: order.status,
        fulfillmentStatus: order.fulfillmentStatus,
        printifyStatus: order.printifyStatus,
        shippingStatus: ['shipped', 'delivered'].includes(order.fulfillmentStatus) ? order.fulfillmentStatus
            : order.fulfillmentStatus === 'partial' ? 'partially_shipped' : 'not_shipped',
        trackingNumber: order.trackingNumber,
        paypalOrderId: order.paypalOrderId,
        printifyOrderId: order.printifyOrderId
    }
}

export async function listAdminOrders(input: PageInput & {
    paymentStatus?: string
    fulfillmentStatus?: string
    printifyStatus?: string
    orderStatus?: string
    itemType?: 'standard' | 'ai_custom' | 'mixed'
    dateFrom?: string | Date
    dateTo?: string | Date
}) {
    const { page, pageSize, offset } = pageValues(input)
    const where: any = {
        ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
        ...(input.fulfillmentStatus ? { fulfillmentStatus: input.fulfillmentStatus } : {}),
        ...(input.printifyStatus ? { printifyStatus: input.printifyStatus } : {}),
        ...(input.orderStatus ? { status: input.orderStatus } : {}),
        ...((input.dateFrom || input.dateTo) ? { createdAt: {
            ...(input.dateFrom ? { [Op.gte]: new Date(new Date(input.dateFrom).setUTCHours(0, 0, 0, 0)) } : {}),
            ...(input.dateTo ? { [Op.lte]: new Date(new Date(input.dateTo).setUTCHours(23, 59, 59, 999)) } : {})
        } } : {})
    }
    if (input.itemType) {
        const itemRows = await OrderItem.findAll({ attributes: ['orderId', 'itemType'], raw: true }) as unknown as Array<{ orderId: number; itemType: CommerceItemType }>
        const typesByOrder = new Map<number, Set<CommerceItemType>>()
        for (const row of itemRows) {
            const types = typesByOrder.get(Number(row.orderId)) ?? new Set<CommerceItemType>()
            types.add(row.itemType)
            typesByOrder.set(Number(row.orderId), types)
        }
        const matchingOrderIds = [...typesByOrder.entries()]
            .filter(([, types]) => input.itemType === 'mixed'
                ? types.has(CommerceItemType.STANDARD) && types.has(CommerceItemType.AI_CUSTOM)
                : types.has(input.itemType as CommerceItemType))
            .map(([orderId]) => orderId)
        where.id = { [Op.in]: matchingOrderIds.length ? matchingOrderIds : [0] }
    }
    const search = input.search?.trim()
    if (search) where[Op.or] = [
        { orderNumber: { [Op.like]: `%${search}%` } },
        { paypalOrderId: { [Op.like]: `%${search}%` } },
        { printifyOrderId: { [Op.like]: `%${search}%` } },
        { '$user.name$': { [Op.like]: `%${search}%` } },
        { '$user.email$': { [Op.like]: `%${search}%` } }
    ]
    const sortFields: Record<string, string> = { createdAt: 'createdAt', total: 'totalAmount', status: 'status', paymentStatus: 'paymentStatus', fulfillmentStatus: 'fulfillmentStatus' }
    const { rows, count } = await Order.findAndCountAll({
        where,
        include: [User, { model: OrderItem, separate: true }],
        distinct: true,
        subQuery: false,
        order: [[sortFields[input.sort ?? 'createdAt'] ?? 'createdAt', input.direction === 'asc' ? 'ASC' : 'DESC']],
        limit: pageSize,
        offset
    })
    return { orders: rows.map(adminOrderSummary), pagination: { page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) } }
}

async function loadAdminOrder(orderId: number) {
    const order = await Order.findByPk(orderId, {
        include: [
            User,
            Payment,
            ShippingQuote,
            { model: OrderItem, include: [AIDesign, Product, ProductVariant] },
            { model: AdminNote, include: [{ model: User, as: 'adminUser' }] }
        ]
    })
    if (!order?.user) throw new HttpError(404, 'Order not found.')
    return order
}

export async function getAdminOrder(orderId: number) {
    const order = await loadAdminOrder(orderId)
    const [audits, webhookEvents] = await Promise.all([
        CommerceAudit.findAll({ where: { orderId }, include: [{ model: User, as: 'actorUser' }], order: [['createdAt', 'ASC']] }),
        PrintifyWebhookEvent.findAll({
            where: { resourceId: { [Op.in]: [order.printifyOrderId, ...(order.items ?? []).map(item => item.printifyOrderId)].filter(Boolean) } },
            order: [['createdAt', 'ASC']]
        })
    ])
    return {
        ...adminOrderSummary(order),
        customer: safeUser(order.user),
        shippingAddress: order.shippingAddressSnapshot,
        shippingQuote: order.shippingQuote ? {
            id: order.shippingQuote.id,
            context: order.shippingQuote.context,
            createdAt: order.shippingQuote.createdAt,
            expiresAt: order.shippingQuote.expiresAt,
            currency: order.shippingQuote.currency
        } : undefined,
        shippingMethod: { id: order.shippingMethodId, name: order.shippingMethodName, code: order.shippingMethodCode },
        tax: Number(order.taxAmount),
        items: (order.items ?? []).map(adminItem),
        paypal: order.payment ? {
            environment: process.env.PAYPAL_ENV ?? 'sandbox',
            orderId: order.payment.providerOrderId,
            captureId: order.payment.providerTransactionId,
            status: order.payment.status,
            amount: Number(order.payment.amount),
            currency: order.payment.currency,
            capturedAt: order.payment.capturedAt
        } : { environment: process.env.PAYPAL_ENV ?? 'sandbox', orderId: order.paypalOrderId, status: order.paymentStatus },
        printify: {
            mode: process.env.PRINTIFY_FULFILLMENT_MODE ?? 'disabled',
            shopId: order.printifyShopId,
            orderId: order.printifyOrderId,
            status: order.printifyStatus,
            submittedAt: order.fulfillmentSubmittedAt,
            synchronizedAt: order.fulfillmentSyncedAt,
            failure: order.fulfillmentFailureCode,
            tracking: { carrier: order.trackingCarrier, number: order.trackingNumber, url: order.trackingUrl }
        },
        notes: (order.adminNotes ?? []).map(note => ({ id: Number(note.id), note: note.note, action: note.action, admin: note.adminUser?.name, createdAt: note.createdAt })),
        audits: audits.map(audit => ({
            id: Number(audit.id), action: audit.action, statusBefore: audit.statusBefore, statusAfter: audit.statusAfter,
            actor: audit.actorUser?.name, metadata: audit.metadata, createdAt: audit.createdAt
        })),
        webhookEvents: webhookEvents.map(event => ({ id: event.id, topic: event.topic, outcome: event.outcome, createdAt: event.createdAt }))
    }
}

export async function getAdminCustomer(userId: number) {
    const user = await User.findByPk(userId, { include: [CreditAccount] })
    if (!user) throw new HttpError(404, 'Customer not found.')
    const orders = await Order.findAll({ where: { userId }, include: [OrderItem], order: [['createdAt', 'DESC']] })
    const designs = await AIDesign.findAll({ where: { userId }, include: [Product, ProductVariant], order: [['createdAt', 'DESC']] })
    const [transactions, purchases, notes, audits, addresses, activeSessions] = await Promise.all([
        CreditTransaction.findAll({ where: { userId }, order: [['createdAt', 'DESC']] }),
        CreditPurchase.findAll({ where: { userId }, order: [['createdAt', 'DESC']] }),
        AdminNote.findAll({ where: { targetUserId: userId }, include: [{ model: User, as: 'adminUser' }], order: [['createdAt', 'DESC']] }),
        CommerceAudit.findAll({
            where: {
                [Op.or]: [
                    { actorUserId: userId },
                    ...(orders.length ? [{ orderId: { [Op.in]: orders.map(order => order.id) } }] : []),
                    ...(designs.length ? [{ aiDesignId: { [Op.in]: designs.map(design => design.id) } }] : [])
                ]
            },
            order: [['createdAt', 'DESC']],
            limit: 200
        }),
        Address.findAll({ where: { userId }, order: [['isDefault', 'DESC'], ['createdAt', 'DESC']] }),
        UserSession.count({ where: { userId, revokedAt: null, expiresAt: { [Op.gt]: new Date() } } })
    ])
    return {
        user: safeUser(user),
        creditBalance: user.creditAccount?.balance ?? 0,
        activeSessions,
        addresses: addresses.map(address => ({
            id: Number(address.id), recipientName: address.recipientName, line1: address.line1, line2: address.line2,
            city: address.city, state: address.state, postalCode: address.postalCode, countryCode: address.countryCode,
            phone: address.phone, isDefault: address.isDefault
        })),
        orders: orders.map(adminOrderSummary),
        designs: designs.map(design => ({
            id: Number(design.id), prompt: design.prompt, status: design.status, approvalStatus: design.approvalStatus,
            product: design.product?.displayName || design.product?.title,
            phoneModel: design.productVariant?.phoneModel,
            caseType: design.productVariant?.caseType,
            createdAt: design.createdAt
        })),
        creditTransactions: transactions.map(transaction => ({
            id: Number(transaction.id), amount: transaction.amount, balanceBefore: transaction.balanceBefore,
            balanceAfter: transaction.balanceAfter, reason: transaction.reason, referenceId: transaction.referenceId,
            metadata: transaction.metadata, createdAt: transaction.createdAt
        })),
        creditPurchases: purchases.map(purchase => ({
            id: Number(purchase.id), packageName: purchase.packageNameSnapshot, credits: purchase.creditAmount,
            price: Number(purchase.price), currency: purchase.currency, status: purchase.status,
            paypalOrderId: purchase.paypalOrderId, capturedAt: purchase.capturedAt, createdAt: purchase.createdAt
        })),
        notes: notes.map(note => ({ id: Number(note.id), note: note.note, admin: note.adminUser?.name, createdAt: note.createdAt })),
        audits: audits.map(audit => ({ id: Number(audit.id), action: audit.action, statusBefore: audit.statusBefore, statusAfter: audit.statusAfter, metadata: audit.metadata, createdAt: audit.createdAt }))
    }
}

export async function updateAdminCustomerStatus(adminUserId: number, userId: number, status: UserStatus) {
    if (adminUserId === userId && status !== UserStatus.ACTIVE) throw new HttpError(422, 'You cannot deactivate your own admin account.')
    const user = await User.findByPk(userId)
    if (!user) throw new HttpError(404, 'Customer not found.')
    const before = user.status
    await getDatabase().transaction(async transaction => {
        await user.update({ status }, { transaction })
        if (status !== UserStatus.ACTIVE) {
            await UserSession.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null }, transaction })
        }
        await CommerceAudit.create({ actorUserId: adminUserId, action: 'customer_status_changed', statusBefore: before, statusAfter: status, metadata: { targetUserId: userId } }, { transaction })
    })
    return safeUser(user)
}

export async function addAdminCustomerNote(adminUserId: number, userId: number, note: string) {
    const user = await User.findByPk(userId)
    if (!user) throw new HttpError(404, 'Customer not found.')
    const created = await AdminNote.create({ adminUserId, targetUserId: userId, note: note.trim(), action: 'customer_note', visibility: 'internal' })
    await CommerceAudit.create({ actorUserId: adminUserId, action: 'customer_note_added', metadata: { targetUserId: userId, noteId: Number(created.id) } })
    return { id: Number(created.id), note: created.note, createdAt: created.createdAt }
}

export async function addAdminOrderNote(adminUserId: number, orderId: number, note: string) {
    const order = await Order.findByPk(orderId)
    if (!order) throw new HttpError(404, 'Order not found.')
    const created = await AdminNote.create({
        adminUserId, orderId, note: note.trim(), action: 'order_note', visibility: AdminNoteVisibility.INTERNAL
    })
    await CommerceAudit.create({
        actorUserId: adminUserId, orderId, action: 'order_note_added', metadata: { noteId: Number(created.id) }
    })
    return { id: Number(created.id), note: created.note, createdAt: created.createdAt }
}

export async function retryAdminOrderFulfillment(
    adminUserId: number,
    orderId: number,
    options: OrderFulfillmentOptions = {}
) {
    const result = await fulfillOrderByItemType(orderId, adminUserId, options)
    await CommerceAudit.create({
        actorUserId: adminUserId,
        orderId,
        action: 'admin_fulfillment_retry',
        metadata: { result: result.status, mode: result.mode, orderKind: result.orderKind }
    })
    return result
}

export async function syncAdminOrderFulfillment(
    adminUserId: number,
    orderId: number,
    options: Pick<OrderFulfillmentOptions, 'standardApi' | 'aiApi'> = {}
) {
    const result = await synchronizeOrderByItemType(orderId, adminUserId, options)
    await CommerceAudit.create({
        actorUserId: adminUserId,
        orderId,
        action: 'admin_fulfillment_sync',
        metadata: { fulfillmentStatus: result.status, standard: Boolean(result.standard), customItems: result.custom.length }
    })
    return result
}

export async function readAdminOrderItemAsset(
    orderId: number,
    itemId: number,
    kind: 'artwork' | 'approved-artwork' | 'mockup',
    storage: PrivateStorageService = privateStorage
) {
    const item = await OrderItem.findOne({ where: { id: itemId, orderId } })
    if (!item) throw new HttpError(404, 'Order artwork was not found.')
    const key = kind === 'mockup' ? item.mockupStorageKey : kind === 'approved-artwork' ? item.approvedArtworkStorageKey : item.artworkStorageKey
    if (!key) throw new HttpError(404, 'Order artwork was not found.')
    return { bytes: await storage.read(key), mimeType: mimeTypeForStorageKey(key) }
}

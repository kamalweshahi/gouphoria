import { Op } from 'sequelize'
import { AdminNote } from '../database/models/admin-note'
import { AIDesign } from '../database/models/ai-design'
import { CommerceAudit } from '../database/models/commerce-audit'
import {
    AIApprovalStatus,
    AIDesignStatus,
    AdminNoteVisibility,
    AdminReviewAction,
    CommerceItemType,
    FulfillmentStatus,
    OrderItemStatus,
    PaymentStatus
} from '../database/models/model-enums'
import { Order } from '../database/models/order'
import { OrderItem } from '../database/models/order-item'
import { Payment } from '../database/models/payment'
import { Product } from '../database/models/product'
import { ProductVariant } from '../database/models/product-variant'
import { UploadedImage } from '../database/models/uploaded-image'
import { User } from '../database/models/user'
import { getDatabase } from '../database/database'
import HttpError from '../errors/http-error'
import { assertAIDesignTransition } from './ai-designs'
import { fulfillAIOrderItem } from './ai-fulfillment'
import { mimeTypeForStorageKey, privateStorage, type PrivateStorageService } from './ai-storage'
import { assertOrderItemTransition, refreshOrderAggregate } from './order-item-state'

export type ReviewDecision = 'approve' | 'reject' | 'changes_requested'

const reviewIncludes = [
    { model: Order, include: [User, Payment] },
    { model: AIDesign, include: [UploadedImage] },
    Product,
    ProductVariant,
    { model: AdminNote, include: [{ model: User, as: 'adminUser' }] }
]

function safeAdmin(item: OrderItem) {
    const order = item.order!
    const design = item.aiDesign!
    return {
        itemId: Number(item.id),
        orderId: Number(order.id),
        orderNumber: order.orderNumber,
        customer: order.user ? { id: Number(order.user.id), name: order.user.name, email: order.user.email } : undefined,
        paymentStatus: order.paymentStatus,
        orderStatus: order.status,
        itemStatus: item.status,
        quantity: item.quantity,
        submittedAt: order.paidAt ?? order.createdAt,
        product: { id: item.printifyProductIdSnapshot, title: item.productTitle },
        variant: { id: item.printifyVariantIdSnapshot, title: item.variantTitle, phoneModel: item.phoneModel, caseType: item.caseType },
        pricing: { basePrice: Number(item.basePrice), unitPrice: Number(item.unitPrice), currency: item.currency },
        design: {
            id: Number(design.id), prompt: design.prompt, revisionPrompt: design.revisionPrompt,
            status: design.status, approvalStatus: design.approvalStatus,
            generationCount: design.generationCount,
            artwork: `/admin/ai-reviews/${item.id}/assets/artwork`,
            mockup: `/admin/ai-reviews/${item.id}/assets/mockup`,
            uploads: (design.uploadedImages ?? []).map(upload => ({ id: Number(upload.id), url: `/admin/ai-reviews/${item.id}/uploads/${upload.id}` }))
        },
        notes: [...(item.adminNotes ?? [])].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(note => ({
            id: Number(note.id), note: note.note, visibility: note.visibility, action: note.action,
            statusBefore: note.statusBefore, statusAfter: note.statusAfter,
            admin: note.adminUser ? { id: Number(note.adminUser.id), name: note.adminUser.name } : undefined,
            createdAt: note.createdAt
        })),
        fulfillment: {
            printifyOrderId: item.printifyOrderId,
            printifyStatus: item.printifyStatus,
            failed: item.status === OrderItemStatus.FULFILLMENT_FAILED,
            retryable: item.status === OrderItemStatus.FULFILLMENT_FAILED
        }
    }
}

async function loadReview(itemId: number) {
    const item = await OrderItem.findOne({ where: { id: itemId, itemType: CommerceItemType.AI_CUSTOM }, include: reviewIncludes })
    if (!item?.order || !item.aiDesign) throw new HttpError(404, 'AI review item not found.')
    return item
}

export async function listAIReviewQueue(input: { page?: number; pageSize?: number; status?: string } = {}) {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20
    const result = await OrderItem.findAndCountAll({
        where: {
            itemType: CommerceItemType.AI_CUSTOM,
            ...(input.status ? { status: input.status } : {})
        },
        include: reviewIncludes,
        distinct: true,
        order: [['createdAt', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize
    })
    return {
        reviews: result.rows.filter(item => item.order && item.aiDesign).map(safeAdmin),
        pagination: { page, pageSize, total: result.count, totalPages: Math.ceil(result.count / pageSize) }
    }
}

export async function getAIReview(itemId: number) {
    return safeAdmin(await loadReview(itemId))
}

export async function getAdminDashboard() {
    const [
        pendingReviews, changeRequested, approvedDesigns, rejectedDesigns, fulfillmentFailures,
        paidAwaitingFulfillment, inProduction, shippedOrders, paymentIssues, customers,
        activeProducts, disabledProducts, disabledVariants, recentOrders
    ] = await Promise.all([
        OrderItem.count({ where: { itemType: CommerceItemType.AI_CUSTOM, status: OrderItemStatus.PENDING_DESIGN_REVIEW } }),
        OrderItem.count({ where: { itemType: CommerceItemType.AI_CUSTOM, status: OrderItemStatus.CHANGES_REQUESTED } }),
        OrderItem.count({ where: { itemType: CommerceItemType.AI_CUSTOM, status: { [Op.in]: [OrderItemStatus.APPROVED_FOR_PRINT, OrderItemStatus.SENT_TO_PRINTIFY, OrderItemStatus.IN_PRODUCTION, OrderItemStatus.SHIPPED, OrderItemStatus.DELIVERED] } } }),
        OrderItem.count({ where: { itemType: CommerceItemType.AI_CUSTOM, status: OrderItemStatus.REJECTED } }),
        Order.count({ where: { fulfillmentStatus: FulfillmentStatus.FAILED } }),
        Order.count({ where: { paymentStatus: PaymentStatus.CAPTURED, fulfillmentStatus: { [Op.in]: [FulfillmentStatus.NOT_READY, FulfillmentStatus.READY] } } }),
        Order.count({ where: { fulfillmentStatus: FulfillmentStatus.IN_PRODUCTION } }),
        Order.count({ where: { fulfillmentStatus: { [Op.in]: [FulfillmentStatus.SHIPPED, FulfillmentStatus.DELIVERED] } } }),
        Order.count({ where: { paymentStatus: { [Op.in]: [PaymentStatus.CREATED, PaymentStatus.APPROVED, PaymentStatus.FAILED, PaymentStatus.REFUNDED] } } }),
        User.count(),
        Product.count({ where: { isActive: true, isVisible: true } }),
        Product.count({ where: { [Op.or]: [{ isActive: false }, { isVisible: false }] } }),
        ProductVariant.count({ where: { [Op.or]: [{ isEnabled: false }, { available: false }] } }),
        Order.findAll({ where: { paymentStatus: PaymentStatus.CAPTURED }, include: [User, OrderItem], order: [['paidAt', 'DESC']], limit: 10 })
    ])
    return {
        counts: {
            pendingReviews, changeRequested, approvedDesigns, rejectedDesigns, fulfillmentFailures,
            paidAwaitingFulfillment, inProduction, shippedOrders, paymentIssues, customers,
            activeProducts, disabledProducts, disabledVariants
        },
        recentPaidOrders: recentOrders.map(order => ({
            id: Number(order.id), orderNumber: order.orderNumber, customer: order.user?.name,
            total: Number(order.totalAmount), currency: order.currency, status: order.status,
            customItems: (order.items ?? []).filter(item => item.itemType === CommerceItemType.AI_CUSTOM).length,
            reviewItemId: (order.items ?? []).find(item => item.itemType === CommerceItemType.AI_CUSTOM)?.id,
            paidAt: order.paidAt
        }))
    }
}

export async function reviewAIOrderItem(adminUserId: number, itemId: number, input: {
    decision: ReviewDecision
    note?: string
    internalNote?: string
}, storage: PrivateStorageService = privateStorage) {
    const outcome = await getDatabase().transaction(async transaction => {
        const item = await OrderItem.findByPk(itemId, { include: [Order, AIDesign], transaction, lock: transaction.LOCK.UPDATE })
        if (!item?.order || !item.aiDesign || item.itemType !== CommerceItemType.AI_CUSTOM) throw new HttpError(404, 'AI review item not found.')
        if (item.order.paymentStatus !== PaymentStatus.CAPTURED) throw new HttpError(409, 'Only paid AI items may be reviewed.')
        const target = input.decision === 'approve' ? OrderItemStatus.APPROVED_FOR_PRINT
            : input.decision === 'reject' ? OrderItemStatus.REJECTED : OrderItemStatus.CHANGES_REQUESTED
        if (item.status === target) return { idempotent: true, approved: target === OrderItemStatus.APPROVED_FOR_PRINT }
        if (item.status !== OrderItemStatus.PENDING_DESIGN_REVIEW) throw new HttpError(409, 'This review decision is no longer available.')
        if ((input.decision === 'reject' || input.decision === 'changes_requested') && !input.note?.trim()) {
            throw new HttpError(422, 'A clear customer-visible reason is required for this decision.')
        }
        if (!item.artworkStorageKey || !item.mockupStorageKey || !item.artworkChecksumSha256) {
            throw new HttpError(409, 'The purchased artwork snapshot is incomplete.')
        }
        if (input.decision === 'approve') {
            await readStoredImage(storage, item.artworkStorageKey, 'printable artwork', 409)
        }

        const design = item.aiDesign
        if (design.status !== AIDesignStatus.PENDING_ADMIN_REVIEW) throw new HttpError(409, 'The design is not awaiting admin review.')
        const designTarget = input.decision === 'approve' ? AIDesignStatus.APPROVED_FOR_PRINT
            : input.decision === 'reject' ? AIDesignStatus.REJECTED : AIDesignStatus.CHANGES_REQUESTED
        const approvalTarget = input.decision === 'approve' ? AIApprovalStatus.APPROVED
            : input.decision === 'reject' ? AIApprovalStatus.REJECTED : AIApprovalStatus.CHANGES_REQUESTED
        assertOrderItemTransition(item.status, target)
        assertAIDesignTransition(design.status, designTarget)
        const before = item.status
        await item.update({
            status: target,
            approvedArtworkStorageKey: input.decision === 'approve' ? item.artworkStorageKey : null,
            reviewedByUserId: adminUserId,
            reviewedAt: new Date()
        }, { transaction })
        await design.update({ status: designTarget, approvalStatus: approvalTarget }, { transaction })

        const action = input.decision === 'approve' ? AdminReviewAction.APPROVED_FOR_PRINT
            : input.decision === 'reject' ? AdminReviewAction.REJECTED : AdminReviewAction.CHANGES_REQUESTED
        const notes = [
            ...(input.note?.trim() ? [{ note: input.note.trim(), visibility: AdminNoteVisibility.USER }] : []),
            ...(input.internalNote?.trim() ? [{ note: input.internalNote.trim(), visibility: AdminNoteVisibility.INTERNAL }] : [])
        ]
        for (const note of notes) {
            await AdminNote.create({
                adminUserId, orderId: item.orderId, orderItemId: item.id, aiDesignId: item.aiDesignId,
                note: note.note, visibility: note.visibility, action, statusBefore: before, statusAfter: target
            }, { transaction })
        }
        await CommerceAudit.create({
            actorUserId: adminUserId, orderId: item.orderId, orderItemId: item.id, aiDesignId: item.aiDesignId,
            action, statusBefore: before, statusAfter: target,
            metadata: { customerNoteProvided: Boolean(input.note?.trim()), internalNoteProvided: Boolean(input.internalNote?.trim()) }
        }, { transaction })
        await refreshOrderAggregate(Number(item.orderId), transaction)
        return { idempotent: false, approved: target === OrderItemStatus.APPROVED_FOR_PRINT }
    })

    const fulfillment = outcome.approved ? await fulfillAIOrderItem(itemId, adminUserId) : undefined
    return { review: await getAIReview(itemId), idempotent: outcome.idempotent, fulfillment }
}

export async function readAdminReviewAsset(
    itemId: number,
    kind: 'artwork' | 'mockup',
    storage: PrivateStorageService = privateStorage
) {
    const item = await OrderItem.findOne({ where: { id: itemId, itemType: CommerceItemType.AI_CUSTOM } })
    if (!item) throw new HttpError(404, 'AI review asset not found.')
    const key = kind === 'artwork' ? item.artworkStorageKey : item.mockupStorageKey
    if (!key) throw new HttpError(404, 'AI review asset not found.')
    const mimeType = mimeTypeForStorageKey(key)
    return {
        bytes: await readStoredImage(storage, key, kind === 'artwork' ? 'printable artwork' : 'mockup preview'),
        mimeType,
        filename: `gouphoria-${kind}-${itemId}.${extensionForMimeType(mimeType)}`
    }
}

export async function readAdminReviewUpload(itemId: number, uploadId: number, storage: PrivateStorageService = privateStorage) {
    const item = await OrderItem.findOne({ where: { id: itemId, itemType: CommerceItemType.AI_CUSTOM } })
    if (!item?.aiDesignId) throw new HttpError(404, 'Reference image not found.')
    const upload = await UploadedImage.findOne({ where: { id: uploadId, aiDesignId: item.aiDesignId } })
    if (!upload) throw new HttpError(404, 'Reference image not found.')
    const mimeType = mimeTypeForStorageKey(upload.storageKey)
    return {
        bytes: await readStoredImage(storage, upload.storageKey, 'customer reference image'),
        mimeType,
        filename: `gouphoria-reference-${uploadId}.${extensionForMimeType(mimeType)}`
    }
}

function extensionForMimeType(mimeType: string) {
    if (mimeType === 'image/jpeg') return 'jpg'
    if (mimeType === 'image/webp') return 'webp'
    return 'png'
}

async function readStoredImage(
    storage: PrivateStorageService,
    storageKey: string,
    assetType: string,
    missingStatus = 404
) {
    try {
        return await storage.read(storageKey)
    } catch (error: any) {
        if (error?.code === 'ENOENT' || error?.message === 'Invalid private storage key') {
            throw new HttpError(missingStatus, `The stored ${assetType} file could not be found.`, 'PRIVATE_ASSET_MISSING')
        }
        throw error
    }
}

import { Router } from 'express'
import {
    adjustCredits,
    dashboard,
    decideReview,
    retryAIItem,
    reviewAsset,
    reviewDetails,
    reviewQueue,
    reviewUpload,
    syncAIItem,
    userCredits,
    syncPrintifyWebhooks,
    customers,
    customerDetails,
    changeCustomerStatus,
    addCustomerNote,
    orders,
    orderDetails,
    retryOrderFulfillment,
    syncOrderFulfillment,
    orderItemAsset,
    addOrderNote,
    products,
    productDetails,
    saveProduct,
    productDeletionPreview,
    removeProduct
} from '../controllers/admin/controller'
import { UserRole } from '../database/models/model-enums'
import requireAuthentication from '../middlewares/auth/authentication'
import { authorizeRoles } from '../middlewares/auth/authorization'
import bodyValidation from '../middlewares/body-validation'
import paramsValidation from '../middlewares/params-validation'
import {
    adminCreditAdjustmentSchema,
    adminCreditUserParamsSchema,
    adminCustomerNoteSchema,
    adminCustomerQuerySchema,
    adminCustomerStatusSchema,
    adminOrderAssetParamsSchema,
    adminOrderParamsSchema,
    adminOrderQuerySchema,
    adminProductParamsSchema,
    adminProductUpdateSchema,
    adminProductDeleteSchema,
    adminReviewQuerySchema,
    adminUserParamsSchema,
    reviewAssetParamsSchema,
    reviewDecisionSchema,
    reviewItemParamsSchema,
    reviewUploadParamsSchema
} from '../validators/admin'
import { adminActionRateLimit } from '../middlewares/rate-limits'

const adminRouter = Router()

adminRouter.use(requireAuthentication, authorizeRoles(UserRole.ADMIN))
adminRouter.get('/dashboard', dashboard)
adminRouter.get('/customers', bodyValidation(adminCustomerQuerySchema, 'query'), customers)
adminRouter.get('/customers/:userId', paramsValidation(adminUserParamsSchema), customerDetails)
adminRouter.patch('/customers/:userId/status', adminActionRateLimit, paramsValidation(adminUserParamsSchema), bodyValidation(adminCustomerStatusSchema), changeCustomerStatus)
adminRouter.post('/customers/:userId/notes', paramsValidation(adminUserParamsSchema), bodyValidation(adminCustomerNoteSchema), addCustomerNote)
adminRouter.get('/orders', bodyValidation(adminOrderQuerySchema, 'query'), orders)
adminRouter.get('/orders/:orderId', paramsValidation(adminOrderParamsSchema), orderDetails)
adminRouter.post('/orders/:orderId/notes', paramsValidation(adminOrderParamsSchema), bodyValidation(adminCustomerNoteSchema), addOrderNote)
adminRouter.post('/orders/:orderId/fulfillment/retry', adminActionRateLimit, paramsValidation(adminOrderParamsSchema), retryOrderFulfillment)
adminRouter.post('/orders/:orderId/fulfillment/sync', paramsValidation(adminOrderParamsSchema), syncOrderFulfillment)
adminRouter.get('/orders/:orderId/items/:itemId/assets/:kind', paramsValidation(adminOrderAssetParamsSchema), orderItemAsset)
adminRouter.get('/products', products)
adminRouter.get('/products/:productId', paramsValidation(adminProductParamsSchema), productDetails)
adminRouter.put('/products/:productId', adminActionRateLimit, paramsValidation(adminProductParamsSchema), bodyValidation(adminProductUpdateSchema), saveProduct)
adminRouter.get('/products/:productId/deletion-preview', paramsValidation(adminProductParamsSchema), productDeletionPreview)
adminRouter.delete('/products/:productId', adminActionRateLimit, paramsValidation(adminProductParamsSchema), bodyValidation(adminProductDeleteSchema), removeProduct)
adminRouter.post('/printify/webhooks/sync', adminActionRateLimit, syncPrintifyWebhooks)
adminRouter.get('/ai-reviews', bodyValidation(adminReviewQuerySchema, 'query'), reviewQueue)
adminRouter.get('/ai-reviews/:itemId', paramsValidation(reviewItemParamsSchema), reviewDetails)
adminRouter.post('/ai-reviews/:itemId/decision', adminActionRateLimit, paramsValidation(reviewItemParamsSchema), bodyValidation(reviewDecisionSchema), decideReview)
adminRouter.post('/ai-reviews/:itemId/fulfillment/retry', adminActionRateLimit, paramsValidation(reviewItemParamsSchema), retryAIItem)
adminRouter.post('/ai-reviews/:itemId/fulfillment/sync', paramsValidation(reviewItemParamsSchema), syncAIItem)
adminRouter.get('/ai-reviews/:itemId/assets/:kind', paramsValidation(reviewAssetParamsSchema), reviewAsset)
adminRouter.get('/ai-reviews/:itemId/uploads/:uploadId', paramsValidation(reviewUploadParamsSchema), reviewUpload)
adminRouter.get('/credits/users/:userId', paramsValidation(adminCreditUserParamsSchema), userCredits)
adminRouter.post('/credits/users/:userId/adjustments', adminActionRateLimit, paramsValidation(adminCreditUserParamsSchema), bodyValidation(adminCreditAdjustmentSchema), adjustCredits)

export default adminRouter

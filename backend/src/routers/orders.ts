import { Router } from 'express'
import { createOrderFromCart, listOrders, quoteShipping, viewOrder, viewOrderItemAsset } from '../controllers/orders/controller'
import requireAuthentication from '../middlewares/auth/authentication'
import paramsValidation from '../middlewares/params-validation'
import { orderParamsSchema } from '../validators/orders'
import { createOrderSchema, shippingQuoteSchema } from '../validators/orders'
import bodyValidation from '../middlewares/body-validation'
import { retryFulfillment, syncFulfillment } from '../controllers/fulfillment/controller'
import { authorizeRoles } from '../middlewares/auth/authorization'
import { UserRole } from '../database/models/model-enums'
import { orderItemAssetParamsSchema } from '../validators/orders'

const ordersRouter = Router()

ordersRouter.use(requireAuthentication)
ordersRouter.post('/shipping-quotes', bodyValidation(shippingQuoteSchema), quoteShipping)
ordersRouter.post('/', bodyValidation(createOrderSchema), createOrderFromCart)
ordersRouter.get('/', listOrders)
ordersRouter.post('/:orderId/fulfillment/retry', paramsValidation(orderParamsSchema), authorizeRoles(UserRole.ADMIN), retryFulfillment)
ordersRouter.post('/:orderId/fulfillment/sync', paramsValidation(orderParamsSchema), authorizeRoles(UserRole.ADMIN), syncFulfillment)
ordersRouter.get('/:orderId/items/:itemId/assets/:kind', paramsValidation(orderItemAssetParamsSchema), viewOrderItemAsset)
ordersRouter.get('/:orderId', paramsValidation(orderParamsSchema), viewOrder)

export default ordersRouter

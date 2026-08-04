import { Router } from 'express'
import { captureOrder, createOrder, getPayPalClient, recoverOrder } from '../controllers/payments/controller'
import bodyValidation from '../middlewares/body-validation'
import { capturePaymentOrderSchema, createPaymentOrderSchema, paypalOrderParamsSchema } from '../validators/products'
import requireAuthentication from '../middlewares/auth/authentication'
import { paymentRateLimit } from '../middlewares/rate-limits'
import paramsValidation from '../middlewares/params-validation'

const paymentsRouter = Router()

paymentsRouter.use(requireAuthentication)
paymentsRouter.get('/paypal/client-id', getPayPalClient)
paymentsRouter.post('/paypal/create-order', paymentRateLimit, bodyValidation(createPaymentOrderSchema), createOrder)
paymentsRouter.post('/paypal/:orderId/capture', paymentRateLimit, paramsValidation(paypalOrderParamsSchema), bodyValidation(capturePaymentOrderSchema), captureOrder)
paymentsRouter.post('/paypal/:orderId/recover', paymentRateLimit, paramsValidation(paypalOrderParamsSchema), bodyValidation(capturePaymentOrderSchema), recoverOrder)

export default paymentsRouter

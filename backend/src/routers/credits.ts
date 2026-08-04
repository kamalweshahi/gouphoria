import { Router } from 'express'
import { cancelPurchase, capturePurchase, createPurchase, history, packages } from '../controllers/credits/controller'
import creditPurchaseRateLimit from '../middlewares/credit-purchase-rate-limit'
import requireAuthentication from '../middlewares/auth/authentication'
import bodyValidation from '../middlewares/body-validation'
import paramsValidation from '../middlewares/params-validation'
import {
    cancelCreditPurchaseSchema,
    captureCreditPurchaseSchema,
    createCreditPurchaseSchema,
    creditPurchaseParamsSchema
} from '../validators/credits'

const creditsRouter = Router()

creditsRouter.use(requireAuthentication)
creditsRouter.get('/packages', packages)
creditsRouter.get('/history', history)
creditsRouter.post('/purchases', creditPurchaseRateLimit, bodyValidation(createCreditPurchaseSchema), createPurchase)
creditsRouter.post('/purchases/:purchaseId/capture', creditPurchaseRateLimit, paramsValidation(creditPurchaseParamsSchema), bodyValidation(captureCreditPurchaseSchema), capturePurchase)
creditsRouter.post('/purchases/:purchaseId/cancel', creditPurchaseRateLimit, paramsValidation(creditPurchaseParamsSchema), bodyValidation(cancelCreditPurchaseSchema), cancelPurchase)

export default creditsRouter

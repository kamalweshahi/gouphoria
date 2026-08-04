import { Router } from 'express'
import { getAIProducts, getAllProducts, getCatalogImage, getOneProduct, syncCatalog } from '../controllers/products/controller'
import requireAuthentication from '../middlewares/auth/authentication'
import { authorizeRoles } from '../middlewares/auth/authorization'
import { UserRole } from '../database/models/model-enums'
import paramsValidation from '../middlewares/params-validation'
import { catalogImageParamsSchema, productIdParamsSchema } from '../validators/products'
import { adminActionRateLimit } from '../middlewares/rate-limits'

const productsRouter = Router()

productsRouter.get('/', getAllProducts)
productsRouter.get('/ai-customizable', requireAuthentication, getAIProducts)
productsRouter.post('/sync', requireAuthentication, authorizeRoles(UserRole.ADMIN), adminActionRateLimit, syncCatalog)
productsRouter.get('/assets/:token', paramsValidation(catalogImageParamsSchema), getCatalogImage)
productsRouter.get('/:productId', paramsValidation(productIdParamsSchema), getOneProduct)

export default productsRouter

import { Router } from 'express'
import { addAIDesignItem, addItem, emptyCart, removeItem, updateItem, viewCart } from '../controllers/cart/controller'
import bodyValidation from '../middlewares/body-validation'
import requireAuthentication from '../middlewares/auth/authentication'
import paramsValidation from '../middlewares/params-validation'
import { addAIDesignCartItemSchema, addCartItemSchema, aiDesignCartParamsSchema, cartItemParamsSchema, updateCartItemSchema } from '../validators/cart'

const cartRouter = Router()

cartRouter.use(requireAuthentication)
cartRouter.get('/', viewCart)
cartRouter.post('/items', bodyValidation(addCartItemSchema), addItem)
cartRouter.post('/ai-designs/:designId', paramsValidation(aiDesignCartParamsSchema), bodyValidation(addAIDesignCartItemSchema), addAIDesignItem)
cartRouter.patch('/items/:itemId', paramsValidation(cartItemParamsSchema), bodyValidation(updateCartItemSchema), updateItem)
cartRouter.delete('/items/:itemId', paramsValidation(cartItemParamsSchema), removeItem)
cartRouter.delete('/', emptyCart)

export default cartRouter

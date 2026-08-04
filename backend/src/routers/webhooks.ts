import { Router, raw } from 'express'
import { printifyWebhook } from '../controllers/webhooks/controller'

const webhooksRouter = Router()
webhooksRouter.post('/printify', raw({ type: 'application/json', limit: '256kb' }), printifyWebhook)

export default webhooksRouter

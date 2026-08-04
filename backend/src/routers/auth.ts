import { Router } from 'express'
import { currentUser, getUserProfile, login, logout, register } from '../controllers/auth/controller'
import requireAuthentication from '../middlewares/auth/authentication'
import { authorizeSelfOrRoles } from '../middlewares/auth/authorization'
import bodyValidation from '../middlewares/body-validation'
import paramsValidation from '../middlewares/params-validation'
import { UserRole } from '../database/models/model-enums'
import { loginSchema, registerSchema, userIdParamsSchema } from '../validators/auth'
import { loginRateLimit, registerRateLimit } from '../middlewares/rate-limits'

const authRouter = Router()

authRouter.post('/register', registerRateLimit, bodyValidation(registerSchema), register)
authRouter.post('/login', loginRateLimit, bodyValidation(loginSchema), login)
authRouter.post('/logout', logout)
authRouter.get('/me', requireAuthentication, currentUser)
authRouter.get('/profile', requireAuthentication, currentUser)
authRouter.get(
    '/users/:userId',
    requireAuthentication,
    paramsValidation(userIdParamsSchema),
    authorizeSelfOrRoles('userId', UserRole.ADMIN),
    getUserProfile
)

export default authRouter

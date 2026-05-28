import { Router } from 'express'
import { AuthController } from '../controllers/auth.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.post('/login', asyncHandler(AuthController.login))
router.post('/register-admin', asyncHandler(AuthController.registerAdmin))
router.get('/me', authMiddleware, asyncHandler(AuthController.me))

export default router

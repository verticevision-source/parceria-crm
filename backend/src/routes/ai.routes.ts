import { Router } from 'express'
import { AIController } from '../controllers/ai.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)

router.get('/config', adminMiddleware, asyncHandler(AIController.getConfig))
router.put('/config', adminMiddleware, asyncHandler(AIController.updateConfig))
router.post('/suggest', asyncHandler(AIController.suggest))

export default router

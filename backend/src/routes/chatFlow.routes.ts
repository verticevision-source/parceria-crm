import { Router } from 'express'
import { ChatFlowController } from '../controllers/chatFlow.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware, adminMiddleware)

router.get('/', asyncHandler(ChatFlowController.list))
router.get('/:id', asyncHandler(ChatFlowController.get))
router.post('/', asyncHandler(ChatFlowController.create))
router.put('/:id', asyncHandler(ChatFlowController.update))
router.delete('/:id', asyncHandler(ChatFlowController.remove))

export default router

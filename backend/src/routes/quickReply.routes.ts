import { Router } from 'express'
import { QuickReplyController } from '../controllers/quickReply.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(authMiddleware)

router.get('/', asyncHandler(QuickReplyController.getAll))
router.post('/', asyncHandler(QuickReplyController.create))
router.put('/:id', asyncHandler(QuickReplyController.update))
router.delete('/:id', asyncHandler(QuickReplyController.remove))

export default router

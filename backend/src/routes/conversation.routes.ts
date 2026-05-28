import { Router } from 'express'
import { ConversationController } from '../controllers/conversation.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(authMiddleware)

router.get('/', asyncHandler(ConversationController.findAll))
router.get('/:id', asyncHandler(ConversationController.findById))
router.get('/:id/messages', asyncHandler(ConversationController.getMessages))
router.patch('/:id/status', asyncHandler(ConversationController.updateStatus))
router.patch('/:id/read', asyncHandler(ConversationController.markAsRead))

export default router

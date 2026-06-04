import { Router } from 'express'
import { ConversationController } from '../controllers/conversation.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(authMiddleware)

router.get('/', asyncHandler(ConversationController.findAll))

// Admin: limpar todas as conversas (faxina) — antes de /:id para não colidir
router.post('/clear-all', adminMiddleware, asyncHandler(ConversationController.clearAll))

router.get('/:id', asyncHandler(ConversationController.findById))
router.get('/:id/messages', asyncHandler(ConversationController.getMessages))
router.patch('/:id/status', asyncHandler(ConversationController.updateStatus))
router.patch('/:id/read', asyncHandler(ConversationController.markAsRead))
router.patch('/:id/ai-auto', asyncHandler(ConversationController.setAiAuto))
router.delete('/:id', adminMiddleware, asyncHandler(ConversationController.remove))

// Tags
router.post('/:id/tags', asyncHandler(ConversationController.addTag))
router.delete('/:id/tags/:tagId', asyncHandler(ConversationController.removeTag))

export default router

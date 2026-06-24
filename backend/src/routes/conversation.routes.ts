import { Router } from 'express'
import { ConversationController } from '../controllers/conversation.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(authMiddleware)

router.get('/', asyncHandler(ConversationController.findAll))

// Exclusão de conversas DESABILITADA por política: nenhuma conversa pode sumir
// do banco (nem individual, nem em massa). Rotas removidas de propósito.

router.get('/:id', asyncHandler(ConversationController.findById))
router.get('/:id/messages', asyncHandler(ConversationController.getMessages))
router.patch('/:id/status', asyncHandler(ConversationController.updateStatus))
router.patch('/:id/read', asyncHandler(ConversationController.markAsRead))
router.patch('/:id/ai-auto', asyncHandler(ConversationController.setAiAuto))

// Tags
router.post('/:id/tags', asyncHandler(ConversationController.addTag))
router.delete('/:id/tags/:tagId', asyncHandler(ConversationController.removeTag))

export default router

import { Router } from 'express'
import multer from 'multer'
import { InternalChatController } from '../controllers/internalChat.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } })
router.use(authMiddleware)

// Grupos
router.get('/groups', asyncHandler(InternalChatController.listGroups))
router.post('/groups', adminMiddleware, asyncHandler(InternalChatController.createGroup))
router.put('/groups/:id', adminMiddleware, asyncHandler(InternalChatController.updateGroup))
router.delete('/groups/:id', adminMiddleware, asyncHandler(InternalChatController.deleteGroup))
router.put('/groups/:id/members', adminMiddleware, asyncHandler(InternalChatController.setMembers))

// Mensagens
router.get('/groups/:id/messages', asyncHandler(InternalChatController.getMessages))
router.post('/groups/:id/messages', asyncHandler(InternalChatController.sendMessage))

// Supervisão (admin)
router.get('/supervision/:userId/conversations', adminMiddleware, asyncHandler(InternalChatController.agentConversations))
router.get('/supervision/conversations/:conversationId/messages', adminMiddleware, asyncHandler(InternalChatController.conversationMessages))
router.post('/supervision/conversations/:conversationId/send', adminMiddleware, asyncHandler(InternalChatController.supervisionSend))
router.post('/supervision/conversations/:conversationId/send-media', adminMiddleware, upload.single('file'), asyncHandler(InternalChatController.supervisionSendMedia))

export default router

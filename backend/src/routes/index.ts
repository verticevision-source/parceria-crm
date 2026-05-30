import { Router } from 'express'
import authRoutes from './auth.routes'
import userRoutes from './user.routes'
import whatsappRoutes from './whatsapp.routes'
import conversationRoutes from './conversation.routes'
import contactRoutes from './contact.routes'
import leadRoutes from './lead.routes'
import pipelineRoutes from './pipeline.routes'
import dashboardRoutes from './dashboard.routes'
import mediaRoutes from './media.routes'
import quickReplyRoutes from './quickReply.routes'
import customFieldRoutes from './customField.routes'
import rouletteRoutes from './roulette.routes'
import crmBoardRoutes from './crmBoard.routes'
import bulkMessageRoutes from './bulkMessage.routes'
import reportRoutes from './report.routes'
import internalChatRoutes from './internalChat.routes'

const router = Router()

router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/whatsapp', whatsappRoutes)
router.use('/conversations', conversationRoutes)
router.use('/contacts', contactRoutes)
router.use('/leads', leadRoutes)
router.use('/pipeline', pipelineRoutes)
router.use('/dashboard', dashboardRoutes)
router.use('/media', mediaRoutes)
router.use('/quick-replies', quickReplyRoutes)
router.use('/custom-fields', customFieldRoutes)
router.use('/roulette', rouletteRoutes)
router.use('/crm-boards', crmBoardRoutes)
router.use('/bulk-messages', bulkMessageRoutes)
router.use('/reports', reportRoutes)
router.use('/internal-chat', internalChatRoutes)

export default router

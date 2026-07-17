import { Router } from 'express'
import { prisma } from '../config/database'
import { ChatFlowController } from '../controllers/chatFlow.controller'
import { ChatFlowService } from '../services/chatFlow.service'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware, adminMiddleware)

router.get('/', asyncHandler(ChatFlowController.list))
// Gera o fluxo padrão de qualificação por cidade (pré-montado)
router.post('/qualification-template', asyncHandler(async (_req, res) => {
  const flow = await ChatFlowService.createQualificationFlow()
  res.status(201).json({ success: true, data: flow })
}))
/**
 * POST /flows/start-for-conversation — inicia o robô numa conversa existente.
 * Usado para recuperar leads que ficaram sem resposta (o robô só inicia sozinho
 * em conversa nova). Recomeça do zero se já houver sessão do robô.
 */
router.post('/start-for-conversation', asyncHandler(async (req, res) => {
  const { conversationId } = req.body
  if (!conversationId) {
    res.status(400).json({ success: false, message: 'conversationId é obrigatório' })
    return
  }
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { contact: true },
  })
  if (!conv || !conv.contactId || !conv.contact) {
    res.status(404).json({ success: false, message: 'Conversa (ou contato) não encontrada' })
    return
  }
  await prisma.chatFlowSession.deleteMany({ where: { conversationId } })
  // Envia SEMPRE pelo número amarrado ao fluxo (o da campanha) — nunca pelo
  // dono da conversa (que pode ser um vendedor, após redistribuição/timeout).
  let senderUserId = conv.userId
  const flow = await ChatFlowService.getActiveFlow()
  const boundSessionId = (flow as any)?.whatsappSessionId as string | null
  if (boundSessionId) {
    const bound = await prisma.whatsAppSession.findUnique({ where: { id: boundSessionId }, select: { userId: true, status: true } })
    if (!bound || bound.status !== 'CONNECTED') {
      res.status(409).json({ success: false, message: 'O número do robô (campanha) não está conectado' })
      return
    }
    senderUserId = bound.userId
  }
  const started = await ChatFlowService.startForConversation(conv.id, conv.contactId, senderUserId, conv.contact.phone)
  res.json({ success: true, data: { started, phone: conv.contact.phone } })
}))

router.get('/:id', asyncHandler(ChatFlowController.get))
router.post('/', asyncHandler(ChatFlowController.create))
router.put('/:id', asyncHandler(ChatFlowController.update))
router.delete('/:id', asyncHandler(ChatFlowController.remove))

export default router

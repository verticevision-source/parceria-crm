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

  // Roda o robô DO NÚMERO que atende esta conversa. Antes usava "o robô ativo"
  // e o primeiro número dele — com mais de um robô no sistema isso reiniciaria
  // o robô errado, e o cliente receberia o menu vindo de outro número.
  const sessionId = conv.whatsappSessionId
  const flow = await ChatFlowService.flowForSession(sessionId, conv.userId)
  if (!flow) {
    res.status(409).json({ success: false, message: 'Nenhum robô ativo no número desta conversa' })
    return
  }
  const sess = await prisma.whatsAppSession.findUnique({
    where: { id: sessionId },
    select: { userId: true, status: true },
  })
  if (!sess || sess.status !== 'CONNECTED') {
    res.status(409).json({ success: false, message: 'O número desta conversa não está conectado' })
    return
  }

  const started = await ChatFlowService.startForConversation(conv.id, conv.contactId, sess.userId, conv.contact.phone, sessionId)
  res.json({ success: true, data: { started, robo: flow.name, phone: conv.contact.phone } })
}))

router.get('/:id', asyncHandler(ChatFlowController.get))
router.post('/', asyncHandler(ChatFlowController.create))
router.put('/:id', asyncHandler(ChatFlowController.update))
router.delete('/:id', asyncHandler(ChatFlowController.remove))

export default router

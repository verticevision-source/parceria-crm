import { Router } from 'express'
import { ScheduledMessageService } from '../services/scheduledMessage.service'
import { authMiddleware } from '../middlewares/auth.middleware'
import { asyncHandler } from '../utils/asyncHandler'
import { AuthRequest } from '../types'

const router = Router()
router.use(authMiddleware)

// Lista agendamentos (opcionalmente de uma conversa)
router.get('/', asyncHandler(async (req: AuthRequest, res) => {
  const data = await ScheduledMessageService.list(
    req.user!.userId,
    req.user!.role,
    req.query.conversationId ? String(req.query.conversationId) : undefined,
  )
  res.json({ success: true, data })
}))

// Cria agendamento
router.post('/', asyncHandler(async (req: AuthRequest, res) => {
  const { toPhone, body, sendAt, conversationId, contactId } = req.body
  if (!toPhone || !body?.trim() || !sendAt) {
    res.status(400).json({ success: false, message: 'toPhone, body e sendAt são obrigatórios' })
    return
  }
  const when = new Date(sendAt)
  if (isNaN(when.getTime())) {
    res.status(400).json({ success: false, message: 'Data/hora inválida' })
    return
  }
  if (when.getTime() < Date.now() - 60_000) {
    res.status(400).json({ success: false, message: 'A data/hora deve ser no futuro' })
    return
  }
  const data = await ScheduledMessageService.create(req.user!.userId, {
    toPhone, body: body.trim(), sendAt: when, conversationId, contactId,
  })
  res.status(201).json({ success: true, data })
}))

// Cancela agendamento
router.delete('/:id', asyncHandler(async (req: AuthRequest, res) => {
  const data = await ScheduledMessageService.cancel(req.user!.userId, req.user!.role, req.params.id)
  res.json({ success: true, data })
}))

export default router

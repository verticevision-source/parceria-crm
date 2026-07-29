import { Response } from 'express'
import { ConversationService } from '../services/conversation.service'
import { prisma } from '../config/database'
import { AuthRequest } from '../types'

export class ConversationController {
  static async findAll(req: AuthRequest, res: Response): Promise<void> {
    const { status } = req.query
    const conversations = await ConversationService.findAll(
      req.user!.userId,
      req.user!.role,
      { status: status as string | undefined }
    )
    res.json({ success: true, data: conversations })
  }

  static async findById(req: AuthRequest, res: Response): Promise<void> {
    const conversation = await ConversationService.findById(
      req.params.id,
      req.user!.userId,
      req.user!.role
    )
    res.json({ success: true, data: conversation })
  }

  static async getMessages(req: AuthRequest, res: Response): Promise<void> {
    const { before } = req.query
    const result = await ConversationService.getMessages(
      req.params.id,
      req.user!.userId,
      req.user!.role,
      before as string | undefined
    )
    res.json({ success: true, data: result.messages, hasMore: result.hasMore })
  }

  static async updateStatus(req: AuthRequest, res: Response): Promise<void> {
    const { status } = req.body
    if (!['OPEN', 'PENDING', 'CLOSED'].includes(status)) {
      res.status(400).json({ success: false, message: 'Status inválido' })
      return
    }
    const conversation = await ConversationService.updateStatus(
      req.params.id,
      req.user!.userId,
      req.user!.role,
      status
    )
    res.json({ success: true, data: conversation })
  }

  static async markAsRead(req: AuthRequest, res: Response): Promise<void> {
    const conversation = await ConversationService.markAsRead(
      req.params.id,
      req.user!.userId,
      req.user!.role
    )
    res.json({ success: true, data: conversation })
  }

  /** Dono da conversa ou admin. Devolve null e já responde o erro se não puder. */
  private static async assertOwner(req: AuthRequest, res: Response) {
    const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } })
    if (!conversation) {
      res.status(404).json({ success: false, message: 'Conversa não encontrada' })
      return null
    }
    if (req.user!.role !== 'ADMIN' && conversation.userId !== req.user!.userId) {
      res.status(403).json({ success: false, message: 'Acesso negado' })
      return null
    }
    return conversation
  }

  static async setAiAuto(req: AuthRequest, res: Response): Promise<void> {
    if (!(await ConversationController.assertOwner(req, res))) return
    const { enabled } = req.body
    const conversation = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { aiAuto: !!enabled },
    })
    res.json({ success: true, data: conversation })
  }

  /**
   * Botão "IA respondendo / Eu respondo". Pausar não desliga a IA no sistema —
   * vale só para esta conversa, e é reversível no mesmo botão.
   */
  static async setAiPaused(req: AuthRequest, res: Response): Promise<void> {
    if (!(await ConversationController.assertOwner(req, res))) return
    const { paused } = req.body
    const conversation = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { aiPaused: !!paused, ...(paused ? {} : { aiAuto: true }) },
    })
    res.json({ success: true, data: conversation })
  }

  /** "Responder agora": destrava conversa em que a IA ficou muda. */
  static async aiReplyNow(req: AuthRequest, res: Response): Promise<void> {
    if (!(await ConversationController.assertOwner(req, res))) return
    const { AIBotService } = await import('../services/aiBot.service')
    // Retomar é implícito: pedir pra ela responder e continuar pausada seria
    // responder uma vez e voltar a ficar muda na mensagem seguinte.
    await prisma.conversation.update({
      where: { id: req.params.id },
      data: { aiPaused: false, aiAuto: true },
    })
    const r = await AIBotService.replyNow(req.params.id)
    if (!r.sent) {
      res.status(409).json({ success: false, message: `A IA não respondeu: ${r.reason}` })
      return
    }
    res.json({ success: true, data: { sent: true } })
  }

  static async addTag(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params
    const { tagId } = req.body

    if (!tagId) {
      res.status(400).json({ success: false, message: 'tagId é obrigatório' })
      return
    }

    // Check access
    const conversation = await prisma.conversation.findUnique({ where: { id } })
    if (!conversation) {
      res.status(404).json({ success: false, message: 'Conversa não encontrada' })
      return
    }
    if (req.user!.role !== 'ADMIN' && conversation.userId !== req.user!.userId) {
      res.status(403).json({ success: false, message: 'Acesso negado' })
      return
    }

    const conversationTag = await prisma.conversationTag.upsert({
      where: { conversationId_tagId: { conversationId: id, tagId } },
      update: {},
      create: { conversationId: id, tagId },
      include: { tag: true },
    })
    res.status(201).json({ success: true, data: conversationTag })
  }

  // Exclusão de conversas removida por política (nenhuma conversa some do banco).

  static async removeTag(req: AuthRequest, res: Response): Promise<void> {
    const { id, tagId } = req.params

    const conversation = await prisma.conversation.findUnique({ where: { id } })
    if (!conversation) {
      res.status(404).json({ success: false, message: 'Conversa não encontrada' })
      return
    }
    if (req.user!.role !== 'ADMIN' && conversation.userId !== req.user!.userId) {
      res.status(403).json({ success: false, message: 'Acesso negado' })
      return
    }

    await prisma.conversationTag.deleteMany({
      where: { conversationId: id, tagId },
    })
    res.json({ success: true, message: 'Tag removida da conversa' })
  }
}

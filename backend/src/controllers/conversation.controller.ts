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
    const messages = await ConversationService.getMessages(
      req.params.id,
      req.user!.userId,
      req.user!.role
    )
    res.json({ success: true, data: messages })
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

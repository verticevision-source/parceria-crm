import { Response } from 'express'
import { ConversationService } from '../services/conversation.service'
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
}

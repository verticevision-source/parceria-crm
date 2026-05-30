import { Response } from 'express'
import { InternalChatService } from '../services/internalChat.service'
import { AuthRequest } from '../types'

export class InternalChatController {
  static async listGroups(req: AuthRequest, res: Response) {
    const data = await InternalChatService.listGroups(req.user!.userId, req.user!.role === 'ADMIN')
    res.json({ success: true, data })
  }

  static async createGroup(req: AuthRequest, res: Response) {
    const { name, description, color, memberIds } = req.body
    if (!name) { res.status(400).json({ success: false, message: 'name obrigatório' }); return }
    const data = await InternalChatService.createGroup(name, req.user!.userId, { description, color, memberIds })
    res.status(201).json({ success: true, data })
  }

  static async updateGroup(req: AuthRequest, res: Response) {
    const data = await InternalChatService.updateGroup(req.params.id, req.body)
    res.json({ success: true, data })
  }

  static async deleteGroup(req: AuthRequest, res: Response) {
    await InternalChatService.deleteGroup(req.params.id)
    res.json({ success: true, message: 'Grupo removido' })
  }

  static async setMembers(req: AuthRequest, res: Response) {
    const { memberIds } = req.body
    const data = await InternalChatService.setMembers(req.params.id, memberIds || [])
    res.json({ success: true, data })
  }

  static async getMessages(req: AuthRequest, res: Response) {
    const data = await InternalChatService.getMessages(req.params.id, req.user!.userId, req.user!.role === 'ADMIN')
    res.json({ success: true, data })
  }

  static async sendMessage(req: AuthRequest, res: Response) {
    const { body } = req.body
    if (!body?.trim()) { res.status(400).json({ success: false, message: 'Mensagem vazia' }); return }
    const data = await InternalChatService.sendMessage(req.params.id, req.user!.userId, body.trim(), req.user!.role === 'ADMIN')
    res.json({ success: true, data })
  }

  // Supervisão (admin)
  static async agentConversations(req: AuthRequest, res: Response) {
    const data = await InternalChatService.getAgentConversations(req.params.userId)
    res.json({ success: true, data })
  }

  static async conversationMessages(req: AuthRequest, res: Response) {
    const data = await InternalChatService.getConversationMessages(req.params.conversationId)
    res.json({ success: true, data })
  }
}

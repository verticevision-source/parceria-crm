import { Response } from 'express'
import { InternalChatService } from '../services/internalChat.service'
import { WhatsAppService } from '../services/whatsapp.service'
import { prisma } from '../config/database'
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

  // Supervisão: admin envia na conversa do agente (texto ou áudio), pelo número do agente
  static async supervisionSend(req: AuthRequest, res: Response) {
    const conv = await prisma.conversation.findUnique({
      where: { id: req.params.conversationId },
      include: { contact: true },
    })
    if (!conv?.contact) { res.status(404).json({ success: false, message: 'Conversa não encontrada' }); return }

    const { body, audio, mimetype } = req.body
    let message
    if (audio) {
      message = await WhatsAppService.sendAudio(conv.userId, conv.contact.phone, audio, mimetype)
    } else if (body?.trim()) {
      message = await WhatsAppService.sendMessage(conv.userId, conv.contact.phone, body.trim())
    } else {
      res.status(400).json({ success: false, message: 'Nada para enviar' }); return
    }
    res.json({ success: true, data: message })
  }

  // Supervisão: admin envia mídia (foto/arquivo) na conversa do agente
  static async supervisionSendMedia(req: AuthRequest, res: Response) {
    const conv = await prisma.conversation.findUnique({
      where: { id: req.params.conversationId },
      include: { contact: true },
    })
    if (!conv?.contact) { res.status(404).json({ success: false, message: 'Conversa não encontrada' }); return }

    const f = (req as any).file as Express.Multer.File | undefined
    if (!f) { res.status(400).json({ success: false, message: 'Arquivo não enviado' }); return }

    const message = await WhatsAppService.sendMedia(conv.userId, conv.contact.phone, {
      data: f.buffer.toString('base64'),
      mimetype: f.mimetype,
      filename: f.originalname,
    })
    res.json({ success: true, data: message })
  }
}

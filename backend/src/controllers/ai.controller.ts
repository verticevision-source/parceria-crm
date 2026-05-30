import { Response } from 'express'
import { AIService } from '../services/ai.service'
import { prisma } from '../config/database'
import { AuthRequest } from '../types'

export class AIController {
  // Admin: configuração
  static async getConfig(_req: AuthRequest, res: Response) {
    const data = await AIService.getConfigPublic()
    res.json({ success: true, data })
  }

  static async updateConfig(req: AuthRequest, res: Response) {
    const data = await AIService.updateConfig(req.body)
    res.json({ success: true, data })
  }

  // Atendente com acesso: sugerir resposta
  static async suggest(req: AuthRequest, res: Response) {
    const { conversationId } = req.body
    if (!conversationId) { res.status(400).json({ success: false, message: 'conversationId obrigatório' }); return }

    // Verifica acesso à IA
    const me = await prisma.user.findUnique({ where: { id: req.user!.userId } })
    if (!me?.aiEnabled && me?.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Você não tem acesso ao assistente de IA' })
      return
    }

    const suggestion = await AIService.suggestForConversation(conversationId)
    res.json({ success: true, data: { suggestion } })
  }
}

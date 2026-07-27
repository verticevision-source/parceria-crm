import { Response } from 'express'
import { AIService } from '../services/ai.service'
import { AIBotService } from '../services/aiBot.service'
import { prisma } from '../config/database'
import { AuthRequest } from '../types'

export class AIController {
  // Admin: configuração
  static async getConfig(_req: AuthRequest, res: Response) {
    const data = await AIService.getConfigPublic()
    res.json({ success: true, data: { ...data, defaultBotPrompt: AIBotService.defaultPrompt() } })
  }

  static async updateConfig(req: AuthRequest, res: Response) {
    const data = await AIService.updateConfig(req.body)
    AIBotService.clearCache()  // config é cacheada 30s no robô — invalida já
    res.json({ success: true, data })
  }

  /**
   * POST /api/ai/bot/preview — testa o prompt do atendente de IA SEM tocar no
   * WhatsApp. É o que permite afinar o texto antes de expor a cliente real.
   */
  static async botPreview(req: AuthRequest, res: Response) {
    const { text } = req.body
    if (!text?.trim()) { res.status(400).json({ success: false, message: 'text obrigatório' }); return }
    const reply = await AIBotService.previewReply(text.trim())
    res.json({ success: true, data: { reply } })
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

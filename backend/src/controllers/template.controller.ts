import { Response } from 'express'
import { WhatsAppTemplateService } from '../services/whatsappTemplate.service'
import { WhatsAppService } from '../services/whatsapp.service'
import { AuthRequest } from '../types'

export class TemplateController {
  static async list(_req: AuthRequest, res: Response) {
    res.json({ success: true, data: await WhatsAppTemplateService.list() })
  }

  static async create(req: AuthRequest, res: Response) {
    const { name, category, language, body, exampleVars } = req.body
    if (!name || !body) { res.status(400).json({ success: false, message: 'name e body são obrigatórios' }); return }
    const data = await WhatsAppTemplateService.create({ name, category, language, body, exampleVars })
    res.status(201).json({ success: true, data })
  }

  static async remove(req: AuthRequest, res: Response) {
    await WhatsAppTemplateService.remove(req.params.name)
    res.json({ success: true, message: 'Modelo removido' })
  }

  /** Envia um modelo para um contato (qualquer atendente) */
  static async send(req: AuthRequest, res: Response) {
    const { to, templateName, language, variables, previewText } = req.body
    if (!to || !templateName) { res.status(400).json({ success: false, message: 'to e templateName são obrigatórios' }); return }
    const msg = await WhatsAppService.sendTemplate(
      req.user!.userId, to, templateName, language || 'pt_BR',
      variables || [], previewText || '[modelo enviado]'
    )
    res.json({ success: true, data: msg })
  }
}

import { Response } from 'express'
import { WhatsAppNumberService } from '../services/whatsappNumber.service'
import { AuthRequest } from '../types'

export class WhatsAppNumberController {
  static async list(_req: AuthRequest, res: Response) {
    res.json({ success: true, data: await WhatsAppNumberService.list() })
  }
  static async add(req: AuthRequest, res: Response) {
    const { label, phoneNumberId, token, wabaId } = req.body
    if (!label || !phoneNumberId || !token) {
      res.status(400).json({ success: false, message: 'label, phoneNumberId e token são obrigatórios' }); return
    }
    const data = await WhatsAppNumberService.add({ label, phoneNumberId, token, wabaId })
    res.status(201).json({ success: true, data })
  }
  static async update(req: AuthRequest, res: Response) {
    res.json({ success: true, data: await WhatsAppNumberService.update(req.params.id, req.body) })
  }
  static async setDefault(req: AuthRequest, res: Response) {
    res.json({ success: true, data: await WhatsAppNumberService.setDefault(req.params.id) })
  }
  static async remove(req: AuthRequest, res: Response) {
    await WhatsAppNumberService.remove(req.params.id)
    res.json({ success: true, message: 'Número removido' })
  }
}

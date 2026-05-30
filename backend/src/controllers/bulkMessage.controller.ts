import { Response } from 'express'
import { BulkMessageService } from '../services/bulkMessage.service'
import { AuthRequest } from '../types'

export class BulkMessageController {
  static async list(_req: AuthRequest, res: Response) {
    const data = await BulkMessageService.list()
    res.json({ success: true, data })
  }

  static async getById(req: AuthRequest, res: Response) {
    const data = await BulkMessageService.getById(req.params.id)
    if (!data) { res.status(404).json({ success: false, message: 'Não encontrado' }); return }
    res.json({ success: true, data })
  }

  static async preview(req: AuthRequest, res: Response) {
    const { filterType, filterValue, filterDays } = req.body
    if (!filterType) { res.status(400).json({ success: false, message: 'filterType obrigatório' }); return }
    const data = await BulkMessageService.preview(filterType, filterValue, filterDays)
    res.json({ success: true, data })
  }

  static async create(req: AuthRequest, res: Response) {
    const { name, message, filterType, filterValue, filterDays } = req.body
    if (!name || !message || !filterType) {
      res.status(400).json({ success: false, message: 'name, message e filterType são obrigatórios' })
      return
    }
    const result = await BulkMessageService.create({
      name, message, filterType, filterValue, filterDays,
      createdById: req.user!.userId,
    })
    res.status(201).json({ success: true, data: result })
  }

  static async send(req: AuthRequest, res: Response) {
    // Inicia envio em background (não bloqueia resposta)
    BulkMessageService.send(req.params.id).catch(err => {
      console.error('[BulkMessage] Erro no envio em background:', err.message)
    })
    res.json({ success: true, message: 'Disparo iniciado! Acompanhe o progresso.' })
  }

  static async remove(req: AuthRequest, res: Response) {
    await BulkMessageService.delete(req.params.id)
    res.json({ success: true, message: 'Campanha removida' })
  }
}

import { Response } from 'express'
import { ChatFlowService } from '../services/chatFlow.service'
import { AuthRequest } from '../types'

export class ChatFlowController {
  static async list(_req: AuthRequest, res: Response) {
    res.json({ success: true, data: await ChatFlowService.list() })
  }
  static async get(req: AuthRequest, res: Response) {
    const flow = await ChatFlowService.get(req.params.id)
    if (!flow) { res.status(404).json({ success: false, message: 'Fluxo não encontrado' }); return }
    res.json({ success: true, data: flow })
  }
  static async create(req: AuthRequest, res: Response) {
    const { name } = req.body
    if (!name) { res.status(400).json({ success: false, message: 'name obrigatório' }); return }
    res.status(201).json({ success: true, data: await ChatFlowService.create(name) })
  }
  static async update(req: AuthRequest, res: Response) {
    const { name, isActive, nodes, edges, whatsappSessionId } = req.body
    res.json({ success: true, data: await ChatFlowService.update(req.params.id, { name, isActive, nodes, edges, whatsappSessionId }) })
  }
  static async remove(req: AuthRequest, res: Response) {
    await ChatFlowService.remove(req.params.id)
    res.json({ success: true, message: 'Fluxo removido' })
  }
}

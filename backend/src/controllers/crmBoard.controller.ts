import { Response } from 'express'
import { CRMBoardService } from '../services/crmBoard.service'
import { AuthRequest } from '../types'

export class CRMBoardController {
  static async list(req: AuthRequest, res: Response) {
    const isAdmin = req.user!.role === 'ADMIN'
    const data = await CRMBoardService.listBoards(req.user!.userId, isAdmin)
    res.json({ success: true, data })
  }

  static async create(req: AuthRequest, res: Response) {
    const { name, description, color, icon, defaultStages } = req.body
    if (!name) { res.status(400).json({ success: false, message: 'name obrigatório' }); return }
    const data = await CRMBoardService.createBoard({ name, description, color, icon, defaultStages })
    res.status(201).json({ success: true, data })
  }

  static async update(req: AuthRequest, res: Response) {
    const data = await CRMBoardService.updateBoard(req.params.id, req.body)
    res.json({ success: true, data })
  }

  static async remove(req: AuthRequest, res: Response) {
    await CRMBoardService.deleteBoard(req.params.id)
    res.json({ success: true, message: 'Board removido' })
  }

  static async getKanban(req: AuthRequest, res: Response) {
    const isAdmin = req.user!.role === 'ADMIN'
    const data = await CRMBoardService.getBoardKanban(req.params.id, req.user!.userId, isAdmin)
    res.json({ success: true, data })
  }

  // Members
  static async listMembers(req: AuthRequest, res: Response) {
    const data = await CRMBoardService.listMembers(req.params.id)
    res.json({ success: true, data })
  }

  static async addMember(req: AuthRequest, res: Response) {
    const { userId, role } = req.body
    if (!userId) { res.status(400).json({ success: false, message: 'userId obrigatório' }); return }
    const data = await CRMBoardService.addMember(req.params.id, userId, role)
    res.json({ success: true, data })
  }

  static async removeMember(req: AuthRequest, res: Response) {
    await CRMBoardService.removeMember(req.params.id, req.params.userId)
    res.json({ success: true, message: 'Membro removido' })
  }

  // Stages
  static async addStage(req: AuthRequest, res: Response) {
    const { name, color } = req.body
    if (!name) { res.status(400).json({ success: false, message: 'name obrigatório' }); return }
    const data = await CRMBoardService.addStage(req.params.id, name, color)
    res.status(201).json({ success: true, data })
  }

  static async updateStage(req: AuthRequest, res: Response) {
    const data = await CRMBoardService.updateStage(req.params.stageId, req.body)
    res.json({ success: true, data })
  }

  static async deleteStage(req: AuthRequest, res: Response) {
    await CRMBoardService.deleteStage(req.params.stageId)
    res.json({ success: true, message: 'Etapa removida' })
  }
}

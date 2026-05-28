import { Response } from 'express'
import { z } from 'zod'
import { PipelineService } from '../services/pipeline.service'
import { AuthRequest } from '../types'

const stageSchema = z.object({
  name: z.string().min(1),
  order: z.number().int().min(1),
  color: z.string().optional(),
})

export class PipelineController {
  static async findAll(_req: AuthRequest, res: Response): Promise<void> {
    const stages = await PipelineService.findAll()
    res.json({ success: true, data: stages })
  }

  static async getKanban(req: AuthRequest, res: Response): Promise<void> {
    const kanban = await PipelineService.getKanban(req.user!.userId, req.user!.role)
    res.json({ success: true, data: kanban })
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    const parse = stageSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.errors[0].message })
      return
    }
    const stage = await PipelineService.create(parse.data)
    res.status(201).json({ success: true, data: stage })
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    const parse = stageSchema.partial().safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.errors[0].message })
      return
    }
    const stage = await PipelineService.update(req.params.id, parse.data)
    res.json({ success: true, data: stage })
  }

  static async delete(req: AuthRequest, res: Response): Promise<void> {
    await PipelineService.delete(req.params.id)
    res.json({ success: true, message: 'Etapa removida' })
  }
}

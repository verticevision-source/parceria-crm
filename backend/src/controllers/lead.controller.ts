import { Response } from 'express'
import { z } from 'zod'
import { LeadService } from '../services/lead.service'
import { AuthRequest } from '../types'

const createSchema = z.object({
  contactId: z.string().uuid(),
  pipelineStageId: z.string().uuid().optional(),
  boardId: z.string().uuid().optional(),
  source: z.string().optional(),
  value: z.number().optional(),
  notes: z.string().optional(),
  responsibleUserId: z.string().uuid().optional(),
})

const fromConversationSchema = z.object({
  conversationId: z.string().uuid(),
  pipelineStageId: z.string().uuid().optional(),
  source: z.string().optional(),
  value: z.number().optional(),
  notes: z.string().optional(),
})

const noteSchema = z.object({ content: z.string().min(1) })

export class LeadController {
  static async findAll(req: AuthRequest, res: Response): Promise<void> {
    const { status, stageId, search, source } = req.query
    const leads = await LeadService.findAll(req.user!.userId, req.user!.role, {
      status: status as string,
      stageId: stageId as string,
      search: search as string,
      source: typeof source === 'string' ? source.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    })
    res.json({ success: true, data: leads })
  }

  static async findById(req: AuthRequest, res: Response): Promise<void> {
    const lead = await LeadService.findById(req.params.id, req.user!.userId, req.user!.role)
    res.json({ success: true, data: lead })
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    const parse = createSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.errors[0].message })
      return
    }
    const lead = await LeadService.create(req.user!.userId, parse.data)
    res.status(201).json({ success: true, data: lead })
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    const lead = await LeadService.update(
      req.params.id,
      req.user!.userId,
      req.user!.role,
      req.body
    )
    res.json({ success: true, data: lead })
  }

  static async delete(req: AuthRequest, res: Response): Promise<void> {
    await LeadService.delete(req.params.id, req.user!.userId, req.user!.role)
    res.json({ success: true, message: 'Lead removido' })
  }

  static async updateStage(req: AuthRequest, res: Response): Promise<void> {
    const { pipelineStageId } = req.body
    if (!pipelineStageId) {
      res.status(400).json({ success: false, message: 'pipelineStageId obrigatório' })
      return
    }
    const lead = await LeadService.updateStage(
      req.params.id,
      req.user!.userId,
      req.user!.role,
      pipelineStageId
    )
    res.json({ success: true, data: lead })
  }

  static async updateStatus(req: AuthRequest, res: Response): Promise<void> {
    const { status } = req.body
    if (!['OPEN', 'WON', 'LOST'].includes(status)) {
      res.status(400).json({ success: false, message: 'Status inválido' })
      return
    }
    const lead = await LeadService.updateStatus(
      req.params.id,
      req.user!.userId,
      req.user!.role,
      status
    )
    res.json({ success: true, data: lead })
  }

  static async createFromConversation(req: AuthRequest, res: Response): Promise<void> {
    const parse = fromConversationSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.errors[0].message })
      return
    }
    const lead = await LeadService.createFromConversation(
      req.user!.userId,
      parse.data.conversationId,
      parse.data
    )
    res.status(201).json({ success: true, data: lead })
  }

  static async getMessages(req: AuthRequest, res: Response): Promise<void> {
    const data = await LeadService.getLeadMessages(req.params.id, req.user!.userId, req.user!.role)
    res.json({ success: true, data })
  }

  static async getNotes(req: AuthRequest, res: Response): Promise<void> {
    const notes = await LeadService.getNotes(req.params.id, req.user!.userId, req.user!.role)
    res.json({ success: true, data: notes })
  }

  static async addNote(req: AuthRequest, res: Response): Promise<void> {
    const parse = noteSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.errors[0].message })
      return
    }
    const note = await LeadService.addNote(
      req.params.id,
      req.user!.userId,
      req.user!.role,
      parse.data.content
    )
    res.status(201).json({ success: true, data: note })
  }
}

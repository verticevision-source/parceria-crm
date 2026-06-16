import { Response } from 'express'
import { z } from 'zod'
import { CallService } from '../services/call.service'
import { AuthRequest } from '../types'

const createSchema = z.object({
  contactId: z.string().min(1),
  leadId: z.string().optional(),
  phone: z.string().min(5),
  direction: z.enum(['OUT', 'IN']).optional(),
  outcome: z.enum(['completed', 'no_answer', 'busy', 'voicemail', 'scheduled']).optional(),
  durationSec: z.number().int().min(0).optional(),
  notes: z.string().optional(),
})

export class CallController {
  static async create(req: AuthRequest, res: Response): Promise<void> {
    const parse = createSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.errors[0].message })
      return
    }
    const call = await CallService.create(req.user!.userId, parse.data)
    res.status(201).json({ success: true, data: call })
  }

  static async list(req: AuthRequest, res: Response): Promise<void> {
    const { contactId, leadId } = req.query
    const calls = await CallService.list(req.user!.userId, req.user!.role, {
      contactId: contactId as string | undefined,
      leadId: leadId as string | undefined,
    })
    res.json({ success: true, data: calls })
  }

  static async remove(req: AuthRequest, res: Response): Promise<void> {
    await CallService.remove(req.params.id, req.user!.userId, req.user!.role)
    res.json({ success: true, message: 'Ligação removida' })
  }
}

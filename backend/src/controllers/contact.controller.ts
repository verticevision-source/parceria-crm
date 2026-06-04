import { Response } from 'express'
import { z } from 'zod'
import { ContactService } from '../services/contact.service'
import { AuthRequest } from '../types'

const createSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  city: z.string().optional(),
  documentNumber: z.string().optional(),
  notes: z.string().optional(),
  avatarUrl: z.string().optional(),
})

export class ContactController {
  static async findAll(req: AuthRequest, res: Response): Promise<void> {
    const { search } = req.query
    const contacts = await ContactService.findAll(
      req.user!.userId,
      req.user!.role,
      search as string | undefined
    )
    res.json({ success: true, data: contacts })
  }

  static async findById(req: AuthRequest, res: Response): Promise<void> {
    const contact = await ContactService.findById(
      req.params.id,
      req.user!.userId,
      req.user!.role
    )
    res.json({ success: true, data: contact })
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    const parse = createSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.errors[0].message })
      return
    }
    const contact = await ContactService.create(req.user!.userId, parse.data)
    res.status(201).json({ success: true, data: contact })
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    const parse = createSchema.partial().safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.errors[0].message })
      return
    }
    const contact = await ContactService.update(
      req.params.id,
      req.user!.userId,
      req.user!.role,
      parse.data
    )
    res.json({ success: true, data: contact })
  }

  static async delete(req: AuthRequest, res: Response): Promise<void> {
    await ContactService.delete(req.params.id, req.user!.userId, req.user!.role)
    res.json({ success: true, message: 'Contato removido' })
  }

  /** Admin: importa contatos em massa (planilha) */
  static async importMany(req: AuthRequest, res: Response): Promise<void> {
    const { contacts, targetUserId } = req.body
    if (!Array.isArray(contacts) || contacts.length === 0) {
      res.status(400).json({ success: false, message: 'Nenhum contato para importar' })
      return
    }
    if (contacts.length > 10000) {
      res.status(400).json({ success: false, message: 'Máximo de 10.000 contatos por importação' })
      return
    }
    const result = await ContactService.importMany(req.user!.userId, targetUserId, contacts)
    res.json({ success: true, data: result })
  }
}

import { Response } from 'express'
import { z } from 'zod'
import { UserService } from '../services/user.service'
import { AuthRequest } from '../types'

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'USER']).default('USER'),
})

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  avatarUrl: z.string().optional(),
})

export class UserController {
  static async findAll(_req: AuthRequest, res: Response): Promise<void> {
    const users = await UserService.findAll()
    res.json({ success: true, data: users })
  }

  static async findById(req: AuthRequest, res: Response): Promise<void> {
    const user = await UserService.findById(req.params.id)
    res.json({ success: true, data: user })
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    const parse = createSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.errors[0].message })
      return
    }
    const user = await UserService.create(parse.data)
    res.status(201).json({ success: true, data: user })
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    const parse = updateSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.errors[0].message })
      return
    }
    const user = await UserService.update(req.params.id, parse.data)
    res.json({ success: true, data: user })
  }

  static async activate(req: AuthRequest, res: Response): Promise<void> {
    const user = await UserService.setActive(req.params.id, true)
    res.json({ success: true, data: user })
  }

  static async deactivate(req: AuthRequest, res: Response): Promise<void> {
    const user = await UserService.setActive(req.params.id, false)
    res.json({ success: true, data: user })
  }

  static async delete(req: AuthRequest, res: Response): Promise<void> {
    await UserService.delete(req.params.id, req.user!.userId)
    res.json({ success: true, message: 'Usuário excluído' })
  }

  static async setAi(req: AuthRequest, res: Response): Promise<void> {
    const { enabled } = req.body
    const user = await UserService.setAiEnabled(req.params.id, !!enabled)
    res.json({ success: true, data: user })
  }
}

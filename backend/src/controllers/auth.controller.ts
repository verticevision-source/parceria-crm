import { Request, Response } from 'express'
import { z } from 'zod'
import { AuthService } from '../services/auth.service'
import { AuthRequest } from '../types'

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
})

const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
})

export class AuthController {
  static async login(req: Request, res: Response): Promise<void> {
    const parse = loginSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.errors[0].message })
      return
    }

    const result = await AuthService.login(parse.data.email, parse.data.password)
    res.json({ success: true, data: result })
  }

  static async registerAdmin(req: Request, res: Response): Promise<void> {
    const adminExists = await import('../config/database').then(({ prisma }) =>
      prisma.user.findFirst({ where: { role: 'ADMIN' } })
    )

    if (adminExists) {
      res.status(403).json({ success: false, message: 'Admin já existe' })
      return
    }

    const parse = registerSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.errors[0].message })
      return
    }

    const result = await AuthService.registerAdmin(
      parse.data.name,
      parse.data.email,
      parse.data.password
    )
    res.status(201).json({ success: true, data: result })
  }

  static async me(req: AuthRequest, res: Response): Promise<void> {
    const user = await AuthService.getMe(req.user!.userId)
    res.json({ success: true, data: user })
  }
}

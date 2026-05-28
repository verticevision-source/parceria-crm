import bcrypt from 'bcryptjs'
import { prisma } from '../config/database'
import { signToken } from '../utils/jwt'
import { authConfig } from '../config/auth'

export class AuthService {
  static async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user || !user.isActive) {
      throw new Error('Credenciais inválidas')
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash)
    if (!passwordMatch) {
      throw new Error('Credenciais inválidas')
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role })

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    }
  }

  static async registerAdmin(name: string, email: string, password: string) {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      throw new Error('E-mail já cadastrado')
    }

    const passwordHash = await bcrypt.hash(password, authConfig.bcryptRounds)

    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: 'ADMIN' },
    })

    const token = signToken({ userId: user.id, email: user.email, role: user.role })

    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    }
  }

  static async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    })

    if (!user) throw new Error('Usuário não encontrado')

    return user
  }
}

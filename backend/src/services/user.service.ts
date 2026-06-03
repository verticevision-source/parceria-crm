import bcrypt from 'bcryptjs'
import { prisma } from '../config/database'
import { authConfig } from '../config/auth'

export class UserService {
  static async findAll() {
    return prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        aiEnabled: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
        whatsappSessions: {
          where: { status: 'CONNECTED' },
          select: { id: true, phoneNumber: true, status: true },
          take: 1,
        },
        _count: { select: { conversations: true, leads: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  static async findById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        whatsappSessions: {
          select: { id: true, phoneNumber: true, status: true },
        },
        _count: { select: { conversations: true, leads: true, contacts: true } },
      },
    })
    if (!user) throw new Error('Usuário não encontrado')
    return user
  }

  static async create(data: {
    name: string
    email: string
    password: string
    role: 'ADMIN' | 'USER'
  }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) throw new Error('E-mail já cadastrado')

    const passwordHash = await bcrypt.hash(data.password, authConfig.bcryptRounds)

    return prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    })
  }

  static async update(
    id: string,
    data: { name?: string; email?: string; password?: string; avatarUrl?: string }
  ) {
    const updateData: Record<string, unknown> = {}
    if (data.name) updateData.name = data.name
    if (data.email) updateData.email = data.email
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl || null
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, authConfig.bcryptRounds)
    }

    return prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, isActive: true, avatarUrl: true },
    })
  }

  static async setActive(id: string, isActive: boolean) {
    return prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })
  }

  static async setAiEnabled(id: string, aiEnabled: boolean) {
    return prisma.user.update({
      where: { id },
      data: { aiEnabled },
      select: { id: true, name: true, aiEnabled: true },
    })
  }

  static async delete(id: string, requesterId: string) {
    if (id === requesterId) {
      throw new Error('Você não pode excluir a si mesmo')
    }

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) throw new Error('Usuário não encontrado')

    // Não permite excluir o último admin
    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
      if (adminCount <= 1) throw new Error('Não é possível excluir o último administrador')
    }

    // Limpa dependências que bloqueiam a exclusão
    await prisma.rouletteAgentTeam.deleteMany({ where: { agent: { userId: id } } }).catch(() => {})
    await prisma.rouletteAgent.deleteMany({ where: { userId: id } }).catch(() => {})
    await prisma.cRMBoardMember.deleteMany({ where: { userId: id } }).catch(() => {})

    await prisma.user.delete({ where: { id } })
    return { id }
  }
}

import { prisma } from '../config/database'

export class ContactService {
  static async findAll(userId: string, role: string, search?: string) {
    const where: Record<string, unknown> = role === 'ADMIN' ? {} : { userId }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ]
    }

    return prisma.contact.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
        _count: { select: { conversations: true, leads: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  static async findById(id: string, userId: string, role: string) {
    const contact = await prisma.contact.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
        leads: {
          include: { pipelineStage: true },
          orderBy: { createdAt: 'desc' },
        },
        conversations: {
          include: { whatsappSession: { select: { phoneNumber: true } } },
          orderBy: { lastMessageAt: 'desc' },
          take: 5,
        },
      },
    })

    if (!contact) throw new Error('Contato não encontrado')
    if (role !== 'ADMIN' && contact.userId !== userId) throw new Error('Acesso negado')

    return contact
  }

  static async create(userId: string, data: {
    name: string
    phone: string
    city?: string
    documentNumber?: string
    notes?: string
  }) {
    return prisma.contact.create({
      data: { ...data, userId },
    })
  }

  static async update(id: string, userId: string, role: string, data: {
    name?: string
    phone?: string
    city?: string
    documentNumber?: string
    notes?: string
  }) {
    const contact = await prisma.contact.findUnique({ where: { id } })
    if (!contact) throw new Error('Contato não encontrado')
    if (role !== 'ADMIN' && contact.userId !== userId) throw new Error('Acesso negado')

    return prisma.contact.update({ where: { id }, data })
  }

  static async delete(id: string, userId: string, role: string) {
    const contact = await prisma.contact.findUnique({ where: { id } })
    if (!contact) throw new Error('Contato não encontrado')
    if (role !== 'ADMIN' && contact.userId !== userId) throw new Error('Acesso negado')

    return prisma.contact.delete({ where: { id } })
  }
}

import { ConversationStatus } from '@prisma/client'
import { prisma } from '../config/database'

export class ConversationService {
  static async findAll(userId: string, _role: string, filters?: { status?: string }) {
    // Cada usuário (inclusive admin) vê apenas as próprias conversas no Atendimento.
    // A visão de todas as conversas fica no Monitor ao Vivo (supervisão).
    const where: Record<string, unknown> = { userId }

    if (filters?.status) {
      where.status = filters.status as ConversationStatus
    }

    return prisma.conversation.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true, phone: true, avatarUrl: true } },
        user: { select: { id: true, name: true } },
        whatsappSession: { select: { id: true, phoneNumber: true, status: true } },
        tags: { include: { tag: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    })
  }

  static async findById(id: string, userId: string, role: string) {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        contact: true,
        lead: {
          include: { pipelineStage: true },
        },
        user: { select: { id: true, name: true } },
        whatsappSession: { select: { id: true, phoneNumber: true, status: true } },
        tags: { include: { tag: true } },
      },
    })

    if (!conversation) throw new Error('Conversa não encontrada')
    if (role !== 'ADMIN' && conversation.userId !== userId) {
      throw new Error('Acesso negado')
    }

    return conversation
  }

  static async getMessages(conversationId: string, userId: string, role: string, before?: string) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    })

    if (!conversation) throw new Error('Conversa não encontrada')
    if (role !== 'ADMIN' && conversation.userId !== userId) {
      throw new Error('Acesso negado')
    }

    const LIMIT = 60
    const where: Record<string, unknown> = { conversationId }
    if (before) {
      const ref = await prisma.message.findUnique({ where: { id: before }, select: { sentAt: true } })
      if (ref?.sentAt) where.sentAt = { lt: ref.sentAt }
    }

    // Pega as mais recentes primeiro (paginação para trás), depois inverte p/ exibir em ordem
    const rows = await prisma.message.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      take: LIMIT + 1,
    })
    const hasMore = rows.length > LIMIT
    const page = rows.slice(0, LIMIT).reverse()
    return { messages: page, hasMore }
  }

  static async updateStatus(
    id: string,
    userId: string,
    role: string,
    status: ConversationStatus
  ) {
    const conversation = await prisma.conversation.findUnique({ where: { id } })
    if (!conversation) throw new Error('Conversa não encontrada')
    if (role !== 'ADMIN' && conversation.userId !== userId) {
      throw new Error('Acesso negado')
    }

    return prisma.conversation.update({ where: { id }, data: { status } })
  }

  static async markAsRead(id: string, userId: string, role: string) {
    const conversation = await prisma.conversation.findUnique({ where: { id } })
    if (!conversation) throw new Error('Conversa não encontrada')
    if (role !== 'ADMIN' && conversation.userId !== userId) {
      throw new Error('Acesso negado')
    }

    return prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } })
  }
}

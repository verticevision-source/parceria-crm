import { ConversationStatus } from '@prisma/client'
import { prisma } from '../config/database'

export class ConversationService {
  static async findAll(userId: string, role: string, filters?: { status?: string }) {
    const where: Record<string, unknown> = role === 'ADMIN' ? {} : { userId }

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

  static async getMessages(conversationId: string, userId: string, role: string) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    })

    if (!conversation) throw new Error('Conversa não encontrada')
    if (role !== 'ADMIN' && conversation.userId !== userId) {
      throw new Error('Acesso negado')
    }

    return prisma.message.findMany({
      where: { conversationId },
      orderBy: { sentAt: 'asc' },
    })
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

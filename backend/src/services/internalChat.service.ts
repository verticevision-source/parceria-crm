import { prisma } from '../config/database'
import { Server as SocketServer } from 'socket.io'

let io: SocketServer | null = null
export function setInternalChatIO(socketServer: SocketServer): void { io = socketServer }

export class InternalChatService {
  // ── Grupos ─────────────────────────────────────────────────────────────────

  /** Lista grupos do usuário (admin vê todos) */
  static async listGroups(userId: string, isAdmin: boolean) {
    const where = isAdmin ? {} : { members: { some: { userId } } }
    const groups = await prisma.internalGroup.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        members: { include: { user: { select: { id: true, name: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: true, members: true } },
      },
    })

    // Calcula não-lidas por grupo para este usuário
    return Promise.all(groups.map(async (g) => {
      const membership = g.members.find((m) => m.userId === userId)
      const unread = membership
        ? await prisma.internalMessage.count({
            where: {
              groupId: g.id,
              userId: { not: userId },
              createdAt: membership.lastReadAt ? { gt: membership.lastReadAt } : undefined,
            },
          })
        : 0
      return {
        id: g.id, name: g.name, description: g.description, color: g.color,
        memberCount: g._count.members,
        members: g.members.map((m) => ({ id: m.user.id, name: m.user.name })),
        lastMessage: g.messages[0]?.body || null,
        lastMessageAt: g.messages[0]?.createdAt || null,
        unread,
        isMember: !!membership,
      }
    }))
  }

  static async createGroup(name: string, createdById: string, opts: {
    description?: string; color?: string; memberIds?: string[]
  }) {
    const group = await prisma.internalGroup.create({
      data: {
        name, createdById,
        description: opts.description, color: opts.color || '#6366f1',
        members: {
          create: Array.from(new Set([createdById, ...(opts.memberIds || [])])).map((userId) => ({ userId })),
        },
      },
      include: { members: true },
    })
    InternalChatService.notifyMembers(group.id)
    return group
  }

  static async updateGroup(id: string, data: { name?: string; description?: string; color?: string }) {
    return prisma.internalGroup.update({ where: { id }, data })
  }

  static async deleteGroup(id: string) {
    return prisma.internalGroup.delete({ where: { id } })
  }

  static async setMembers(groupId: string, memberIds: string[]) {
    await prisma.internalGroupMember.deleteMany({ where: { groupId } })
    await prisma.internalGroupMember.createMany({
      data: memberIds.map((userId) => ({ groupId, userId })),
      skipDuplicates: true,
    })
    InternalChatService.notifyMembers(groupId)
    return prisma.internalGroupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, name: true } } },
    })
  }

  // ── Mensagens ────────────────────────────────────────────────────────────────

  static async getMessages(groupId: string, userId: string, isAdmin: boolean) {
    if (!isAdmin) {
      const member = await prisma.internalGroupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
      })
      if (!member) throw new Error('Você não é membro deste grupo')
    }

    const messages = await prisma.internalMessage.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { user: { select: { id: true, name: true } } },
    })

    // Marca como lido
    await prisma.internalGroupMember.updateMany({
      where: { groupId, userId },
      data: { lastReadAt: new Date() },
    })

    return messages
  }

  static async sendMessage(groupId: string, userId: string, body: string, isAdmin: boolean) {
    if (!isAdmin) {
      const member = await prisma.internalGroupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
      })
      if (!member) throw new Error('Você não é membro deste grupo')
    }

    const message = await prisma.internalMessage.create({
      data: { groupId, userId, body },
      include: { user: { select: { id: true, name: true } } },
    })

    await prisma.internalGroup.update({ where: { id: groupId }, data: { updatedAt: new Date() } })

    // Emite para todos os membros via socket
    const members = await prisma.internalGroupMember.findMany({ where: { groupId } })
    if (io) {
      for (const m of members) {
        io.to(`user:${m.userId}`).emit('internal-message', { groupId, message })
      }
    }

    return message
  }

  private static async notifyMembers(groupId: string) {
    if (!io) return
    const members = await prisma.internalGroupMember.findMany({ where: { groupId } })
    for (const m of members) {
      io.to(`user:${m.userId}`).emit('internal-groups-updated', { groupId })
    }
  }

  // ── Supervisão: conversas de WhatsApp de um agente (admin) ───────────────────

  static async getAgentConversations(agentUserId: string) {
    return prisma.conversation.findMany({
      where: { userId: agentUserId },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      include: {
        contact: { select: { id: true, name: true, phone: true } },
      },
    })
  }

  static async getConversationMessages(conversationId: string) {
    return prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })
  }
}

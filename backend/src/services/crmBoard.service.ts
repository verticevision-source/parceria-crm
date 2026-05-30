import { prisma } from '../config/database'

export class CRMBoardService {

  // ── Boards ─────────────────────────────────────────────────────────────────

  static async listBoards(userId?: string, isAdmin = false) {
    if (isAdmin) {
      return prisma.cRMBoard.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { leads: true, stages: true, members: true } },
          stages: { orderBy: { order: 'asc' } },
        },
      })
    }
    // Usuário normal: só vê boards onde é membro
    return prisma.cRMBoard.findMany({
      where: {
        isActive: true,
        members: { some: { userId } },
      },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { leads: true, stages: true, members: true } },
        stages: { orderBy: { order: 'asc' } },
      },
    })
  }

  static async createBoard(data: {
    name: string
    description?: string
    color?: string
    icon?: string
    defaultStages?: string[]
  }) {
    const board = await prisma.cRMBoard.create({
      data: {
        name: data.name,
        description: data.description,
        color: data.color || '#6366f1',
        icon: data.icon || 'briefcase',
      },
    })

    // Cria estágios padrão se fornecidos
    const stages = data.defaultStages || ['Novo Lead', 'Contato Feito', 'Proposta Enviada', 'Negociação', 'Fechado']
    await prisma.pipelineStage.createMany({
      data: stages.map((name, order) => ({
        name,
        order,
        boardId: board.id,
        color: '#6366f1',
      })),
    })

    return prisma.cRMBoard.findUnique({
      where: { id: board.id },
      include: { stages: { orderBy: { order: 'asc' } } },
    })
  }

  static async updateBoard(id: string, data: {
    name?: string
    description?: string
    color?: string
    icon?: string
    isActive?: boolean
  }) {
    return prisma.cRMBoard.update({ where: { id }, data })
  }

  static async deleteBoard(id: string) {
    return prisma.cRMBoard.delete({ where: { id } })
  }

  // ── Membros ────────────────────────────────────────────────────────────────

  static async addMember(boardId: string, userId: string, role = 'member') {
    return prisma.cRMBoardMember.upsert({
      where: { boardId_userId: { boardId, userId } },
      create: { boardId, userId, role },
      update: { role },
    })
  }

  static async removeMember(boardId: string, userId: string) {
    return prisma.cRMBoardMember.delete({
      where: { boardId_userId: { boardId, userId } },
    })
  }

  static async listMembers(boardId: string) {
    return prisma.cRMBoardMember.findMany({
      where: { boardId },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
  }

  // ── Estágios ───────────────────────────────────────────────────────────────

  static async addStage(boardId: string, name: string, color?: string) {
    const last = await prisma.pipelineStage.findFirst({
      where: { boardId },
      orderBy: { order: 'desc' },
    })
    return prisma.pipelineStage.create({
      data: { name, boardId, order: (last?.order ?? -1) + 1, color: color || '#6366f1' },
    })
  }

  static async updateStage(stageId: string, data: { name?: string; color?: string; order?: number }) {
    return prisma.pipelineStage.update({ where: { id: stageId }, data })
  }

  static async deleteStage(stageId: string) {
    return prisma.pipelineStage.delete({ where: { id: stageId } })
  }

  // ── Leads do board ─────────────────────────────────────────────────────────

  static async getBoardKanban(boardId: string, userId: string, isAdmin: boolean) {
    // Verifica acesso
    if (!isAdmin) {
      const member = await prisma.cRMBoardMember.findUnique({
        where: { boardId_userId: { boardId, userId } },
      })
      if (!member) throw new Error('Sem acesso a este CRM')
    }

    const stages = await prisma.pipelineStage.findMany({
      where: { boardId },
      orderBy: { order: 'asc' },
      include: {
        leads: {
          where: { status: 'OPEN', boardId },
          orderBy: { lastInteractionAt: 'desc' },
          include: {
            contact: true,
            responsibleUser: { select: { id: true, name: true } },
            campaign: { select: { id: true, name: true } },
          },
        },
      },
    })

    // Enriquece cada lead com não-lidas / última mensagem da conversa do contato
    const contactIds = stages.flatMap((s) => s.leads.map((l) => l.contactId).filter(Boolean)) as string[]
    if (contactIds.length > 0) {
      const conversations = await prisma.conversation.findMany({
        where: { contactId: { in: contactIds } },
        select: { contactId: true, unreadCount: true, lastMessage: true, lastMessageAt: true },
        orderBy: { lastMessageAt: 'desc' },
      })
      // Agrupa por contato (soma não-lidas, pega a última msg)
      const byContact = new Map<string, { unread: number; lastMessage: string | null; lastMessageAt: Date | null }>()
      for (const c of conversations) {
        if (!c.contactId) continue
        const cur = byContact.get(c.contactId) || { unread: 0, lastMessage: null, lastMessageAt: null }
        cur.unread += c.unreadCount
        if (!cur.lastMessageAt && c.lastMessageAt) {
          cur.lastMessage = c.lastMessage
          cur.lastMessageAt = c.lastMessageAt
        }
        byContact.set(c.contactId, cur)
      }
      for (const s of stages) {
        for (const lead of s.leads as any[]) {
          const info = lead.contactId ? byContact.get(lead.contactId) : null
          lead.unreadCount = info?.unread || 0
          lead.lastMessage = info?.lastMessage || null
          lead.lastMessageAt = info?.lastMessageAt || null
        }
      }
    }

    return stages
  }
}

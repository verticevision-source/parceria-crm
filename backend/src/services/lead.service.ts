import { LeadStatus } from '@prisma/client'
import { prisma } from '../config/database'

export class LeadService {
  static async findAll(userId: string, role: string, filters?: {
    status?: string
    stageId?: string
    search?: string
  }) {
    const where: Record<string, unknown> = role === 'ADMIN' ? {} : { responsibleUserId: userId }

    if (filters?.status) where.status = filters.status as LeadStatus
    if (filters?.stageId) where.pipelineStageId = filters.stageId
    if (filters?.search) {
      where.contact = {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { phone: { contains: filters.search } },
        ],
      }
    }

    return prisma.lead.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true, phone: true, city: true } },
        pipelineStage: { select: { id: true, name: true, color: true, order: true } },
        responsibleUser: { select: { id: true, name: true } },
        _count: { select: { crmNotes: true, conversations: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })
  }

  static async findById(id: string, userId: string, role: string) {
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        contact: true,
        pipelineStage: true,
        responsibleUser: { select: { id: true, name: true, email: true } },
        crmNotes: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        conversations: {
          include: { contact: { select: { name: true, phone: true } } },
          orderBy: { lastMessageAt: 'desc' },
          take: 5,
        },
      },
    })

    if (!lead) throw new Error('Lead não encontrado')
    if (role !== 'ADMIN' && lead.responsibleUserId !== userId) throw new Error('Acesso negado')

    return lead
  }

  static async create(userId: string, data: {
    contactId: string
    pipelineStageId?: string
    boardId?: string
    source?: string
    value?: number
    notes?: string
    responsibleUserId?: string
  }) {
    const contact = await prisma.contact.findUnique({ where: { id: data.contactId } })
    if (!contact) throw new Error('Contato não encontrado')

    // Se boardId fornecido mas sem etapa, usa a primeira etapa do board
    let pipelineStageId = data.pipelineStageId
    if (data.boardId && !pipelineStageId) {
      const firstStage = await prisma.pipelineStage.findFirst({
        where: { boardId: data.boardId },
        orderBy: { order: 'asc' },
      })
      pipelineStageId = firstStage?.id
    }

    return prisma.lead.create({
      data: {
        ...data,
        pipelineStageId,
        responsibleUserId: data.responsibleUserId || userId,
        lastInteractionAt: new Date(),
      },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        pipelineStage: true,
        responsibleUser: { select: { id: true, name: true } },
      },
    })
  }

  static async update(id: string, userId: string, role: string, data: {
    pipelineStageId?: string
    status?: LeadStatus
    source?: string
    value?: number
    notes?: string
    responsibleUserId?: string
  }) {
    const lead = await prisma.lead.findUnique({ where: { id } })
    if (!lead) throw new Error('Lead não encontrado')
    if (role !== 'ADMIN' && lead.responsibleUserId !== userId) throw new Error('Acesso negado')

    return prisma.lead.update({
      where: { id },
      data: { ...data, lastInteractionAt: new Date() },
      include: {
        contact: true,
        pipelineStage: true,
        responsibleUser: { select: { id: true, name: true } },
      },
    })
  }

  static async updateStage(id: string, userId: string, role: string, pipelineStageId: string) {
    const lead = await prisma.lead.findUnique({ where: { id } })
    if (!lead) throw new Error('Lead não encontrado')
    if (role !== 'ADMIN' && lead.responsibleUserId !== userId) throw new Error('Acesso negado')

    return prisma.lead.update({
      where: { id },
      data: { pipelineStageId, lastInteractionAt: new Date() },
    })
  }

  static async updateStatus(id: string, userId: string, role: string, status: LeadStatus) {
    const lead = await prisma.lead.findUnique({ where: { id } })
    if (!lead) throw new Error('Lead não encontrado')
    if (role !== 'ADMIN' && lead.responsibleUserId !== userId) throw new Error('Acesso negado')

    return prisma.lead.update({
      where: { id },
      data: { status, lastInteractionAt: new Date() },
    })
  }

  static async delete(id: string, userId: string, role: string) {
    const lead = await prisma.lead.findUnique({ where: { id } })
    if (!lead) throw new Error('Lead não encontrado')
    if (role !== 'ADMIN' && lead.responsibleUserId !== userId) throw new Error('Acesso negado')

    // Remove dependências antes de deletar
    await prisma.rouletteLog.deleteMany({ where: { leadId: id } })
    await prisma.cRMNote.deleteMany({ where: { leadId: id } })
    await prisma.conversation.updateMany({ where: { leadId: id }, data: { leadId: null } })

    return prisma.lead.delete({ where: { id } })
  }

  static async createFromConversation(userId: string, conversationId: string, data?: {
    pipelineStageId?: string
    source?: string
    value?: number
    notes?: string
  }) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { contact: true },
    })

    if (!conversation) throw new Error('Conversa não encontrada')
    if (conversation.userId !== userId) throw new Error('Acesso negado')
    if (!conversation.contactId) throw new Error('Conversa não possui contato vinculado')

    const firstStage = await prisma.pipelineStage.findFirst({ orderBy: { order: 'asc' } })

    const lead = await prisma.lead.create({
      data: {
        contactId: conversation.contactId,
        responsibleUserId: userId,
        pipelineStageId: data?.pipelineStageId || firstStage?.id,
        source: data?.source || 'WhatsApp',
        value: data?.value,
        notes: data?.notes,
        lastInteractionAt: new Date(),
      },
      include: {
        contact: true,
        pipelineStage: true,
        responsibleUser: { select: { id: true, name: true } },
      },
    })

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { leadId: lead.id },
    })

    return lead
  }

  static async getNotes(leadId: string, userId: string, role: string) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } })
    if (!lead) throw new Error('Lead não encontrado')
    if (role !== 'ADMIN' && lead.responsibleUserId !== userId) throw new Error('Acesso negado')

    return prisma.cRMNote.findMany({
      where: { leadId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  static async addNote(leadId: string, userId: string, role: string, content: string) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } })
    if (!lead) throw new Error('Lead não encontrado')
    if (role !== 'ADMIN' && lead.responsibleUserId !== userId) throw new Error('Acesso negado')

    await prisma.lead.update({
      where: { id: leadId },
      data: { lastInteractionAt: new Date() },
    })

    return prisma.cRMNote.create({
      data: { leadId, userId, content },
      include: { user: { select: { id: true, name: true } } },
    })
  }
}

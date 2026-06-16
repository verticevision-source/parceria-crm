import { prisma } from '../config/database'

export class CallService {
  static async create(userId: string, data: {
    contactId: string
    leadId?: string
    phone: string
    direction?: string
    outcome?: string
    durationSec?: number
    notes?: string
  }) {
    return prisma.callLog.create({
      data: {
        userId,
        contactId: data.contactId,
        leadId: data.leadId || null,
        phone: data.phone,
        direction: data.direction || 'OUT',
        outcome: data.outcome || 'completed',
        durationSec: data.durationSec || 0,
        notes: data.notes || null,
      },
      include: { user: { select: { id: true, name: true } } },
    })
  }

  /** Lista ligações de um contato (ou lead). Admin vê todas; atendente só as suas. */
  static async list(userId: string, role: string, filters: { contactId?: string; leadId?: string }) {
    const where: Record<string, unknown> = {}
    if (filters.contactId) where.contactId = filters.contactId
    if (filters.leadId) where.leadId = filters.leadId
    if (role !== 'ADMIN') where.userId = userId

    return prisma.callLog.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  }

  static async remove(id: string, userId: string, role: string) {
    const call = await prisma.callLog.findUnique({ where: { id } })
    if (!call) throw new Error('Ligação não encontrada')
    if (role !== 'ADMIN' && call.userId !== userId) throw new Error('Acesso negado')
    return prisma.callLog.delete({ where: { id } })
  }
}

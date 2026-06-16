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
      take: 1000,  // limite de segurança; use a busca para encontrar mais antigos
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
    avatarUrl?: string
  }) {
    return prisma.contact.create({
      data: { ...data, userId },
    })
  }

  /** Normaliza telefone para formato WhatsApp (apenas dígitos, com DDI 55 do Brasil). */
  private static normalizeImportPhone(raw: string): string {
    let p = (raw || '').replace(/\D/g, '')
    // Remove zeros à esquerda
    p = p.replace(/^0+/, '')
    // Número brasileiro sem DDI (DDD + 8/9 dígitos = 10 ou 11) → adiciona 55
    if ((p.length === 10 || p.length === 11) && !p.startsWith('55')) {
      p = '55' + p
    }
    return p
  }

  /**
   * Importa contatos em massa (planilha). Pula duplicados (mesmo telefone para
   * o mesmo dono) e telefones inválidos. Admin pode atribuir a um atendente.
   */
  static async importMany(
    requesterId: string,
    targetUserId: string | undefined,
    rows: Array<{ name?: string; phone?: string; city?: string; documentNumber?: string; notes?: string }>
  ): Promise<{ total: number; created: number; skipped: number; invalid: number }> {
    const ownerId = targetUserId || requesterId
    let created = 0, skipped = 0, invalid = 0

    for (const row of rows) {
      const phone = ContactService.normalizeImportPhone(row.phone || '')
      if (!phone || phone.length < 12) { invalid++; continue }  // 55 + DDD + número

      const name = (row.name || '').trim() || phone

      const exists = await prisma.contact.findFirst({ where: { userId: ownerId, phone } })
      if (exists) { skipped++; continue }

      await prisma.contact.create({
        data: {
          userId: ownerId,
          name,
          phone,
          city: row.city?.trim() || null,
          documentNumber: row.documentNumber?.trim() || null,
          notes: row.notes?.trim() || null,
        },
      })
      created++
    }

    return { total: rows.length, created, skipped, invalid }
  }

  static async update(id: string, userId: string, role: string, data: {
    name?: string
    phone?: string
    city?: string
    documentNumber?: string
    notes?: string
    avatarUrl?: string
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

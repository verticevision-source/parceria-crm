import { prisma } from '../config/database'
import { getWhatsAppProvider } from '../providers/whatsapp/WhatsAppProviderFactory'
import { logger } from '../utils/logger'

export class BulkMessageService {

  /**
   * Resolve os contatos alvo baseado no filtro escolhido.
   * filterType: "tag" | "stage" | "board" | "no_response" | "campaign" | "all"
   */
  static async resolveTargets(
    filterType: string,
    filterValue?: string,
    filterDays?: number
  ): Promise<{ contactId: string; phone: string; name: string }[]> {

    let contacts: { id: string; phone: string; name: string }[] = []

    if (filterType === 'stage' && filterValue) {
      // Todos os leads numa etapa específica
      const leads = await prisma.lead.findMany({
        where: { pipelineStageId: filterValue, status: 'OPEN' },
        include: { contact: true },
      })
      contacts = leads.map(l => ({ id: l.contact.id, phone: l.contact.phone, name: l.contact.name }))

    } else if (filterType === 'board' && filterValue) {
      // Todos os leads de um board
      const leads = await prisma.lead.findMany({
        where: { boardId: filterValue, status: 'OPEN' },
        include: { contact: true },
      })
      contacts = leads.map(l => ({ id: l.contact.id, phone: l.contact.phone, name: l.contact.name }))

    } else if (filterType === 'campaign' && filterValue) {
      // Todos os leads de uma campanha
      const leads = await prisma.lead.findMany({
        where: { campaignId: filterValue },
        include: { contact: true },
      })
      contacts = leads.map(l => ({ id: l.contact.id, phone: l.contact.phone, name: l.contact.name }))

    } else if (filterType === 'tag' && filterValue) {
      // Leads com uma tag específica (tags é JSON array)
      const leads = await prisma.lead.findMany({
        where: { tags: { contains: filterValue }, status: 'OPEN' },
        include: { contact: true },
      })
      contacts = leads.map(l => ({ id: l.contact.id, phone: l.contact.phone, name: l.contact.name }))

    } else if (filterType === 'no_response' && filterDays) {
      // Conversas sem resposta há X dias
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - filterDays)
      const convs = await prisma.conversation.findMany({
        where: {
          status: 'OPEN',
          lastMessageAt: { lt: cutoff },
        },
        include: { contact: true },
        distinct: ['contactId'],
      })
      contacts = convs
        .filter(c => c.contact)
        .map(c => ({ id: c.contact!.id, phone: c.contact!.phone, name: c.contact!.name }))
    }

    // Remove duplicados por contactId
    const seen = new Set<string>()
    return contacts
      .filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true })
      .map(c => ({ contactId: c.id, phone: c.phone, name: c.name }))
  }

  // ── Criar campanha de disparo ──────────────────────────────────────────────

  static async create(data: {
    name: string
    message: string
    filterType: string
    filterValue?: string
    filterDays?: number
    createdById: string
  }) {
    // Resolve targets previamente para mostrar contagem
    const targets = await BulkMessageService.resolveTargets(
      data.filterType, data.filterValue, data.filterDays
    )

    const bulk = await prisma.bulkMessage.create({
      data: {
        name: data.name,
        message: data.message,
        filterType: data.filterType,
        filterValue: data.filterValue,
        filterDays: data.filterDays,
        createdById: data.createdById,
        totalCount: targets.length,
        recipients: {
          create: targets.map(t => ({
            contactId: t.contactId,
            phone: t.phone,
            status: 'pending',
          })),
        },
      },
    })

    return { bulk, totalContacts: targets.length }
  }

  // ── Disparar mensagens ─────────────────────────────────────────────────────

  static async send(bulkId: string): Promise<void> {
    const bulk = await prisma.bulkMessage.findUnique({
      where: { id: bulkId },
      include: { recipients: { where: { status: 'pending' } } },
    })

    if (!bulk) throw new Error('Campanha não encontrada')
    if (bulk.status === 'RUNNING') throw new Error('Campanha já está em execução')
    if (bulk.status === 'DONE') throw new Error('Campanha já foi concluída')

    await prisma.bulkMessage.update({
      where: { id: bulkId },
      data: { status: 'RUNNING', startedAt: new Date() },
    })

    // Busca sessão WhatsApp ativa
    const session = await prisma.whatsAppSession.findFirst({
      where: { status: 'CONNECTED' },
      orderBy: { createdAt: 'desc' },
    })

    if (!session) {
      await prisma.bulkMessage.update({
        where: { id: bulkId },
        data: { status: 'FAILED' },
      })
      throw new Error('Nenhuma sessão WhatsApp conectada')
    }

    const provider = getWhatsAppProvider()
    let sentCount = 0
    let failedCount = 0

    for (const recipient of bulk.recipients) {
      try {
        // Personaliza a mensagem com o nome do contato se tiver {{nome}}
        const contact = await prisma.contact.findUnique({ where: { id: recipient.contactId } })
        const personalizedMsg = bulk.message.replace(/\{\{nome\}\}/gi, contact?.name || '')

        await provider.sendMessage(session.id, recipient.phone, personalizedMsg)

        await prisma.bulkMessageRecipient.update({
          where: { id: recipient.id },
          data: { status: 'sent', sentAt: new Date() },
        })
        sentCount++

        // Delay entre mensagens para evitar ban (1-3 segundos)
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000))

      } catch (err: any) {
        logger.error(`[BulkMessage] Erro ao enviar para ${recipient.phone}:`, err.message)
        await prisma.bulkMessageRecipient.update({
          where: { id: recipient.id },
          data: { status: 'failed', errorMessage: err.message?.substring(0, 200) },
        })
        failedCount++
      }

      // Atualiza progresso a cada 10 envios
      if ((sentCount + failedCount) % 10 === 0) {
        await prisma.bulkMessage.update({
          where: { id: bulkId },
          data: { sentCount, failedCount },
        })
      }
    }

    // Finaliza
    await prisma.bulkMessage.update({
      where: { id: bulkId },
      data: { status: 'DONE', sentCount, failedCount, finishedAt: new Date() },
    })

    logger.info(`[BulkMessage] ${bulk.name}: ${sentCount} enviados, ${failedCount} falhados`)
  }

  // ── Listar campanhas ───────────────────────────────────────────────────────

  static async list() {
    return prisma.bulkMessage.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { recipients: true } },
      },
    })
  }

  static async getById(id: string) {
    return prisma.bulkMessage.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
        recipients: {
          take: 100,
          orderBy: { status: 'asc' },
          include: { contact: { select: { id: true, name: true, phone: true } } },
        },
      },
    })
  }

  static async delete(id: string) {
    const bulk = await prisma.bulkMessage.findUnique({ where: { id } })
    if (bulk?.status === 'RUNNING') throw new Error('Não pode deletar campanha em execução')
    return prisma.bulkMessage.delete({ where: { id } })
  }

  // ── Preview: mostra quantos contatos seriam atingidos ─────────────────────

  static async preview(filterType: string, filterValue?: string, filterDays?: number) {
    const targets = await BulkMessageService.resolveTargets(filterType, filterValue, filterDays)
    return { count: targets.length, samples: targets.slice(0, 5) }
  }
}

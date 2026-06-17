import { prisma } from '../config/database'
import { WhatsAppService } from './whatsapp.service'

/**
 * Agendamento de mensagens. Um poller verifica a cada minuto as mensagens
 * pendentes cujo horário já chegou e as envia via WhatsAppService.
 */
export class ScheduledMessageService {
  private static timer: NodeJS.Timeout | null = null
  private static running = false

  static start() {
    if (this.timer) return
    // roda a cada 30s; processa o que estiver vencido
    this.timer = setInterval(() => this.tick().catch((e) => console.error('[scheduler] tick erro:', e)), 30_000)
    console.log('[scheduler] mensagens agendadas: poller iniciado')
  }

  static async tick() {
    if (this.running) return
    this.running = true
    try {
      const due = await prisma.scheduledMessage.findMany({
        where: { status: 'PENDING', sendAt: { lte: new Date() } },
        orderBy: { sendAt: 'asc' },
        take: 20,
      })
      for (const msg of due) {
        try {
          await WhatsAppService.sendMessage(msg.userId, msg.toPhone, msg.body)
          await prisma.scheduledMessage.update({
            where: { id: msg.id },
            data: { status: 'SENT', sentAt: new Date(), error: null },
          })
          console.log(`[scheduler] enviada agendada ${msg.id} -> ${msg.toPhone}`)
        } catch (e: any) {
          await prisma.scheduledMessage.update({
            where: { id: msg.id },
            data: { status: 'FAILED', error: String(e?.message || e) },
          })
          console.error(`[scheduler] falha ao enviar ${msg.id}:`, e?.message || e)
        }
      }
    } finally {
      this.running = false
    }
  }

  static async create(userId: string, data: { toPhone: string; body: string; sendAt: Date; conversationId?: string; contactId?: string }) {
    return prisma.scheduledMessage.create({
      data: {
        userId,
        toPhone: data.toPhone,
        body: data.body,
        sendAt: data.sendAt,
        conversationId: data.conversationId ?? null,
        contactId: data.contactId ?? null,
      },
    })
  }

  static async list(userId: string, role: string, conversationId?: string) {
    return prisma.scheduledMessage.findMany({
      where: {
        ...(role === 'ADMIN' ? {} : { userId }),
        ...(conversationId ? { conversationId } : {}),
      },
      orderBy: { sendAt: 'asc' },
    })
  }

  static async cancel(userId: string, role: string, id: string) {
    const msg = await prisma.scheduledMessage.findUnique({ where: { id } })
    if (!msg) throw new Error('Agendamento não encontrado')
    if (role !== 'ADMIN' && msg.userId !== userId) throw new Error('Sem permissão')
    if (msg.status !== 'PENDING') throw new Error('Só é possível cancelar agendamentos pendentes')
    return prisma.scheduledMessage.update({ where: { id }, data: { status: 'CANCELED' } })
  }
}

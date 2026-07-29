import { ConversationStatus } from '@prisma/client'
import { prisma } from '../config/database'

/** Quanto tempo sem o cliente responder já é "esfriando". */
const SEM_RESPOSTA_MS = 60 * 60 * 1000

export type AISignal = 'vermelho' | 'amarelo' | 'verde' | null

/**
 * Semáforo do atendimento automático:
 *   🔴 vermelho — a IA não soube e jogou pra equipe (ou bateu no teto). Tem
 *      cliente esperando gente de verdade. Sempre ganha das outras cores.
 *   🟡 amarelo  — falamos por último e o cliente não responde há 1h+.
 *   🟢 verde    — a ficha de cadastro já foi enviada (objetivo cumprido).
 *
 * Vermelho e amarelo vêm antes do verde de propósito: a cor existe pra puxar
 * atenção pro que precisa de ação, não pra comemorar o que já deu certo.
 */
export function aiSignal(
  conv: { aiAuto: boolean; aiNeedsHuman: boolean; linkEnviado?: boolean; lastMessageAt: Date | null },
  ultima?: { direction: 'IN' | 'OUT'; textBody?: string | null }
): AISignal {
  if (!conv.aiAuto) return null
  if (conv.aiNeedsHuman) return 'vermelho'

  // Amarelo só quando a ÚLTIMA coisa que mandamos foi uma PERGUNTA sem resposta.
  // Sem esse filtro, toda conversa que terminou bem ("Obrigada, boa noite!")
  // virava amarelo: 10 de 13 acendiam sem ter o que fazer, e alerta que pede
  // ação inexistente ensina a equipe a ignorar a cor.
  const perguntamos = ultima?.direction === 'OUT' && (ultima.textBody || '').includes('?')
  const semResposta =
    perguntamos &&
    conv.lastMessageAt != null &&
    Date.now() - conv.lastMessageAt.getTime() > SEM_RESPOSTA_MS
  if (semResposta) return 'amarelo'

  if (conv.linkEnviado) return 'verde'
  return null
}

export class ConversationService {
  static async findAll(userId: string, _role: string, filters?: { status?: string }) {
    // Cada usuário (inclusive admin) vê apenas as próprias conversas no Atendimento.
    // A visão de todas as conversas fica no Monitor ao Vivo (supervisão).
    const where: Record<string, unknown> = { userId }

    if (filters?.status) {
      where.status = filters.status as ConversationStatus
    } else {
      // Sem filtro = "Ativas": arquivadas (CLOSED) só aparecem pedindo
      // explicitamente ?status=CLOSED (aba Arquivadas). Se o cliente escrever
      // de novo, o inbound força OPEN e a conversa volta pra cá sozinha.
      where.status = { not: 'CLOSED' satisfies ConversationStatus }
    }

    const convs = await prisma.conversation.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true, phone: true, avatarUrl: true } },
        user: { select: { id: true, name: true } },
        whatsappSession: { select: { id: true, phoneNumber: true, status: true } },
        tags: { include: { tag: true } },
        _count: { select: { messages: true } },
        // Direção da última mensagem: é o que diz se estamos esperando o
        // cliente (amarelo) ou o cliente esperando a gente.
        messages: { take: 1, orderBy: { createdAt: 'desc' }, select: { direction: true, textBody: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    // Quem já recebeu a ficha de cadastro. Uma consulta pra lista toda, em vez
    // de uma por conversa. Casa pelo caminho do link (/novo-cadastro/) e não
    // pelo token, senão trocar o link de um vendedor apagaria o histórico verde.
    const comLink = new Set(
      (
        await prisma.message.findMany({
          where: {
            conversationId: { in: convs.map((c) => c.id) },
            direction: 'OUT',
            textBody: { contains: '/novo-cadastro/' },
          },
          select: { conversationId: true },
          distinct: ['conversationId'],
        })
      ).map((m) => m.conversationId)
    )

    return convs.map((c) => {
      const { messages, ...rest } = c
      return {
        ...rest,
        aiSignal: aiSignal({ ...c, linkEnviado: comLink.has(c.id) }, messages[0]),
      }
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

import { prisma } from '../config/database'

export class SearchService {
  /** Busca global: contatos e mensagens. Admin vê tudo; atendente só o seu. */
  static async search(userId: string, role: string, q: string) {
    const term = (q || '').trim()
    if (term.length < 2) return { contacts: [], messages: [] }

    const scope = role === 'ADMIN' ? {} : { userId }

    const [contacts, messages] = await Promise.all([
      prisma.contact.findMany({
        where: {
          ...scope,
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { phone: { contains: term.replace(/\D/g, '') || term } },
          ],
        },
        select: { id: true, name: true, phone: true, avatarUrl: true },
        take: 15,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.message.findMany({
        where: {
          ...scope,
          textBody: { contains: term, mode: 'insensitive' },
        },
        select: {
          id: true, textBody: true, direction: true, createdAt: true, conversationId: true,
          contact: { select: { id: true, name: true, phone: true } },
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return { contacts, messages }
  }
}

import { prisma } from '../config/database'

/**
 * Carteiras do Parceria Financeiro que o usuário logado gerencia.
 *
 * O CRM não guarda saldo nem parcela — só o vínculo. Toda consulta de dinheiro
 * vai para o financeiro (Fase B/C), sempre com o walletId validado por aqui:
 * é este método que define o escopo do gerente. Admin enxerga todas as
 * carteiras vinculadas, para conseguir apoiar/auditar.
 */
export class PortfolioService {
  static async getMyWallets(userId: string, role: string) {
    const where = role === 'ADMIN' ? { isActive: true } : { userId, isActive: true }
    return prisma.walletLink.findMany({
      where,
      select: {
        id: true,
        walletId: true,
        walletName: true,
        whatsappSessionId: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { walletName: 'asc' },
    })
  }

  /**
   * O usuário pode operar esta carteira? Guarda obrigatória antes de qualquer
   * chamada ao financeiro que envolva dinheiro — sem ela, bastaria trocar o
   * walletId no corpo da requisição para mexer na carteira de outra pessoa.
   */
  static async canOperate(userId: string, role: string, walletId: string): Promise<boolean> {
    if (role === 'ADMIN') return true
    const link = await prisma.walletLink.findFirst({
      where: { userId, walletId, isActive: true },
      select: { id: true },
    })
    return Boolean(link)
  }

  /**
   * Amarra um número de WhatsApp à carteira (admin).
   *
   * A sessão TEM que ser do próprio gerente da carteira. Como o dono da conversa
   * é o dono da sessão, apontar pro número de outra pessoa faria a cobrança sair
   * pelo número dela e a conversa cair no Atendimento dela — a gerente cobraria
   * e nunca veria a resposta do cliente.
   */
  static async setWalletSession(linkId: string, sessionId: string | null) {
    const link = await prisma.walletLink.findUnique({
      where: { id: linkId },
      select: { id: true, userId: true, walletName: true },
    })
    if (!link) throw new Error('Vínculo de carteira não encontrado')

    if (sessionId) {
      const sess = await prisma.whatsAppSession.findUnique({
        where: { id: sessionId },
        select: { userId: true, phoneNumber: true, status: true },
      })
      if (!sess) throw new Error('Número não encontrado')
      if (sess.userId !== link.userId) {
        throw new Error('Este número não é do gerente desta carteira — a resposta do cliente cairia no painel de outra pessoa')
      }
    }

    return prisma.walletLink.update({
      where: { id: linkId },
      data: { whatsappSessionId: sessionId },
      select: { id: true, walletName: true, whatsappSessionId: true },
    })
  }

  /**
   * Por qual número esta carteira cobra. Ordem: número amarrado à carteira →
   * qualquer número conectado do próprio gerente. Sem nenhum, erro explicando
   * o que fazer (em vez de "falha ao enviar").
   */
  static async sessionParaCobranca(userId: string, walletId?: string): Promise<string> {
    if (walletId) {
      const link = await prisma.walletLink.findFirst({
        where: { userId, walletId, isActive: true, whatsappSessionId: { not: null } },
        select: { whatsappSessionId: true },
      })
      if (link?.whatsappSessionId) {
        const s = await prisma.whatsAppSession.findUnique({
          where: { id: link.whatsappSessionId },
          select: { id: true, status: true },
        })
        if (s?.status === 'CONNECTED') return s.id
      }
    }

    const propria = await prisma.whatsAppSession.findFirst({
      where: { userId, status: 'CONNECTED' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (propria) return propria.id

    throw new Error(
      'Você não tem número de WhatsApp conectado. Peça ao administrador para gerar seu link de conexão em Gerenciar Números.'
    )
  }
}

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
}

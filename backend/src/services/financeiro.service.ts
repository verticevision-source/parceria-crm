import { prisma } from '../config/database'
import { logger } from '../utils/logger'

/**
 * Cliente HTTP do Parceria Financeiro.
 *
 * O CRM NÃO guarda dinheiro: saldo, parcela e transação têm uma fonte da
 * verdade só, que é o financeiro. Aqui só perguntamos.
 *
 * Toda chamada leva o e-mail do usuário logado, e o financeiro decide o escopo
 * a partir do dono da carteira. Mesmo que o vínculo local (WalletLink) fique
 * velho, o CRM não consegue ler a carteira de outra pessoa.
 */

const TIMEOUT_MS = 15000

function base(): { url: string; key: string } {
  const url = process.env.FINANCEIRO_API_URL
  const key = process.env.INTEGRATION_KEY
  if (!url || !key) {
    throw new Error('Integração com o financeiro não configurada (FINANCEIRO_API_URL / INTEGRATION_KEY)')
  }
  return { url: url.replace(/\/$/, ''), key }
}

async function pedir<T>(caminho: string, params: Record<string, string | undefined>): Promise<T> {
  const { url, key } = base()
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)

  // Timeout explícito: sem ele, o financeiro fora do ar deixa a tela da gerente
  // girando pra sempre em vez de dizer que não deu.
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${url}/api/integration/${caminho}?${qs}`, {
      headers: { 'x-integration-key': key },
      signal: ctrl.signal,
    })
    const corpo = (await res.json().catch(() => null)) as any
    if (!res.ok) {
      const detalhe = corpo?.error || corpo?.detail || `HTTP ${res.status}`
      throw new Error(`Financeiro respondeu ${detalhe}`)
    }
    return corpo as T
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('O sistema financeiro não respondeu (tempo esgotado)')
    throw e
  } finally {
    clearTimeout(t)
  }
}

export class FinanceiroService {
  /** E-mail do usuário — é o que define o escopo do outro lado. */
  private static async emailDe(userId: string): Promise<string> {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (!u?.email) throw new Error('Usuário sem e-mail — não é possível consultar o financeiro')
    return u.email
  }

  /**
   * Carteira do usuário logado. `walletId` é opcional e, quando vem, é
   * validado contra os vínculos locais antes de sair daqui — o financeiro
   * confere de novo, mas errar cedo dá mensagem melhor que 404 genérico.
   */
  static async minhaCarteira(userId: string, walletId?: string) {
    if (walletId) {
      const vinculo = await prisma.walletLink.findFirst({
        where: { userId, walletId, isActive: true },
        select: { id: true },
      })
      if (!vinculo) throw new Error('Esta carteira não está vinculada a você')
    }
    const email = await FinanceiroService.emailDe(userId)
    logger.info(`[Financeiro] Carteira de ${email}${walletId ? ` (carteira ${walletId})` : ''}`)
    return pedir<any>('portfolio', { email, walletId })
  }

  /** Ficha completa do cliente. Casa por CPF; telefone é fallback. */
  static async fichaCliente(
    userId: string,
    chave: { cpf?: string; id?: string; phone?: string }
  ) {
    const email = await FinanceiroService.emailDe(userId)
    return pedir<any>('borrower', { email, cpf: chave.cpf, id: chave.id, phone: chave.phone })
  }
}

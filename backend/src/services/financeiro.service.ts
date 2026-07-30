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

/**
 * Erro do financeiro em português de gente. Quem lê isso é a gerente de
 * carteira no meio de uma cobrança — "HTTP 404" não diz a ela o que fazer, e
 * pior: parece que o cliente não existe quando o problema é outro.
 */
function traduzErro(status: number, corpo: any): string {
  const codigo = corpo?.error as string | undefined

  // Rota inexistente devolve HTML, não JSON: o financeiro está desatualizado.
  if (status === 404 && !codigo) {
    return 'O sistema financeiro ainda não foi atualizado com esta função. Avise o administrador.'
  }
  switch (codigo) {
    case 'unauthorized':
      return 'A chave de integração com o financeiro está incorreta. Avise o administrador.'
    case 'company_indefinida':
      return 'A integração com o financeiro está sem a empresa configurada. Avise o administrador.'
    case 'gerente_nao_encontrado':
      return 'Seu usuário não está cadastrado como gerente de carteira no sistema financeiro.'
    case 'cliente_nao_encontrado':
      return 'Cliente não encontrado nas suas carteiras.'
    case 'email_obrigatorio':
      return 'Seu usuário está sem e-mail no CRM — não é possível consultar o financeiro.'
    // ── baixa de pagamento ──
    case 'caixa_fechado':
      return corpo?.detail || 'Abra o caixa da carteira antes de dar baixa.'
    case 'senha_invalida':
      return corpo?.detail || 'Senha de operação incorreta.'
    case 'fora_da_sua_carteira':
      return 'Este empréstimo não é de uma carteira sua.'
    case 'parcela_ja_paga':
      return 'Esta parcela já está paga.'
    case 'parcela_nao_encontrada':
      return 'Parcela não encontrada.'
    case 'emprestimo_nao_encontrado':
      return 'Empréstimo não encontrado.'
    case 'juros_maior_que_valor':
      return 'O juros faz parte do valor recebido — não pode ser maior que ele.'
    case 'valor_invalido':
      return 'Informe um valor recebido maior que zero.'
  }
  if (status >= 500) return 'O sistema financeiro está com problema no momento. Tente de novo em instantes.'
  return `Não foi possível consultar o financeiro (erro ${status}).`
}

/**
 * Falha de REDE (servidor fora do ar, DNS, conexão recusada). Sem isso a
 * mensagem crua chega como "ECONNREFUSED", que o errorHandler classifica como
 * erro interno e transforma num "Erro interno do servidor" genérico — a gerente
 * não descobre que o problema é o financeiro estar fora.
 */
function ehFalhaDeRede(e: any): boolean {
  const m = String(e?.message || '')
  return (
    e?.name === 'TypeError' ||
    /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(m)
  )
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
    if (!res.ok) throw new Error(traduzErro(res.status, corpo))
    return corpo as T
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('O sistema financeiro não respondeu em tempo. Tente de novo.')
    if (ehFalhaDeRede(e)) throw new Error('Não foi possível falar com o sistema financeiro. Avise o administrador.')
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

  /**
   * Dá baixa num pagamento. O CRM é só o mensageiro: quem escreve parcela,
   * saldo, caixa e transação é o financeiro, dentro de uma transação só.
   *
   * A senha de operação passa por aqui e NÃO é gravada nem registrada em log
   * em nenhum ponto — segue direto pro financeiro, que compara com o hash dele.
   */
  static async darBaixa(
    userId: string,
    dados: {
      loanId: string
      installmentId: string
      amount: number
      moraAmount?: number
      metodo?: 'DINHEIRO' | 'PIX'
      opPassword: string
      eventoId: string
    }
  ) {
    const email = await FinanceiroService.emailDe(userId)
    const { url, key } = base()

    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(`${url}/api/integration/payments`, {
        method: 'POST',
        headers: { 'x-integration-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dados, email }),
        signal: ctrl.signal,
      })
      const corpo = (await res.json().catch(() => null)) as any
      if (!res.ok) throw new Error(traduzErro(res.status, corpo))
      // Log SEM valor e SEM senha: o que interessa pra auditoria daqui é que a
      // baixa foi pedida e por quem; o dinheiro é auditado no financeiro.
      logger.info(`[Financeiro] Baixa registrada por ${email} (evento ${dados.eventoId})`)
      return corpo
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // Timeout numa baixa é o pior caso: pode ter sido gravada e a resposta
        // se perdeu. A chave de idempotência garante que repetir não duplica.
        throw new Error(
          'O financeiro não respondeu em tempo. A baixa PODE ter sido registrada — confira no financeiro antes de tentar de novo (repetir a mesma baixa não duplica).'
        )
      }
      if (ehFalhaDeRede(e)) {
        // Aqui a baixa NÃO saiu: a conexão nem foi estabelecida.
        throw new Error('Não foi possível falar com o sistema financeiro — a baixa NÃO foi registrada. Avise o administrador.')
      }
      throw e
    } finally {
      clearTimeout(t)
    }
  }

  /**
   * Este telefone é de um cliente das carteiras deste usuário?
   *
   * Guarda do envio de cobrança: sem ela, bastaria trocar o telefone no corpo
   * da requisição para disparar mensagem pelo número da empresa para qualquer
   * pessoa. Confere pelos DÍGITOS (o financeiro guarda telefone como texto
   * livre e o CRM guarda 5517999998888).
   */
  static async clienteDaMinhaCarteira(
    userId: string,
    phone: string
  ): Promise<{ ok: boolean; nome?: string; walletId?: string }> {
    const digitos = (s: string) => String(s || '').replace(/\D/g, '')
    const alvo = digitos(phone)
    if (alvo.length < 8) return { ok: false }

    const carteira = await FinanceiroService.minhaCarteira(userId)
    for (const c of carteira?.clientes || []) {
      const d = digitos(c?.cliente?.telefone)
      if (d.length >= 8 && (d.endsWith(alvo.slice(-10)) || alvo.endsWith(d.slice(-10)))) {
        return { ok: true, nome: c.cliente.nome, walletId: c.walletId }
      }
    }
    return { ok: false }
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

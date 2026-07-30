import { Router, Response } from 'express'
import { PortfolioService } from '../services/portfolio.service'
import { FinanceiroService } from '../services/financeiro.service'
import { authMiddleware } from '../middlewares/auth.middleware'
import { asyncHandler } from '../utils/asyncHandler'
import { AuthRequest } from '../types'
import { prisma } from '../config/database'

const router = Router()

router.use(authMiddleware)

router.get(
  '/wallets',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const wallets = await PortfolioService.getMyWallets(req.user!.userId, req.user!.role)
    res.json({ success: true, data: wallets })
  })
)

/** Clientes da carteira, com atrasos. Vem do financeiro a cada consulta. */
router.get(
  '/clients',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await FinanceiroService.minhaCarteira(
      req.user!.userId,
      (req.query.walletId as string) || undefined
    )
    res.json({ success: true, data })
  })
)

/** Ficha completa do cliente (por CPF, id ou telefone). */
router.get(
  '/borrower',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { cpf, id, phone } = req.query
    if (!cpf && !id && !phone) {
      res.status(400).json({ success: false, message: 'Informe cpf, id ou phone' })
      return
    }
    const data = await FinanceiroService.fichaCliente(req.user!.userId, {
      cpf: cpf as string | undefined,
      id: id as string | undefined,
      phone: phone as string | undefined,
    })
    res.json({ success: true, data })
  })
)

/**
 * Baixa de pagamento. O CRM NÃO grava dinheiro: só repassa pro financeiro, que
 * é a fonte da verdade de saldo, caixa e transação.
 */
router.post(
  '/payments',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { loanId, installmentId, amount, moraAmount, metodo, opPassword, eventoId } = req.body || {}
    if (!loanId || !installmentId) {
      res.status(400).json({ success: false, message: 'Informe o empréstimo e a parcela' })
      return
    }
    if (!opPassword) {
      res.status(400).json({ success: false, message: 'Confirme com sua senha de operação' })
      return
    }
    if (!eventoId) {
      res.status(400).json({ success: false, message: 'Requisição sem identificador — recarregue a tela' })
      return
    }
    const data = await FinanceiroService.darBaixa(req.user!.userId, {
      loanId, installmentId,
      amount: Number(amount),
      moraAmount: Number(moraAmount ?? 0),
      metodo: metodo === 'PIX' ? 'PIX' : 'DINHEIRO',
      opPassword: String(opPassword),
      eventoId: String(eventoId),
    })
    res.json({ success: true, data })
  })
)

/**
 * Cobrar o cliente pelo número da carteira.
 *
 * Passa pelo sistema (e não pelo wa.me) por dois motivos: sai pelo número da
 * empresa, e a conversa fica registrada no Atendimento — cobrança pelo celular
 * pessoal não deixa rastro nenhum e ninguém consegue auditar o que foi dito.
 */
router.post(
  '/collect',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { phone, body, walletId } = req.body || {}
    if (!phone || !String(body || '').trim()) {
      res.status(400).json({ success: false, message: 'Informe o telefone e a mensagem' })
      return
    }

    // Só cliente da própria carteira. Sem esta guarda, trocar o telefone no
    // corpo da requisição disparava mensagem pelo número da empresa pra
    // qualquer pessoa.
    const dono = await FinanceiroService.clienteDaMinhaCarteira(req.user!.userId, String(phone))
    if (!dono.ok) {
      res.status(403).json({ success: false, message: 'Este telefone não é de um cliente das suas carteiras' })
      return
    }

    const sessionId = await PortfolioService.sessionParaCobranca(
      req.user!.userId,
      (walletId as string) || dono.walletId
    )
    const { WhatsAppService } = await import('../services/whatsapp.service')
    const msg = await WhatsAppService.sendFromSession(sessionId, String(phone), String(body).trim(), {
      humanPainel: true,
    })
    res.json({ success: true, data: { enviada: true, cliente: dono.nome, messageId: msg?.id } })
  })
)

/**
 * Link para o cliente atualizar a ficha DELE — e, opcionalmente, já envia.
 * É o que a gerente de carteira usa: ela cuida de quem já é cliente, então o
 * link de captação do vendedor não serve pra ela.
 */
router.post(
  '/borrower-update-link',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, cpf, phone, enviar } = req.body || {}
    if (!id && !cpf && !phone) {
      res.status(400).json({ success: false, message: 'Informe o cliente (id, CPF ou telefone)' })
      return
    }
    const r = await FinanceiroService.linkAtualizacaoCliente(req.user!.userId, { id, cpf, phone })

    let enviada = false
    if (enviar && phone) {
      const dono = await FinanceiroService.clienteDaMinhaCarteira(req.user!.userId, String(phone))
      if (!dono.ok) {
        res.status(403).json({ success: false, message: 'Este telefone não é de um cliente das suas carteiras' })
        return
      }
      const sessionId = await PortfolioService.sessionParaCobranca(req.user!.userId, dono.walletId)
      const primeiro = (r.cliente?.nome || '').trim().split(/\s+/)[0]
      const texto =
        `Oi${primeiro ? ` ${primeiro}` : ''}, tudo bem?\n\n` +
        `Para manter seu cadastro em dia, atualize seus dados neste link:\n${r.link}\n\n` +
        `Qualquer dúvida me chama por aqui.`
      const { WhatsAppService } = await import('../services/whatsapp.service')
      await WhatsAppService.sendFromSession(sessionId, String(phone), texto, { humanPainel: true })
      enviada = true
    }

    res.json({ success: true, data: { ...r, enviada } })
  })
)

/** Admin: cadastra a chave PIX da carteira. Fica por carteira, nunca fixa no
 *  robô — chave errada é cliente pagando na conta de outra pessoa. */
router.patch(
  '/wallets/:linkId/pix',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Apenas administrador' })
      return
    }
    const chave = String(req.body?.pixKey || '').trim() || null
    const link = await prisma.walletLink.update({
      where: { id: req.params.linkId },
      data: { pixKey: chave },
      select: { id: true, walletName: true, pixKey: true },
    })
    res.json({ success: true, data: link })
  })
)

/**
 * Admin: cria (ou regenera) o robô de atendimento desta carteira, SEMPRE
 * desativado. Ativar é um passo separado e consciente, pelo /flows.
 *
 * Regerar é seguro e idempotente pelo nome: ao trocar a chave PIX, rode de novo
 * para o robô passar a mandar a chave nova.
 */
router.post(
  '/wallets/:linkId/bot',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Apenas administrador' })
      return
    }
    const link = await prisma.walletLink.findUnique({
      where: { id: req.params.linkId },
      select: { walletName: true, whatsappSessionId: true, pixKey: true, user: { select: { name: true } } },
    })
    if (!link) {
      res.status(404).json({ success: false, message: 'Carteira não encontrada' })
      return
    }
    if (!link.whatsappSessionId) {
      res.status(409).json({
        success: false,
        message: 'Amarre um número de WhatsApp a esta carteira antes de criar o robô',
      })
      return
    }

    const { criarRoboCarteira } = await import('../services/roboCarteira')
    const flow = await criarRoboCarteira({
      nome: `Atendimento ${link.walletName} (${link.user.name})`,
      sessionId: link.whatsappSessionId,
      pixKey: link.pixKey,
      linkAmanda: String(req.body?.linkAmanda || '').trim(),
      timeoutMinutes: Number(req.body?.timeoutMinutes) || 180,
    })

    res.json({
      success: true,
      data: {
        id: flow.id,
        nome: flow.name,
        ativo: flow.isActive,
        comChavePix: Boolean(link.pixKey),
        timeoutMinutes: flow.timeoutMinutes,
      },
    })
  })
)

/** Admin: amarra um número de WhatsApp à carteira. */
router.patch(
  '/wallets/:linkId/session',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Apenas administrador' })
      return
    }
    const data = await PortfolioService.setWalletSession(
      req.params.linkId,
      (req.body?.sessionId as string) || null
    )
    res.json({ success: true, data })
  })
)

export default router

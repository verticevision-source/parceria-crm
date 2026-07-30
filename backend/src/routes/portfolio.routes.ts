import { Router, Response } from 'express'
import { PortfolioService } from '../services/portfolio.service'
import { FinanceiroService } from '../services/financeiro.service'
import { authMiddleware } from '../middlewares/auth.middleware'
import { asyncHandler } from '../utils/asyncHandler'
import { AuthRequest } from '../types'

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

export default router

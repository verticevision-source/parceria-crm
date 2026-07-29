import { Router, Response } from 'express'
import { PortfolioService } from '../services/portfolio.service'
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

export default router

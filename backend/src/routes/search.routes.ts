import { Router } from 'express'
import { SearchService } from '../services/search.service'
import { authMiddleware } from '../middlewares/auth.middleware'
import { asyncHandler } from '../utils/asyncHandler'
import { AuthRequest } from '../types'

const router = Router()
router.use(authMiddleware)

router.get('/', asyncHandler(async (req: AuthRequest, res) => {
  const data = await SearchService.search(req.user!.userId, req.user!.role, String(req.query.q || ''))
  res.json({ success: true, data })
}))

export default router

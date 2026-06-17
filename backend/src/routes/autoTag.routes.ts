import { Router } from 'express'
import { prisma } from '../config/database'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'
import { AuthRequest } from '../types'

const router = Router()
router.use(authMiddleware, adminMiddleware)

// Lista todas as regras de auto-tag
router.get('/', asyncHandler(async (_req: AuthRequest, res) => {
  const rules = await prisma.autoTagRule.findMany({
    include: { tag: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ success: true, data: rules })
}))

// Cria uma regra
router.post('/', asyncHandler(async (req: AuthRequest, res) => {
  const { keyword, tagId } = req.body
  if (!keyword?.trim() || !tagId) {
    res.status(400).json({ success: false, message: 'keyword e tagId são obrigatórios' })
    return
  }
  const rule = await prisma.autoTagRule.create({
    data: { keyword: keyword.trim(), tagId },
    include: { tag: true },
  })
  res.status(201).json({ success: true, data: rule })
}))

// Ativa/desativa
router.patch('/:id', asyncHandler(async (req: AuthRequest, res) => {
  const { enabled } = req.body
  const rule = await prisma.autoTagRule.update({
    where: { id: req.params.id },
    data: { enabled: !!enabled },
    include: { tag: true },
  })
  res.json({ success: true, data: rule })
}))

// Remove
router.delete('/:id', asyncHandler(async (req: AuthRequest, res) => {
  await prisma.autoTagRule.delete({ where: { id: req.params.id } })
  res.json({ success: true, message: 'Regra removida' })
}))

export default router

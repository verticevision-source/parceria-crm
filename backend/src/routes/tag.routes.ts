import { Router } from 'express'
import { prisma } from '../config/database'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'
import { AuthRequest } from '../types'

const router = Router()
router.use(authMiddleware)

// Lista todas as tags (qualquer usuário autenticado)
router.get('/', asyncHandler(async (_req: AuthRequest, res) => {
  const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } })
  res.json({ success: true, data: tags })
}))

// Cria tag (admin)
router.post('/', adminMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  const { name, color } = req.body
  if (!name?.trim()) {
    res.status(400).json({ success: false, message: 'name é obrigatório' })
    return
  }
  const tag = await prisma.tag.upsert({
    where: { name: name.trim() },
    update: color ? { color } : {},
    create: { name: name.trim(), color: color || '#6366f1' },
  })
  res.status(201).json({ success: true, data: tag })
}))

// Remove tag (admin)
router.delete('/:id', adminMiddleware, asyncHandler(async (req: AuthRequest, res) => {
  await prisma.tag.delete({ where: { id: req.params.id } })
  res.json({ success: true, message: 'Tag removida' })
}))

export default router

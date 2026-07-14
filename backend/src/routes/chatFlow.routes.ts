import { Router } from 'express'
import { ChatFlowController } from '../controllers/chatFlow.controller'
import { ChatFlowService } from '../services/chatFlow.service'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware, adminMiddleware)

router.get('/', asyncHandler(ChatFlowController.list))
// Gera o fluxo padrão de qualificação por cidade (pré-montado)
router.post('/qualification-template', asyncHandler(async (_req, res) => {
  const flow = await ChatFlowService.createQualificationFlow()
  res.status(201).json({ success: true, data: flow })
}))
router.get('/:id', asyncHandler(ChatFlowController.get))
router.post('/', asyncHandler(ChatFlowController.create))
router.put('/:id', asyncHandler(ChatFlowController.update))
router.delete('/:id', asyncHandler(ChatFlowController.remove))

export default router

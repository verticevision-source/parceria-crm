import { Router } from 'express'
import { PipelineController } from '../controllers/pipeline.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(authMiddleware)

router.get('/stages', asyncHandler(PipelineController.findAll))
router.get('/kanban', asyncHandler(PipelineController.getKanban))

// Gerenciar etapas — apenas Admin
router.post('/stages', adminMiddleware, asyncHandler(PipelineController.create))
router.put('/stages/:id', adminMiddleware, asyncHandler(PipelineController.update))
router.delete('/stages/:id', adminMiddleware, asyncHandler(PipelineController.delete))

export default router

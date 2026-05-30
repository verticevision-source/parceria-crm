import { Router } from 'express'
import { BulkMessageController } from '../controllers/bulkMessage.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

// Todas as rotas de envio em massa são admin
router.get('/',           authMiddleware, adminMiddleware, asyncHandler(BulkMessageController.list))
router.get('/:id',        authMiddleware, adminMiddleware, asyncHandler(BulkMessageController.getById))
router.post('/preview',   authMiddleware, adminMiddleware, asyncHandler(BulkMessageController.preview))
router.post('/',          authMiddleware, adminMiddleware, asyncHandler(BulkMessageController.create))
router.post('/:id/send',  authMiddleware, adminMiddleware, asyncHandler(BulkMessageController.send))
router.delete('/:id',     authMiddleware, adminMiddleware, asyncHandler(BulkMessageController.remove))

export default router

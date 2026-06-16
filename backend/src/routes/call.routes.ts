import { Router } from 'express'
import { CallController } from '../controllers/call.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)

router.get('/', asyncHandler(CallController.list))
router.post('/', asyncHandler(CallController.create))
router.delete('/:id', asyncHandler(CallController.remove))

export default router

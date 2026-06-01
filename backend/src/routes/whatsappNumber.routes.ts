import { Router } from 'express'
import { WhatsAppNumberController } from '../controllers/whatsappNumber.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware, adminMiddleware)

router.get('/', asyncHandler(WhatsAppNumberController.list))
router.post('/', asyncHandler(WhatsAppNumberController.add))
router.put('/:id', asyncHandler(WhatsAppNumberController.update))
router.patch('/:id/default', asyncHandler(WhatsAppNumberController.setDefault))
router.delete('/:id', asyncHandler(WhatsAppNumberController.remove))

export default router

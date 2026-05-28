import { Router } from 'express'
import { WhatsAppController } from '../controllers/whatsapp.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(authMiddleware)

router.get('/session', asyncHandler(WhatsAppController.getSession))
router.post('/connect', asyncHandler(WhatsAppController.connect))
router.post('/disconnect', asyncHandler(WhatsAppController.disconnect))
router.get('/qrcode', asyncHandler(WhatsAppController.getQRCode))
router.post('/send', asyncHandler(WhatsAppController.sendMessage))

// DEV: simula mensagem entrante
router.post('/simulate', asyncHandler(WhatsAppController.simulateMessage))

// Admin
router.get('/admin/sessions', adminMiddleware, asyncHandler(WhatsAppController.getAllSessions))

export default router

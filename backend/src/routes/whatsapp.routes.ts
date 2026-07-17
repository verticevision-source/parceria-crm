import { Router } from 'express'
import multer from 'multer'
import { WhatsAppController } from '../controllers/whatsapp.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } })

router.use(authMiddleware)

router.get('/session', asyncHandler(WhatsAppController.getSession))
router.post('/connect', asyncHandler(WhatsAppController.connect))
router.post('/disconnect', asyncHandler(WhatsAppController.disconnect))
router.get('/qrcode', asyncHandler(WhatsAppController.getQRCode))
router.post('/send', asyncHandler(WhatsAppController.sendMessage))

// Media
router.post('/send-media', upload.single('file'), asyncHandler(WhatsAppController.sendMedia))
router.post('/send-audio', asyncHandler(WhatsAppController.sendAudio))
router.post('/send-location', asyncHandler(WhatsAppController.sendLocation))

// DEV: simula mensagem entrante
router.post('/simulate', asyncHandler(WhatsAppController.simulateMessage))

// Admin
router.get('/admin/sessions', adminMiddleware, asyncHandler(WhatsAppController.getAllSessions))
router.post('/admin/connect', adminMiddleware, asyncHandler(WhatsAppController.adminConnect))
router.post('/admin/connect-link', adminMiddleware, asyncHandler(WhatsAppController.createConnectLink))
router.post('/admin/route-to-vendor', adminMiddleware, asyncHandler(WhatsAppController.routeToVendor))
router.post('/admin/disconnect/:sessionId', adminMiddleware, asyncHandler(WhatsAppController.adminDisconnect))

export default router

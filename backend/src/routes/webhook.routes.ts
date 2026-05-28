import { Router } from 'express'
import { evolutionWebhook, wahaWebhook } from '../controllers/webhook.controller'

const router = Router()

// Rotas públicas — sem autenticação JWT (chamadas diretamente pelo provedor WhatsApp)
router.post('/evolution', evolutionWebhook)
router.post('/waha', wahaWebhook)

export default router

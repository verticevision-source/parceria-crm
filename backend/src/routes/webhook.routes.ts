import { Router } from 'express'
import { evolutionWebhook, wahaWebhook, cloudWebhook, cloudWebhookVerify } from '../controllers/webhook.controller'

const router = Router()

// Rotas públicas — sem autenticação JWT (chamadas diretamente pelo provedor WhatsApp)
router.post('/evolution', evolutionWebhook)
router.post('/waha', wahaWebhook)

// WhatsApp Cloud API (Meta oficial)
router.get('/whatsapp-cloud', cloudWebhookVerify)   // verificação do webhook (GET)
router.post('/whatsapp-cloud', cloudWebhook)         // recebe mensagens (POST)

export default router

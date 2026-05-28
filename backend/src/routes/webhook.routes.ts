import { Router } from 'express'
import { evolutionWebhook } from '../controllers/webhook.controller'

const router = Router()

// Rota pública — sem autenticação JWT (Evolution API chama diretamente)
router.post('/evolution', evolutionWebhook)

export default router

import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { WhatsAppService } from '../services/whatsapp.service'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

// Rate limit: a página faz polling do QR, mas evita varredura de tokens.
const connectLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Muitas requisições. Aguarde um instante.' },
})

/**
 * GET /api/public/connect/:token — PÚBLICO (sem login).
 * Devolve só o nome do atendente + o QR (ou CONNECTED). Nada sensível.
 */
router.get('/connect/:token', connectLimiter, asyncHandler(async (req, res) => {
  const state = await WhatsAppService.getConnectLinkState(req.params.token)
  if (!state) {
    res.status(404).json({ success: false, message: 'Link inválido ou expirado' })
    return
  }
  res.json({ success: true, data: state })
}))

export default router

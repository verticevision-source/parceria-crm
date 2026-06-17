import { Router } from 'express'
import { prisma } from '../config/database'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'
import { AuthRequest } from '../types'

const router = Router()
router.use(authMiddleware, adminMiddleware)

// Status de saúde do sistema (admin)
router.get('/health', asyncHandler(async (_req: AuthRequest, res) => {
  // Banco de dados
  let db = { ok: false, latencyMs: 0 }
  const t0 = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    db = { ok: true, latencyMs: Date.now() - t0 }
  } catch { db = { ok: false, latencyMs: Date.now() - t0 } }

  // Evolution API
  let evolution = { ok: false, latencyMs: 0 }
  const baseUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '')
  const apiKey = process.env.EVOLUTION_API_KEY || ''
  if (baseUrl) {
    const t1 = Date.now()
    try {
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort(), 5000)
      const r = await fetch(`${baseUrl}/instance/fetchInstances`, {
        headers: { apikey: apiKey },
        signal: ctrl.signal,
      })
      clearTimeout(to)
      evolution = { ok: r.ok, latencyMs: Date.now() - t1 }
    } catch { evolution = { ok: false, latencyMs: Date.now() - t1 } }
  }

  // Sessões WhatsApp conectadas
  const connectedSessions = await prisma.whatsAppSession.count({ where: { status: 'CONNECTED' } })
  const totalSessions = await prisma.whatsAppSession.count()

  // Agendamentos pendentes / falhados nas últimas 24h
  const pendingScheduled = await prisma.scheduledMessage.count({ where: { status: 'PENDING' } })
  const failedScheduled = await prisma.scheduledMessage.count({
    where: { status: 'FAILED', sentAt: null, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
  })

  res.json({
    success: true,
    data: {
      db,
      evolution,
      sessions: { connected: connectedSessions, total: totalSessions },
      scheduled: { pending: pendingScheduled, failed24h: failedScheduled },
      uptimeSec: Math.round(process.uptime()),
      serverTime: new Date().toISOString(),
    },
  })
}))

export default router

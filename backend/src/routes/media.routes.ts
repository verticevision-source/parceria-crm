import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middlewares/auth.middleware'
import { getWhatsAppProvider } from '../providers/whatsapp/WhatsAppProviderFactory'
import { WhatsAppCloudProvider } from '../providers/whatsapp/WhatsAppCloudProvider'
import { logger } from '../utils/logger'

const router = Router()

// Domínios permitidos no proxy (whitelist anti-SSRF)
const ALLOWED_HOSTS = [
  'localhost',
  '127.0.0.1',
  'graph.facebook.com',
  'lookaside.fbsbx.com',
  'mmg.whatsapp.net',
  'pps.whatsapp.net',
  'cdn.whatsapp.net',
  'scontent',
  'waha',
]

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Bloqueia protocolos não-HTTP
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    const host = parsed.hostname.toLowerCase()
    // Bloqueia IPs privados (exceto localhost explicitamente permitido)
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(host)) return false
    // Permite qualquer host que contenha string da whitelist
    return ALLOWED_HOSTS.some(h => host.includes(h))
  } catch {
    return false
  }
}

/**
 * GET /api/media/proxy?url=<encoded-url>
 *
 * Suporta:
 *   - URLs normais (WAHA, etc.)
 *   - "meta:<mediaId>" para baixar mídia da Cloud API da Meta
 */
router.get('/proxy', authMiddleware, async (req: Request, res: Response) => {
  const { url } = req.query as { url?: string }

  if (!url) {
    res.status(400).json({ message: 'url query param required' })
    return
  }

  try {
    // ── Cloud API (Meta): url começa com "meta:" ─────────────────────────────
    if (url.startsWith('meta:')) {
      const mediaId = url.slice(5) // remove "meta:"
      if (!mediaId) {
        res.status(400).json({ message: 'ID de mídia inválido' })
        return
      }

      const provider = getWhatsAppProvider()
      if (!(provider instanceof WhatsAppCloudProvider)) {
        res.status(503).json({ message: 'Provider não é Cloud API' })
        return
      }

      const { data, mimeType } = await provider.downloadMedia(mediaId)
      const buffer = Buffer.from(data, 'base64')

      res.setHeader('Content-Type', mimeType)
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.setHeader('Content-Length', buffer.length)
      res.send(buffer)
      return
    }

    // ── Evolution: "evo:<instancia>:<messageId>" — busca a mídia sob demanda ──
    if (url.startsWith('evo:')) {
      const rest = url.slice(4)
      const sep = rest.indexOf(':')
      const instance = rest.slice(0, sep)
      const messageId = rest.slice(sep + 1)
      if (!instance || !messageId) {
        res.status(400).json({ message: 'Referência de mídia inválida' })
        return
      }
      const evoUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '')
      const evoKey = process.env.EVOLUTION_API_KEY || ''
      const r = await fetch(`${evoUrl}/chat/getBase64FromMediaMessage/${instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: evoKey },
        body: JSON.stringify({ message: { key: { id: messageId } } }),
      })
      if (!r.ok) {
        res.status(404).json({ message: 'Mídia não disponível' })
        return
      }
      const data = await r.json() as { base64?: string; mimetype?: string }
      if (!data?.base64) {
        res.status(404).json({ message: 'Mídia não disponível' })
        return
      }
      const buffer = Buffer.from(data.base64, 'base64')
      res.setHeader('Content-Type', data.mimetype || 'application/octet-stream')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.setHeader('Content-Length', buffer.length)
      res.send(buffer)
      return
    }

    // ── URLs normais (WAHA, etc.) ─────────────────────────────────────────────
    if (!isSafeUrl(url)) {
      logger.warn(`[MediaProxy] URL bloqueada (SSRF): ${url.substring(0, 100)}`)
      res.status(403).json({ message: 'URL não permitida' })
      return
    }

    const wahaApiKey = process.env.WAHA_API_KEY || ''
    const headers: Record<string, string> = { 'Accept': '*/*' }
    if (wahaApiKey) headers['X-Api-Key'] = wahaApiKey

    const response = await fetch(url, { headers })

    if (!response.ok) {
      res.status(response.status).json({ message: 'Mídia não disponível' })
      return
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const buffer = await response.arrayBuffer()

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.setHeader('Content-Length', buffer.byteLength)
    res.send(Buffer.from(buffer))
  } catch (err) {
    logger.error('[MediaProxy] Erro ao buscar mídia:', err)
    res.status(500).json({ message: 'Erro ao buscar mídia' })
  }
})

export default router

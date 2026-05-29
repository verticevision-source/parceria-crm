import { Router, Request, Response } from 'express'
import { authenticate } from '../middlewares/auth.middleware'
import { logger } from '../utils/logger'

const router = Router()

/**
 * GET /api/media/proxy?url=<encoded-waha-media-url>
 * Proxies media requests to WAHA adding the API key header.
 * Authenticated — only logged-in users can fetch media.
 */
router.get('/proxy', authenticate, async (req: Request, res: Response) => {
  const { url } = req.query as { url?: string }

  if (!url) {
    res.status(400).json({ message: 'url query param required' })
    return
  }

  try {
    const wahaApiKey = process.env.WAHA_API_KEY || ''
    const response = await fetch(url, {
      headers: {
        'X-Api-Key': wahaApiKey,
        'Accept': '*/*',
      },
    })

    if (!response.ok) {
      res.status(response.status).json({ message: 'Media not available' })
      return
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const buffer = await response.arrayBuffer()

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(Buffer.from(buffer))
  } catch (err) {
    logger.error('[MediaProxy] Erro ao buscar mídia:', err)
    res.status(500).json({ message: 'Erro ao buscar mídia' })
  }
})

export default router

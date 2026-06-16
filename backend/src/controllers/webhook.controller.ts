import { Request, Response } from 'express'
import { getWhatsAppProvider } from '../providers/whatsapp/WhatsAppProviderFactory'
import { EvolutionWhatsAppProvider } from '../providers/whatsapp/EvolutionWhatsAppProvider'
import { WahaWhatsAppProvider } from '../providers/whatsapp/WahaWhatsAppProvider'
import { WhatsAppCloudProvider } from '../providers/whatsapp/WhatsAppCloudProvider'
import { logger } from '../utils/logger'

export async function evolutionWebhook(req: Request, res: Response): Promise<void> {
  try {
    // Verificação de origem: se WEBHOOK_TOKEN está configurado, exige ?token= igual
    const expected = process.env.WEBHOOK_TOKEN
    if (expected && req.query.token !== expected) {
      logger.warn('[Webhook] Token inválido — requisição rejeitada')
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    const provider = getWhatsAppProvider()

    if (!(provider instanceof EvolutionWhatsAppProvider)) {
      logger.warn('[Webhook] Provider atual não é Evolution — ignorando webhook')
      res.status(200).json({ ok: true })
      return
    }

    await provider.handleWebhook(req.body)
    res.status(200).json({ ok: true })
  } catch (err) {
    logger.error('[Webhook] Erro ao processar webhook Evolution:', err)
    res.status(500).json({ error: 'Internal error' })
  }
}

export async function wahaWebhook(req: Request, res: Response): Promise<void> {
  try {
    const provider = getWhatsAppProvider()

    if (!(provider instanceof WahaWhatsAppProvider)) {
      logger.warn('[Webhook] Provider atual não é WAHA — ignorando webhook')
      res.status(200).json({ ok: true })
      return
    }

    provider.handleWebhook(req.body)
    res.status(200).json({ ok: true })
  } catch (err) {
    logger.error('[Webhook] Erro ao processar webhook WAHA:', err)
    res.status(500).json({ error: 'Internal error' })
  }
}

/**
 * GET /api/webhook/whatsapp-cloud
 * Verificação do webhook pela Meta (hub.challenge handshake)
 */
export async function cloudWebhookVerify(req: Request, res: Response): Promise<void> {
  const mode = req.query['hub.mode'] as string
  const token = req.query['hub.verify_token'] as string
  const challenge = req.query['hub.challenge'] as string

  const provider = getWhatsAppProvider()

  if (!(provider instanceof WhatsAppCloudProvider)) {
    res.status(403).send('Provider não é Cloud API')
    return
  }

  const result = provider.verifyWebhook(mode, token, challenge)

  if (result !== null) {
    res.status(200).send(result)
  } else {
    res.status(403).send('Forbidden')
  }
}

/**
 * POST /api/webhook/whatsapp-cloud
 * Recebe mensagens e eventos da Meta
 */
export async function cloudWebhook(req: Request, res: Response): Promise<void> {
  try {
    const provider = getWhatsAppProvider()

    if (!(provider instanceof WhatsAppCloudProvider)) {
      logger.warn('[Webhook] Provider atual não é Cloud API — ignorando webhook')
      res.status(200).json({ ok: true })
      return
    }

    provider.handleWebhook(req.body)
    // Meta exige resposta 200 rápida
    res.status(200).json({ ok: true })
  } catch (err) {
    logger.error('[Webhook] Erro ao processar webhook Cloud API:', err)
    // Mesmo com erro, responde 200 para a Meta não re-tentar
    res.status(200).json({ ok: true })
  }
}

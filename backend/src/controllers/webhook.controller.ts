import { Request, Response } from 'express'
import { getWhatsAppProvider } from '../providers/whatsapp/WhatsAppProviderFactory'
import { EvolutionWhatsAppProvider } from '../providers/whatsapp/EvolutionWhatsAppProvider'
import { WahaWhatsAppProvider } from '../providers/whatsapp/WahaWhatsAppProvider'
import { logger } from '../utils/logger'

export async function evolutionWebhook(req: Request, res: Response): Promise<void> {
  try {
    const provider = getWhatsAppProvider()

    if (!(provider instanceof EvolutionWhatsAppProvider)) {
      logger.warn('[Webhook] Provider atual não é Evolution — ignorando webhook')
      res.status(200).json({ ok: true })
      return
    }

    provider.handleWebhook(req.body)
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

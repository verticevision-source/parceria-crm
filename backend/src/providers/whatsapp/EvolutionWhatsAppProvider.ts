import { IWhatsAppProvider, ConnectionStatus, IncomingMessage, SendMessageResult } from './IWhatsAppProvider'
import { logger } from '../../utils/logger'

export class EvolutionWhatsAppProvider implements IWhatsAppProvider {
  private baseUrl: string
  private apiKey: string
  private messageCallbacks: ((sessionId: string, message: IncomingMessage) => void)[] = []
  private statusCallbacks: ((status: ConnectionStatus) => void)[] = []

  constructor() {
    this.baseUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '')
    this.apiKey = process.env.EVOLUTION_API_KEY || ''
    if (!this.baseUrl || !this.apiKey) {
      logger.warn('[Evolution] EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados!')
    }
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'apikey': this.apiKey,
    }
  }

  private async req<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Evolution API ${method} ${path} → ${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
  }

  async connect(sessionId: string, _userId: string): Promise<ConnectionStatus> {
    const webhookUrl = process.env.BACKEND_URL
      ? `${process.env.BACKEND_URL}/api/webhook/evolution`
      : undefined

    try {
      await this.req('POST', '/instance/create', {
        instanceName: sessionId,
        integration: 'WHATSAPP-BAILEYS',
        ...(webhookUrl && {
          webhook: {
            url: webhookUrl,
            byEvents: false,
            base64: false,
            events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
          },
        }),
      })
      logger.info(`[Evolution] Instância criada: ${sessionId}`)
    } catch (err) {
      // Instância pode já existir — re-configure webhook
      logger.info(`[Evolution] Instância já existe, reconfigurando webhook: ${sessionId}`)
      if (webhookUrl) {
        try {
          await this.req('POST', `/webhook/set/${sessionId}`, {
            webhook: {
              enabled: true,
              url: webhookUrl,
              webhookByEvents: false,
              webhookBase64: false,
              events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
            },
          })
        } catch {}
      }
    }

    // Trigger connection to start QR code generation
    try {
      await this.req('GET', `/instance/connect/${sessionId}`)
    } catch {}

    return { sessionId, status: 'WAITING_QR' }
  }

  async disconnect(sessionId: string): Promise<void> {
    try {
      await this.req('DELETE', `/instance/logout/${sessionId}`)
    } catch {}
    try {
      await this.req('DELETE', `/instance/delete/${sessionId}`)
    } catch {}
    logger.info(`[Evolution] Sessão desconectada: ${sessionId}`)
  }

  async getStatus(sessionId: string): Promise<ConnectionStatus> {
    try {
      const data = await this.req<any>('GET', `/instance/connectionState/${sessionId}`)
      const state = data?.instance?.state

      let status: ConnectionStatus['status'] = 'DISCONNECTED'
      if (state === 'open') status = 'CONNECTED'
      else if (state === 'connecting' || state === 'close') status = 'WAITING_QR'

      return {
        sessionId,
        status,
        phoneNumber: data?.instance?.jid?.split('@')[0],
      }
    } catch {
      return { sessionId, status: 'DISCONNECTED' }
    }
  }

  async getQRCode(sessionId: string): Promise<string | null> {
    try {
      // Trigger connection attempt (generates QR if not connected)
      const data = await this.req<any>('GET', `/instance/connect/${sessionId}`)
      // v2 returns { count, base64 } or { pairingCode, code, count }
      return data?.base64 || data?.code || null
    } catch {
      return null
    }
  }

  async sendMessage(sessionId: string, to: string, body: string): Promise<SendMessageResult> {
    const data = await this.req<any>('POST', `/message/sendText/${sessionId}`, {
      number: to,
      text: body,
    })
    return {
      externalId: data?.key?.id || `evo_${Date.now()}`,
      sentAt: new Date(),
    }
  }

  onMessageReceived(callback: (sessionId: string, message: IncomingMessage) => void): void {
    this.messageCallbacks.push(callback)
  }

  onStatusChanged(callback: (status: ConnectionStatus) => void): void {
    this.statusCallbacks.push(callback)
  }

  // Chamado pelo webhook controller quando a Evolution API envia eventos
  handleWebhook(payload: unknown): void {
    const data = payload as any

    // ── Mensagem recebida ──
    if (data.event === 'messages.upsert') {
      const msgs: any[] = data.data?.messages || []
      for (const msg of msgs) {
        if (msg.key?.fromMe) continue

        const incoming: IncomingMessage = {
          externalId: msg.key?.id || `evo_${Date.now()}`,
          from: msg.key?.remoteJid?.split('@')[0] || '',
          body: msg.message?.conversation
            || msg.message?.extendedTextMessage?.text
            || '[mídia]',
          type: this.detectType(msg.message),
          timestamp: new Date((msg.messageTimestamp || Date.now() / 1000) * 1000),
        }

        if (!incoming.from) continue
        logger.info(`[Evolution] Mensagem recebida de ${incoming.from} na sessão ${data.instance}`)
        this.messageCallbacks.forEach(cb => cb(data.instance, incoming))
      }
    }

    // ── Status de conexão ──
    if (data.event === 'connection.update') {
      const state = data.data?.state
      let status: ConnectionStatus['status'] = 'DISCONNECTED'
      if (state === 'open') status = 'CONNECTED'
      else if (state === 'connecting') status = 'WAITING_QR'

      logger.info(`[Evolution] Status de conexão: ${data.instance} → ${status}`)
      this.statusCallbacks.forEach(cb => cb({
        sessionId: data.instance,
        status,
        phoneNumber: data.data?.jid?.split('@')[0],
      }))
    }

    // ── QR Code atualizado (envia pro frontend em tempo real) ──
    if (data.event === 'qrcode.updated') {
      const qrCode = data.data?.qrcode?.base64
      if (qrCode) {
        logger.info(`[Evolution] QR Code atualizado para sessão: ${data.instance}`)
        this.statusCallbacks.forEach(cb => cb({
          sessionId: data.instance,
          status: 'WAITING_QR',
          qrCode,
        }))
      }
    }
  }

  private detectType(message: any): IncomingMessage['type'] {
    if (!message) return 'TEXT'
    if (message.imageMessage) return 'IMAGE'
    if (message.audioMessage) return 'AUDIO'
    if (message.documentMessage) return 'DOCUMENT'
    if (message.videoMessage) return 'VIDEO'
    return 'TEXT'
  }
}

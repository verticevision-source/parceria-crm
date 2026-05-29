import { IWhatsAppProvider, ConnectionStatus, IncomingMessage, SendMessageResult } from './IWhatsAppProvider'
import { logger } from '../../utils/logger'

/**
 * WAHA (WhatsApp HTTP API) provider — uses Baileys 7.x which is compatible
 * with the current WhatsApp Web protocol.
 *
 * Free tier supports only ONE session named "default".
 * For multi-session support, upgrade to WAHA Plus or run multiple instances.
 */
export class WahaWhatsAppProvider implements IWhatsAppProvider {
  private baseUrl: string
  private apiKey: string
  private messageCallbacks: ((sessionId: string, message: IncomingMessage) => void)[] = []
  private statusCallbacks: ((status: ConnectionStatus) => void)[] = []

  constructor() {
    this.baseUrl = (process.env.WAHA_API_URL || '').replace(/\/$/, '')
    this.apiKey = process.env.WAHA_API_KEY || ''
    if (!this.baseUrl) {
      logger.warn('[WAHA] WAHA_API_URL não configurado!')
    }
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(this.apiKey ? { 'X-Api-Key': this.apiKey } : {}),
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
      throw new Error(`WAHA ${method} ${path} → ${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
  }

  // WAHA free tier: only 'default' session is supported.
  // We map any sessionId to 'default' for now.
  private getWahaSession(_sessionId: string): string {
    return 'default'
  }

  async connect(sessionId: string, _userId: string): Promise<ConnectionStatus> {
    const session = this.getWahaSession(sessionId)
    const webhookUrl = process.env.BACKEND_URL
      ? `${process.env.BACKEND_URL}/api/webhook/waha`
      : undefined

    const sessionConfig = webhookUrl
      ? {
          webhooks: [{
            url: webhookUrl,
            events: ['message', 'session.status'],
            hmac: null,
            retries: null,
            customHeaders: null,
          }],
        }
      : {}

    // Check current state first
    let currentStatus: string | null = null
    try {
      const current = await this.req<any>('GET', `/api/sessions/${session}`)
      currentStatus = current?.status || null
    } catch {
      // Session doesn't exist yet
    }

    if (!currentStatus) {
      // Create new session
      try {
        await this.req('POST', '/api/sessions', {
          name: session,
          config: sessionConfig,
        })
        logger.info(`[WAHA] Sessão criada: ${session}`)
      } catch (err) {
        logger.warn(`[WAHA] Erro ao criar sessão: ${err}`)
      }
    } else {
      // Session exists — update config
      try {
        await this.req('PUT', `/api/sessions/${session}`, {
          config: sessionConfig,
        })
        logger.info(`[WAHA] Config da sessão atualizada: ${session} (status: ${currentStatus})`)
      } catch {}
    }

    // If already scanning QR, no need to restart (just return)
    if (currentStatus === 'SCAN_QR_CODE') {
      logger.info(`[WAHA] Sessão já está aguardando QR: ${session}`)
      return { sessionId, status: 'WAITING_QR' }
    }

    // If WORKING (connected), return connected status
    if (currentStatus === 'WORKING') {
      logger.info(`[WAHA] Sessão já conectada: ${session}`)
      return { sessionId, status: 'CONNECTED' }
    }

    // If FAILED or STOPPED, stop first then restart
    if (currentStatus === 'FAILED' || currentStatus === 'STOPPED') {
      try {
        await this.req('POST', `/api/sessions/${session}/stop`)
      } catch {}
    }

    // Start the session (triggers QR generation)
    try {
      await this.req('POST', `/api/sessions/${session}/start`)
      logger.info(`[WAHA] Sessão iniciada: ${session}`)
    } catch (err) {
      logger.warn(`[WAHA] Erro ao iniciar sessão: ${err}`)
    }

    return { sessionId, status: 'WAITING_QR' }
  }

  async disconnect(sessionId: string): Promise<void> {
    const session = this.getWahaSession(sessionId)
    try {
      await this.req('POST', `/api/sessions/${session}/stop`)
      logger.info(`[WAHA] Sessão parada: ${session}`)
    } catch (err) {
      logger.info(`[WAHA] Sessão não estava rodando ou erro ao parar: ${err}`)
    }
    // Do NOT delete the session — keep it so it can be restarted without re-creating
    logger.info(`[WAHA] Sessão desconectada: ${session}`)
  }

  async getStatus(sessionId: string): Promise<ConnectionStatus> {
    const session = this.getWahaSession(sessionId)
    try {
      const data = await this.req<any>('GET', `/api/sessions/${session}`)
      const status = data?.status

      let mappedStatus: ConnectionStatus['status'] = 'DISCONNECTED'
      if (status === 'WORKING') mappedStatus = 'CONNECTED'
      else if (status === 'SCAN_QR_CODE' || status === 'STARTING') mappedStatus = 'WAITING_QR'

      return {
        sessionId,
        status: mappedStatus,
        phoneNumber: data?.me?.id?.replace('@c.us', ''),
      }
    } catch {
      return { sessionId, status: 'DISCONNECTED' }
    }
  }

  async getQRCode(sessionId: string): Promise<string | null> {
    const session = this.getWahaSession(sessionId)

    // Check session state first — restart if FAILED so QR can be regenerated
    try {
      const state = await this.req<any>('GET', `/api/sessions/${session}`)
      const wahaStatus = state?.status
      if (wahaStatus === 'FAILED' || wahaStatus === 'STOPPED') {
        logger.info(`[WAHA] Sessão FAILED/STOPPED — reiniciando para gerar novo QR`)
        try { await this.req('POST', `/api/sessions/${session}/stop`) } catch {}
        await this.req('POST', `/api/sessions/${session}/start`)
        // Give it a moment to generate the QR
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    } catch (err) {
      logger.warn(`[WAHA] Erro ao verificar estado da sessão: ${err}`)
    }

    try {
      const data = await this.req<any>('GET', `/api/${session}/auth/qr`)
      // Returns { mimetype: 'image/png', data: 'base64...' } when Accept: application/json
      if (data?.data) {
        return `data:${data.mimetype || 'image/png'};base64,${data.data}`
      }
      return null
    } catch (err) {
      logger.warn(`[WAHA] Erro ao obter QR code: ${err}`)
      return null
    }
  }

  async sendMessage(sessionId: string, to: string, body: string): Promise<SendMessageResult> {
    const session = this.getWahaSession(sessionId)
    // WAHA expects numbers in format: 5511999999999@c.us
    // Strip any existing suffix (@c.us, @s.whatsapp.net, @lid) and re-add @c.us
    // Groups (@g.us) are passed through as-is
    const toFormatted = to.includes('@g.us') ? to : `${to.replace(/@.*$/, '')}@c.us`

    const data = await this.req<any>('POST', '/api/sendText', {
      session,
      chatId: toFormatted,
      text: body,
    })
    return {
      externalId: data?.id || `waha_${Date.now()}`,
      sentAt: new Date(),
    }
  }

  onMessageReceived(callback: (sessionId: string, message: IncomingMessage) => void): void {
    this.messageCallbacks.push(callback)
  }

  onStatusChanged(callback: (status: ConnectionStatus) => void): void {
    this.statusCallbacks.push(callback)
  }

  // Called by webhook controller when WAHA sends events
  handleWebhook(payload: unknown): void {
    const data = payload as any

    // WAHA webhook format: { event: 'message'|'session.status', session: 'default', payload: {...} }

    if (data.event === 'message') {
      const msg = data.payload
      if (!msg || msg.fromMe) return

      const incoming: IncomingMessage = {
        externalId: msg.id || `waha_${Date.now()}`,
        from: (msg.from || '').replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, ''),
        body: msg.body || '[mídia]',
        type: this.detectType(msg),
        timestamp: new Date(msg.timestamp ? msg.timestamp * 1000 : Date.now()),
      }

      if (!incoming.from) return
      logger.info(`[WAHA] Mensagem recebida de ${incoming.from} na sessão ${data.session}`)
      this.messageCallbacks.forEach(cb => cb(data.session, incoming))
    }

    if (data.event === 'session.status') {
      const status = data.payload?.status
      let mappedStatus: ConnectionStatus['status'] = 'DISCONNECTED'
      if (status === 'WORKING') mappedStatus = 'CONNECTED'
      else if (status === 'SCAN_QR_CODE' || status === 'STARTING') mappedStatus = 'WAITING_QR'

      logger.info(`[WAHA] Status de sessão: ${data.session} → ${mappedStatus}`)
      this.statusCallbacks.forEach(cb => cb({
        sessionId: data.session,
        status: mappedStatus,
        phoneNumber: data.payload?.me?.id?.replace('@c.us', ''),
      }))
    }
  }

  private detectType(msg: any): IncomingMessage['type'] {
    if (!msg) return 'TEXT'
    const type = msg.type
    if (type === 'image') return 'IMAGE'
    if (type === 'audio' || type === 'ptt') return 'AUDIO'
    if (type === 'document') return 'DOCUMENT'
    if (type === 'video') return 'VIDEO'
    return 'TEXT'
  }
}

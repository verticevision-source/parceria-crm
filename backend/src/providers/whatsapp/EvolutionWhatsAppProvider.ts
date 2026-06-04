import { IWhatsAppProvider, ConnectionStatus, IncomingMessage, SendMessageResult, SendFilePayload } from './IWhatsAppProvider'
import { logger } from '../../utils/logger'

/**
 * Evolution API v2 provider — multi-sessão, gratuito, auto-hospedado.
 * Cada sessão (número) é uma "instância" na Evolution API identificada pelo UUID do session.
 *
 * Docs: https://doc.evolution-api.com
 */
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
      throw new Error(`Evolution ${method} ${path} → ${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
  }

  // Normaliza número: remove @c.us, @s.whatsapp.net, @lid etc
  private normalizeNumber(to: string): string {
    return to.replace(/@.*$/, '')
  }

  /**
   * Envia via Evolution com fallback para @lid.
   *
   * O WhatsApp novo usa identificadores de privacidade "@lid" para alguns
   * contatos. Nesses casos o número puro não existe como telefone real
   * (exists:false) e é preciso enviar com o sufixo @lid para o WhatsApp
   * resolver o número verdadeiro. Tentamos primeiro como número normal
   * (@s.whatsapp.net, que cobre a maioria) e, se falhar com exists:false,
   * repetimos com @lid. Seguro: números inexistentes de verdade falham nas
   * duas tentativas, sem efeito colateral.
   */
  private async sendWithLidFallback<T>(
    number: string,
    doSend: (target: string) => Promise<T>,
  ): Promise<T> {
    try {
      return await doSend(number)
    } catch (err) {
      const msg = String((err as Error)?.message || '')
      const looksLikeLid = /exists"?\s*:\s*false/i.test(msg) || /\b400\b/.test(msg)
      if (looksLikeLid && !number.includes('@')) {
        logger.info(`[Evolution] Número ${number} não existe como telefone — tentando como @lid`)
        return await doSend(`${number}@lid`)
      }
      throw err
    }
  }

  // ── Conexão ───────────────────────────────────────────────────────────────

  async connect(sessionId: string, _userId: string): Promise<ConnectionStatus> {
    const webhookUrl = process.env.BACKEND_URL
      ? `${process.env.BACKEND_URL}/api/webhook/evolution`
      : undefined

    // Proxy residencial opcional — configura via env vars PROXY_HOST, PROXY_PORT, etc.
    const proxyConfig = process.env.PROXY_HOST ? {
      enabled: true,
      host: process.env.PROXY_HOST,
      port: Number(process.env.PROXY_PORT || '8080'),
      protocol: (process.env.PROXY_PROTOCOL || 'http') as 'http' | 'https' | 'socks5',
      username: process.env.PROXY_USERNAME || '',
      password: process.env.PROXY_PASSWORD || '',
    } : undefined

    // Tenta criar a instância
    try {
      await this.req('POST', '/instance/create', {
        instanceName: sessionId,
        integration: 'WHATSAPP-BAILEYS',
        ...(proxyConfig && { proxy: proxyConfig }),
        ...(webhookUrl && {
          webhook: {
            url: webhookUrl,
            byEvents: false,
            base64: true,        // mídia vem como base64 no webhook
            events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
          },
        }),
      })
      logger.info(`[Evolution] Instância criada: ${sessionId}${proxyConfig ? ' (com proxy)' : ''}`)
    } catch {
      // Instância já existe — atualiza webhook e proxy
      logger.info(`[Evolution] Instância já existe, atualizando webhook: ${sessionId}`)
      if (webhookUrl) {
        try {
          await this.req('POST', `/webhook/set/${sessionId}`, {
            webhook: {
              enabled: true,
              url: webhookUrl,
              webhookByEvents: false,
              webhookBase64: true,
              events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
            },
          })
        } catch {}
      }
      // Atualiza proxy na instância existente, se configurado
      if (proxyConfig) {
        try {
          await this.req('POST', `/proxy/set/${sessionId}`, { proxy: proxyConfig })
        } catch {}
      }
    }

    // Dispara geração do QR e captura imediatamente se disponível
    let qrCode: string | undefined
    try {
      const qrData = await this.req<any>('GET', `/instance/connect/${sessionId}`)
      const raw = qrData?.base64 || (qrData?.code ? `data:image/png;base64,${qrData.code}` : null)
      if (raw) qrCode = raw
    } catch {}

    return { sessionId, status: 'WAITING_QR', qrCode }
  }

  async disconnect(sessionId: string): Promise<void> {
    try { await this.req('DELETE', `/instance/logout/${sessionId}`) } catch {}
    try { await this.req('DELETE', `/instance/delete/${sessionId}`) } catch {}
    logger.info(`[Evolution] Desconectado: ${sessionId}`)
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
      const data = await this.req<any>('GET', `/instance/connect/${sessionId}`)
      // Evolution retorna { base64: 'data:image/png;base64,...' } ou { code: '...' }
      return data?.base64 || (data?.code ? `data:image/png;base64,${data.code}` : null)
    } catch {
      return null
    }
  }

  // ── Envio ─────────────────────────────────────────────────────────────────

  async sendMessage(sessionId: string, to: string, body: string): Promise<SendMessageResult> {
    const number = this.normalizeNumber(to)
    const data = await this.sendWithLidFallback(number, (target) =>
      this.req<any>('POST', `/message/sendText/${sessionId}`, {
        number: target,
        text: body,
      }),
    )
    return {
      externalId: data?.key?.id || `evo_${Date.now()}`,
      sentAt: new Date(),
    }
  }

  async sendFile(sessionId: string, to: string, file: SendFilePayload): Promise<SendMessageResult> {
    const number = this.normalizeNumber(to)

    const mediatype = file.mimetype.startsWith('image/') ? 'image'
      : file.mimetype.startsWith('video/') ? 'video'
      : file.mimetype.startsWith('audio/') ? 'audio'
      : 'document'

    const data = await this.sendWithLidFallback(number, (target) =>
      this.req<any>('POST', `/message/sendMedia/${sessionId}`, {
        number: target,
        mediatype,
        mimetype: file.mimetype,
        caption: '',
        media: file.data,        // base64 puro, sem prefixo data:
        fileName: file.filename,
      }),
    )
    return {
      externalId: data?.key?.id || `evo_${Date.now()}`,
      sentAt: new Date(),
    }
  }

  async sendAudio(sessionId: string, to: string, audioBase64: string): Promise<SendMessageResult> {
    const number = this.normalizeNumber(to)
    const data = await this.sendWithLidFallback(number, (target) =>
      this.req<any>('POST', `/message/sendWhatsAppAudio/${sessionId}`, {
        number: target,
        audio: audioBase64,
        encoding: true,   // Evolution re-codifica para opus/ogg compatível com WhatsApp
      }),
    )
    return {
      externalId: data?.key?.id || `evo_${Date.now()}`,
      sentAt: new Date(),
    }
  }

  async sendLocation(
    sessionId: string, to: string,
    latitude: number, longitude: number, name?: string, address?: string
  ): Promise<SendMessageResult> {
    const number = this.normalizeNumber(to)
    const data = await this.sendWithLidFallback(number, (target) =>
      this.req<any>('POST', `/message/sendLocation/${sessionId}`, {
        number: target,
        latitude,
        longitude,
        name: name || '',
        address: address || '',
      }),
    )
    return {
      externalId: data?.key?.id || `evo_${Date.now()}`,
      sentAt: new Date(),
    }
  }

  /** Busca a foto de perfil do WhatsApp e retorna como data URL base64
   *  (baixa a imagem para não depender da URL do WhatsApp, que bloqueia
   *  hotlink no navegador e expira). */
  async getProfilePicUrl(sessionId: string, number: string): Promise<string | null> {
    const num = this.normalizeNumber(number)
    const fetchUrl = async (n: string): Promise<string | null> => {
      const data = await this.req<any>('POST', `/chat/fetchProfilePictureUrl/${sessionId}`, { number: n })
      return data?.profilePictureUrl || data?.profilePicUrl || null
    }

    let url: string | null = null
    try { url = await fetchUrl(num) } catch { /* tenta @lid abaixo */ }
    if (!url) { try { url = await fetchUrl(`${num}@lid`) } catch { /* sem foto */ } }
    if (!url) return null

    // Baixa a imagem e converte para data URL
    try {
      const res = await fetch(url)
      if (!res.ok) return url
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length === 0 || buf.length > 3_000_000) return url
      const mime = res.headers.get('content-type') || 'image/jpeg'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch {
      return url
    }
  }

  // ── Callbacks ─────────────────────────────────────────────────────────────

  onMessageReceived(callback: (sessionId: string, message: IncomingMessage) => void): void {
    this.messageCallbacks.push(callback)
  }

  onStatusChanged(callback: (status: ConnectionStatus) => void): void {
    this.statusCallbacks.push(callback)
  }

  // ── Webhook ───────────────────────────────────────────────────────────────

  handleWebhook(payload: unknown): void {
    const data = payload as any
    const event: string = (data.event || '').toLowerCase()

    // ── messages.upsert ────────────────────────────────────────────────────
    if (event === 'messages.upsert') {
      // Evolution v2: data.data é objeto único; v1 era data.data.messages[]
      const rawData = data.data
      const msgs: any[] = Array.isArray(rawData)
        ? rawData
        : Array.isArray(rawData?.messages)
        ? rawData.messages
        : rawData ? [rawData] : []

      for (const msg of msgs) {
        if (msg.key?.fromMe) continue
        const remoteJid: string = msg.key?.remoteJid || ''
        if (!remoteJid) continue
        if (remoteJid.endsWith('@g.us')) continue  // ignora grupos por ora

        // Normaliza número: remove sufixo de JID
        const from = remoteJid
          .replace(/@s\.whatsapp\.net$/, '')
          .replace(/@c\.us$/, '')

        // Desembrulha mensagem efêmera (some depois) se houver
        const inner = msg.message?.ephemeralMessage?.message || msg.message
        const type = this.detectType(inner)
        const mediaUrl = this.extractMediaBase64(inner)

        // Localização recebida (pino do mapa)
        const loc = inner?.locationMessage || inner?.liveLocationMessage
        const latitude = loc?.degreesLatitude
        const longitude = loc?.degreesLongitude

        const incoming: IncomingMessage = {
          externalId: msg.key?.id || `evo_${Date.now()}`,
          from,
          senderName: msg.pushName || undefined,
          body: loc ? (loc.name || loc.address || '') : this.extractText(inner),
          type,
          mediaUrl,
          latitude: typeof latitude === 'number' ? latitude : undefined,
          longitude: typeof longitude === 'number' ? longitude : undefined,
          timestamp: new Date((msg.messageTimestamp || Date.now() / 1000) * 1000),
        }

        if (!incoming.from) continue
        logger.info(`[Evolution] Mensagem de ${incoming.from} | instância ${data.instance}`)
        this.messageCallbacks.forEach(cb => cb(data.instance, incoming))
      }
    }

    // ── connection.update ──────────────────────────────────────────────────
    if (event === 'connection.update') {
      const state = data.data?.state
      let status: ConnectionStatus['status'] = 'DISCONNECTED'
      if (state === 'open') status = 'CONNECTED'
      else if (state === 'connecting') status = 'WAITING_QR'
      // 'close' sem reconexão = DISCONNECTED (já é default)

      logger.info(`[Evolution] Conexão: ${data.instance} → ${status}`)
      this.statusCallbacks.forEach(cb => cb({
        sessionId: data.instance,
        status,
        phoneNumber: data.data?.jid?.split('@')[0],
      }))
    }

    // ── qrcode.updated — QR chegou via webhook ─────────────────────────────
    if (event === 'qrcode.updated') {
      const qrCode = data.data?.qrcode?.base64 || data.data?.base64
      if (qrCode) {
        logger.info(`[Evolution] QR atualizado: ${data.instance}`)
        this.statusCallbacks.forEach(cb => cb({
          sessionId: data.instance,
          status: 'WAITING_QR',
          qrCode,
        }))
      }
    }
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private extractText(message: any): string {
    if (!message) return ''
    return message.conversation
      || message.extendedTextMessage?.text
      || message.ephemeralMessage?.message?.extendedTextMessage?.text
      || message.ephemeralMessage?.message?.conversation
      || ''
  }

  /** Extrai base64 de mídia (webhookBase64) e retorna como data URL com o mimetype */
  private extractMediaBase64(message: any): string | undefined {
    if (!message) return undefined
    const candidates = [
      message.imageMessage,
      message.videoMessage,
      message.audioMessage,
      message.pttMessage,
      message.documentMessage,
      message.stickerMessage,
    ]
    for (const m of candidates) {
      if (m?.base64) {
        const b64: string = m.base64
        if (b64.startsWith('data:')) return b64
        const mime = m.mimetype || 'application/octet-stream'
        return `data:${mime};base64,${b64}`
      }
    }
    return undefined
  }

  private detectType(message: any): IncomingMessage['type'] {
    if (!message) return 'TEXT'
    if (message.locationMessage || message.liveLocationMessage) return 'LOCATION'
    if (message.imageMessage || message.stickerMessage) return 'IMAGE'
    if (message.audioMessage || message.pttMessage) return 'AUDIO'
    if (message.documentMessage) return 'DOCUMENT'
    if (message.videoMessage) return 'VIDEO'
    return 'TEXT'
  }
}

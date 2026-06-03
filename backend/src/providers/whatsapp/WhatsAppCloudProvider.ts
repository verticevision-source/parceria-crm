import { IWhatsAppProvider, ConnectionStatus, IncomingMessage, SendMessageResult, SendFilePayload } from './IWhatsAppProvider'
import { logger } from '../../utils/logger'
import { prisma } from '../../config/database'

/**
 * WhatsApp Cloud API (API Oficial da Meta) provider.
 *
 * Configuração via env vars:
 *   WHATSAPP_CLOUD_TOKEN        – Token de acesso permanente (gerado no Meta for Developers)
 *   WHATSAPP_PHONE_NUMBER_ID    – ID do número de telefone (ex: 123456789012345)
 *   WHATSAPP_VERIFY_TOKEN       – Token de verificação do webhook (qualquer string secreta)
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
export class WhatsAppCloudProvider implements IWhatsAppProvider {
  private readonly token: string
  private readonly phoneNumberId: string
  private readonly verifyToken: string
  private readonly baseUrl = 'https://graph.facebook.com/v19.0'

  private messageCallbacks: ((sessionId: string, message: IncomingMessage) => void)[] = []
  private statusCallbacks: ((status: ConnectionStatus) => void)[] = []

  constructor() {
    this.token = process.env.WHATSAPP_CLOUD_TOKEN || ''
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || ''
    this.verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'parceria_crm_webhook_token'

    if (!this.token || !this.phoneNumberId) {
      logger.warn('[CloudAPI] WHATSAPP_CLOUD_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não configurados!')
    } else {
      logger.info(`[CloudAPI] Provider iniciado. Phone Number ID: ${this.phoneNumberId}`)
    }
  }

  /**
   * Resolve as credenciais a usar: número padrão cadastrado no banco
   * (multi-número) com fallback para as variáveis de ambiente.
   */
  private async creds(phoneNumberId?: string): Promise<{ token: string; phoneNumberId: string }> {
    try {
      const num = phoneNumberId
        ? await prisma.whatsAppNumber.findUnique({ where: { phoneNumberId } })
        : await prisma.whatsAppNumber.findFirst({
            where: { isActive: true },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          })
      if (num?.token && num?.phoneNumberId) {
        return { token: num.token, phoneNumberId: num.phoneNumberId }
      }
    } catch { /* fallback abaixo */ }
    return { token: this.token, phoneNumberId: this.phoneNumberId }
  }

  private async req<T = unknown>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token || this.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`CloudAPI ${method} ${path} → ${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
  }

  // Remove sufixos de JID do WhatsApp e retém só dígitos
  private normalizeNumber(to: string): string {
    return to.replace(/@.*$/, '').replace(/\D/g, '')
  }

  // ── Conexão ───────────────────────────────────────────────────────────────

  async connect(sessionId: string, _userId: string): Promise<ConnectionStatus> {
    const { token, phoneNumberId } = await this.creds()
    if (!token || !phoneNumberId) {
      return {
        sessionId,
        status: 'ERROR',
        error: 'Nenhum número de WhatsApp configurado. Adicione um número na Central de Números.',
      }
    }

    try {
      const data = await this.req<any>('GET', `/${phoneNumberId}?fields=display_phone_number,verified_name,status`, undefined, token)
      const phoneNumber = data?.display_phone_number?.replace(/\D/g, '') || ''
      logger.info(`[CloudAPI] Conectado: ${data?.display_phone_number} (${data?.verified_name})`)

      return { sessionId, status: 'CONNECTED', phoneNumber }
    } catch (err: any) {
      logger.error('[CloudAPI] Erro ao verificar credenciais:', err.message)
      return { sessionId, status: 'ERROR', error: `Credenciais inválidas: ${err.message}` }
    }
  }

  async disconnect(sessionId: string): Promise<void> {
    // Na Cloud API não há "desconexão" — apenas marcamos no banco
    logger.info(`[CloudAPI] Sessão marcada como desconectada: ${sessionId}`)
  }

  async getStatus(sessionId: string): Promise<ConnectionStatus> {
    const { token, phoneNumberId } = await this.creds()
    if (!token || !phoneNumberId) {
      return { sessionId, status: 'DISCONNECTED' }
    }

    try {
      const data = await this.req<any>('GET', `/${phoneNumberId}?fields=display_phone_number,status`, undefined, token)
      const phoneNumber = data?.display_phone_number?.replace(/\D/g, '') || ''
      const status = data?.status === 'FLAGGED' ? 'ERROR' : 'CONNECTED'
      return { sessionId, status, phoneNumber }
    } catch {
      return { sessionId, status: 'DISCONNECTED' }
    }
  }

  async getQRCode(_sessionId: string): Promise<string | null> {
    // Cloud API não usa QR code
    return null
  }

  // ── Envio ─────────────────────────────────────────────────────────────────

  async sendMessage(sessionId: string, to: string, body: string): Promise<SendMessageResult> {
    const number = this.normalizeNumber(to)
    const { token, phoneNumberId } = await this.creds()

    const data = await this.req<any>('POST', `/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: number,
      type: 'text',
      text: { body },
    }, token)

    logger.info(`[CloudAPI] Mensagem enviada para ${number} | wamid: ${data?.messages?.[0]?.id}`)

    return {
      externalId: data?.messages?.[0]?.id || `cloud_${Date.now()}`,
      sentAt: new Date(),
    }
  }

  async sendFile(sessionId: string, to: string, file: SendFilePayload): Promise<SendMessageResult> {
    const number = this.normalizeNumber(to)
    const { token, phoneNumberId } = await this.creds()

    // Determina o tipo de mídia
    const mediaType = file.mimetype.startsWith('image/') ? 'image'
      : file.mimetype.startsWith('video/') ? 'video'
      : file.mimetype.startsWith('audio/') ? 'audio'
      : 'document'

    // 1. Primeiro faz upload do arquivo para a Meta
    const formData = new FormData()
    const blob = new Blob([Buffer.from(file.data, 'base64')], { type: file.mimetype })
    formData.append('file', blob, file.filename)
    formData.append('messaging_product', 'whatsapp')
    formData.append('type', file.mimetype)

    const uploadRes = await fetch(`${this.baseUrl}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      throw new Error(`Upload de mídia falhou: ${err}`)
    }

    const uploadData = await uploadRes.json() as any
    const mediaId = uploadData.id

    // 2. Envia a mensagem com o mediaId
    const messageBody: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: number,
      type: mediaType,
      [mediaType]: { id: mediaId },
    }

    // Documentos precisam de filename
    if (mediaType === 'document') {
      (messageBody[mediaType] as any).filename = file.filename
    }

    const data = await this.req<any>('POST', `/${phoneNumberId}/messages`, messageBody, token)

    return {
      externalId: data?.messages?.[0]?.id || `cloud_${Date.now()}`,
      sentAt: new Date(),
    }
  }

  async sendLocation(
    _sessionId: string, to: string,
    latitude: number, longitude: number, name?: string, address?: string
  ): Promise<SendMessageResult> {
    const number = this.normalizeNumber(to)
    const { token, phoneNumberId } = await this.creds()
    const data = await this.req<any>('POST', `/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: number,
      type: 'location',
      location: {
        latitude, longitude,
        ...(name && { name }),
        ...(address && { address }),
      },
    }, token)
    return {
      externalId: data?.messages?.[0]?.id || `cloud_${Date.now()}`,
      sentAt: new Date(),
    }
  }

  async sendAudio(sessionId: string, to: string, audioBase64: string, mimetype?: string): Promise<SendMessageResult> {
    // Meta Cloud API aceita: audio/ogg, audio/mp4, audio/mpeg, audio/amr, audio/webm
    // Normaliza mimetype para compatibilidade
    const resolvedMime = mimetype?.split(';')[0].trim() || 'audio/ogg'
    const ext = resolvedMime.includes('webm') ? 'webm'
      : resolvedMime.includes('mp4') ? 'mp4'
      : resolvedMime.includes('mpeg') || resolvedMime.includes('mp3') ? 'mp3'
      : resolvedMime.includes('amr') ? 'amr'
      : 'ogg'

    return this.sendFile(sessionId, to, {
      data: audioBase64,
      mimetype: resolvedMime,
      filename: `audio.${ext}`,
    })
  }

  // ── Callbacks ─────────────────────────────────────────────────────────────

  onMessageReceived(callback: (sessionId: string, message: IncomingMessage) => void): void {
    this.messageCallbacks.push(callback)
  }

  onStatusChanged(callback: (status: ConnectionStatus) => void): void {
    this.statusCallbacks.push(callback)
  }

  // ── Webhook ───────────────────────────────────────────────────────────────

  /**
   * Verifica a assinatura do webhook da Meta (GET /webhook/whatsapp-cloud)
   * Retorna o hub.challenge se válido, ou null se inválido.
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === 'subscribe' && token === this.verifyToken) {
      logger.info('[CloudAPI] Webhook verificado com sucesso!')
      return challenge
    }
    logger.warn('[CloudAPI] Verificação de webhook falhou — token inválido')
    return null
  }

  /**
   * Processa payload do webhook da Meta (POST /webhook/whatsapp-cloud)
   * Formato: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
   */
  handleWebhook(payload: unknown): void {
    const data = payload as any

    if (data.object !== 'whatsapp_business_account') return

    const entries: any[] = data.entry || []

    for (const entry of entries) {
      const changes: any[] = entry.changes || []

      for (const change of changes) {
        if (change.field !== 'messages') continue

        const value = change.value
        const messages: any[] = value?.messages || []
        const contacts: any[] = value?.contacts || []
        const statuses: any[] = value?.statuses || []
        const phoneNumberId: string = value?.metadata?.phone_number_id || ''

        // ── Mensagens recebidas ──────────────────────────────────────────
        for (const msg of messages) {
          // Ignora mensagens enviadas por nós
          if (msg.from === this.phoneNumberId) continue

          const from = msg.from || ''
          const type = this.detectType(msg)
          const body = this.extractText(msg)
          const mediaUrl = this.extractMediaUrl(msg)

          // Marca como lida (usando o número que recebeu)
          this.markAsRead(msg.id, phoneNumberId).catch(() => {})

          const incoming: IncomingMessage = {
            externalId: msg.id || `cloud_${Date.now()}`,
            from,
            body,
            type,
            mediaUrl,
            timestamp: new Date(Number(msg.timestamp) * 1000),
          }

          // Localização recebida
          if (msg.type === 'location' && msg.location) {
            incoming.latitude = msg.location.latitude
            incoming.longitude = msg.location.longitude
            incoming.body = msg.location.name || msg.location.address || ''
          }

          logger.info(`[CloudAPI] Mensagem de ${from} | tipo: ${type}`)

          // A sessionId na Cloud API é o phoneNumberId
          // O service vai mapear para a sessão correta no banco
          this.messageCallbacks.forEach(cb => cb(phoneNumberId, incoming))
        }

        // ── Atualizações de status de entrega ────────────────────────────
        for (const status of statuses) {
          if (status.status === 'failed') {
            const err = status.errors?.[0]
            logger.warn(`[CloudAPI] FALHA no envio ${status.id} → para ${status.recipient_id} | código ${err?.code}: ${err?.title} — ${err?.error_data?.details || err?.message || ''}`)
          } else {
            logger.info(`[CloudAPI] Status ${status.id} → ${status.status}`)
          }
        }
      }
    }
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private extractText(msg: any): string {
    if (msg.type === 'text') return msg.text?.body || ''
    if (msg.type === 'button') return msg.button?.text || ''
    if (msg.type === 'interactive') {
      return msg.interactive?.button_reply?.title
        || msg.interactive?.list_reply?.title
        || ''
    }
    return ''
  }

  private extractMediaUrl(msg: any): string | undefined {
    // Na Cloud API, o mediaUrl é um ID que precisa ser resolvido via API
    // Retorna o ID para que o frontend possa buscar via endpoint de media
    const mediaTypes = ['image', 'video', 'audio', 'document', 'sticker', 'voice']
    for (const t of mediaTypes) {
      if (msg[t]?.id) return `meta:${msg[t].id}`
    }
    return undefined
  }

  private detectType(msg: any): IncomingMessage['type'] {
    switch (msg.type) {
      case 'image':
      case 'sticker': return 'IMAGE'
      case 'audio':
      case 'voice': return 'AUDIO'
      case 'document': return 'DOCUMENT'
      case 'video': return 'VIDEO'
      case 'location': return 'LOCATION'
      default: return 'TEXT'
    }
  }

  private async markAsRead(messageId: string, phoneNumberId?: string): Promise<void> {
    try {
      const { token, phoneNumberId: pid } = await this.creds(phoneNumberId)
      await this.req('POST', `/${pid}/messages`, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }, token)
    } catch {
      // ignora erros de mark-as-read
    }
  }

  /**
   * Baixa uma mídia do ID da Meta e retorna como base64
   */
  async downloadMedia(mediaId: string): Promise<{ data: string; mimeType: string }> {
    const { token } = await this.creds()
    // 1. Obtém a URL de download
    const info = await this.req<any>('GET', `/${mediaId}`, undefined, token)
    const url: string = info.url
    const mimeType: string = info.mime_type || 'application/octet-stream'

    // 2. Baixa o arquivo
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Erro ao baixar mídia: ${res.status}`)

    const buffer = Buffer.from(await res.arrayBuffer())
    return { data: buffer.toString('base64'), mimeType }
  }
}

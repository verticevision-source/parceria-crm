export interface IncomingMessage {
  externalId: string
  from: string
  senderName?: string   // nome do perfil do WhatsApp do cliente
  body: string
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO' | 'LOCATION'
  mediaUrl?: string
  latitude?: number
  longitude?: number
  timestamp: Date
  // true = mensagem enviada pelo próprio número por fora do CRM (celular/WhatsApp
  // Web espelhado). `from` passa a ser o destinatário (contato da conversa).
  fromMe?: boolean
  // JID @lid quando o WhatsApp usa endereçamento LID nesse contato. O envio TEM
  // que usar este endereço — mandar pro número puro fica PENDING (não entrega).
  lid?: string
}

export interface ConnectionStatus {
  sessionId: string
  status: 'CONNECTED' | 'DISCONNECTED' | 'WAITING_QR' | 'ERROR'
  phoneNumber?: string
  qrCode?: string
  error?: string
}

export interface SendMessageResult {
  externalId: string
  sentAt: Date
}

export interface SendFilePayload {
  data: string      // base64
  mimetype: string
  filename: string
}

/**
 * Interface para integração com WhatsApp.
 * Troque a implementação aqui para usar Evolution API, Baileys, API Oficial, etc.
 */
export interface IWhatsAppProvider {
  connect(sessionId: string, userId: string): Promise<ConnectionStatus>
  disconnect(sessionId: string): Promise<void>
  getStatus(sessionId: string): Promise<ConnectionStatus>
  getQRCode(sessionId: string): Promise<string | null>
  sendMessage(sessionId: string, to: string, body: string): Promise<SendMessageResult>
  sendFile?(sessionId: string, to: string, file: SendFilePayload): Promise<SendMessageResult>
  sendAudio?(sessionId: string, to: string, audioBase64: string): Promise<SendMessageResult>
  sendLocation?(sessionId: string, to: string, latitude: number, longitude: number, name?: string, address?: string): Promise<SendMessageResult>
  /** Busca a URL da foto de perfil do WhatsApp de um número (opcional) */
  getProfilePicUrl?(sessionId: string, number: string): Promise<string | null>
  onMessageReceived(callback: (sessionId: string, message: IncomingMessage) => void): void
  onStatusChanged(callback: (status: ConnectionStatus) => void): void
}

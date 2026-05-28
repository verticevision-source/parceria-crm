export interface IncomingMessage {
  externalId: string
  from: string
  body: string
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO'
  mediaUrl?: string
  timestamp: Date
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
  onMessageReceived(callback: (sessionId: string, message: IncomingMessage) => void): void
  onStatusChanged(callback: (status: ConnectionStatus) => void): void
}

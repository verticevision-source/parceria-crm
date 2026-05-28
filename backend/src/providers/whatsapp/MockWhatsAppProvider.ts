import QRCode from 'qrcode'
import { v4 as uuidv4 } from 'uuid'
import {
  IWhatsAppProvider,
  IncomingMessage,
  ConnectionStatus,
  SendMessageResult,
} from './IWhatsAppProvider'
import { logger } from '../../utils/logger'

/**
 * Provider MOCK para desenvolvimento e testes.
 * Simula o comportamento do WhatsApp sem conexão real.
 * Substitua por MockWhatsAppProvider → EvolutionProvider, BaileysProvider, etc.
 */
export class MockWhatsAppProvider implements IWhatsAppProvider {
  private sessions: Map<string, ConnectionStatus> = new Map()
  private messageCallbacks: Array<(sessionId: string, message: IncomingMessage) => void> = []
  private statusCallbacks: Array<(status: ConnectionStatus) => void> = []
  private connectionTimers: Map<string, NodeJS.Timeout> = new Map()

  async connect(sessionId: string, _userId: string): Promise<ConnectionStatus> {
    logger.info(`[MockProvider] Iniciando conexão para sessão: ${sessionId}`)

    const mockToken = `MOCK_TOKEN_${sessionId}_${Date.now()}`
    const qrDataUrl = await QRCode.toDataURL(mockToken, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })

    const status: ConnectionStatus = {
      sessionId,
      status: 'WAITING_QR',
      qrCode: qrDataUrl,
    }

    this.sessions.set(sessionId, status)
    this.emitStatusChange(status)

    // Simula auto-conexão após 15 segundos (como se o usuário escaneou o QR)
    const timer = setTimeout(async () => {
      const connected: ConnectionStatus = {
        sessionId,
        status: 'CONNECTED',
        phoneNumber: `5511${Math.floor(90000000 + Math.random() * 9999999)}`,
        qrCode: undefined,
      }
      this.sessions.set(sessionId, connected)
      this.emitStatusChange(connected)
      logger.info(`[MockProvider] Sessão ${sessionId} conectada automaticamente (mock)`)
    }, 15000)

    this.connectionTimers.set(sessionId, timer)

    return status
  }

  async disconnect(sessionId: string): Promise<void> {
    logger.info(`[MockProvider] Desconectando sessão: ${sessionId}`)

    const timer = this.connectionTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.connectionTimers.delete(sessionId)
    }

    const status: ConnectionStatus = {
      sessionId,
      status: 'DISCONNECTED',
    }

    this.sessions.set(sessionId, status)
    this.emitStatusChange(status)
  }

  async getStatus(sessionId: string): Promise<ConnectionStatus> {
    return (
      this.sessions.get(sessionId) || {
        sessionId,
        status: 'DISCONNECTED',
      }
    )
  }

  async getQRCode(sessionId: string): Promise<string | null> {
    const session = this.sessions.get(sessionId)
    return session?.qrCode || null
  }

  async sendMessage(sessionId: string, to: string, body: string): Promise<SendMessageResult> {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'CONNECTED') {
      throw new Error('Sessão não está conectada')
    }

    logger.info(`[MockProvider] Enviando mensagem para ${to}: ${body.substring(0, 50)}...`)

    return {
      externalId: `mock_${uuidv4()}`,
      sentAt: new Date(),
    }
  }

  onMessageReceived(callback: (sessionId: string, message: IncomingMessage) => void): void {
    this.messageCallbacks.push(callback)
  }

  onStatusChanged(callback: (status: ConnectionStatus) => void): void {
    this.statusCallbacks.push(callback)
  }

  /**
   * Simula recebimento de mensagem (use via rota de teste em DEV).
   */
  simulateIncomingMessage(sessionId: string, from: string, body: string): void {
    const message: IncomingMessage = {
      externalId: `mock_in_${uuidv4()}`,
      from,
      body,
      type: 'TEXT',
      timestamp: new Date(),
    }
    this.messageCallbacks.forEach((cb) => cb(sessionId, message))
  }

  private emitStatusChange(status: ConnectionStatus): void {
    this.statusCallbacks.forEach((cb) => cb(status))
  }
}

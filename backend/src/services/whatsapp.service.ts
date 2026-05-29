import { Server as SocketServer } from 'socket.io'
import { prisma } from '../config/database'
import { getWhatsAppProvider, getMockProvider } from '../providers/whatsapp/WhatsAppProviderFactory'
import { IncomingMessage } from '../providers/whatsapp/IWhatsAppProvider'
import { logger } from '../utils/logger'

let io: SocketServer | null = null

export function setSocketIO(socketServer: SocketServer): void {
  io = socketServer
  setupMessageListener()
  setupStatusListener()
}

async function resolveDbSession(sessionId: string) {
  // WAHA free tier always uses 'default' as session name — map to actual DB record
  if (sessionId === 'default') {
    return prisma.whatsAppSession.findFirst({
      where: { provider: 'waha', status: { not: 'DISCONNECTED' } },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    })
  }
  return prisma.whatsAppSession.findUnique({
    where: { id: sessionId },
    include: { user: true },
  })
}

function setupMessageListener(): void {
  const provider = getWhatsAppProvider()

  provider.onMessageReceived(async (sessionId: string, message: IncomingMessage) => {
    try {
      const session = await resolveDbSession(sessionId)
      if (!session) return

      let contact = await prisma.contact.findFirst({
        where: { userId: session.userId, phone: message.from },
      })

      if (!contact) {
        contact = await prisma.contact.create({
          data: {
            userId: session.userId,
            name: message.from,
            phone: message.from,
          },
        })
        logger.info(`[WhatsAppService] Novo contato criado automaticamente: ${message.from}`)
      }

      let conversation = await prisma.conversation.findFirst({
        where: { userId: session.userId, whatsappSessionId: session.id, contactId: contact.id },
      })

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            userId: session.userId,
            whatsappSessionId: session.id,
            contactId: contact.id,
            status: 'OPEN',
            lastMessage: message.body,
            lastMessageAt: message.timestamp,
            unreadCount: 1,
          },
        })
      } else {
        conversation = await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessage: message.body,
            lastMessageAt: message.timestamp,
            unreadCount: { increment: 1 },
            status: 'OPEN',
          },
        })
      }

      const savedMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          userId: session.userId,
          whatsappSessionId: session.id,
          contactId: contact.id,
          direction: 'IN',
          type: message.type,
          textBody: message.body,
          mediaUrl: message.mediaUrl,
          externalMessageId: message.externalId,
          sentAt: message.timestamp,
        },
      })

      if (io) {
        io.to(`user:${session.userId}`).emit('new-message', {
          message: savedMessage,
          conversation,
          contact,
        })
      }

      logger.info(`[WhatsAppService] Mensagem recebida de ${message.from} salva no banco`)
    } catch (err) {
      logger.error('[WhatsAppService] Erro ao processar mensagem recebida:', err)
    }
  })
}

function setupStatusListener(): void {
  const provider = getWhatsAppProvider()

  provider.onStatusChanged(async (status) => {
    try {
      // Resolve actual DB session (WAHA sends 'default', not the UUID)
      const session = await resolveDbSession(status.sessionId)
      if (!session) {
        logger.warn(`[WhatsAppService] Sessão não encontrada para status update: ${status.sessionId}`)
        return
      }

      const updateData: Record<string, unknown> = {
        status: status.status,
        qrCode: status.qrCode || null,
      }

      if (status.status === 'CONNECTED') {
        updateData.phoneNumber = status.phoneNumber
        updateData.connectedAt = new Date()
        updateData.qrCode = null
      }

      if (status.status === 'DISCONNECTED' || status.status === 'ERROR') {
        updateData.disconnectedAt = new Date()
      }

      // For WAITING_QR, fetch live QR from provider and include in update
      let qrCode = status.qrCode
      if (status.status === 'WAITING_QR' && !qrCode) {
        qrCode = await provider.getQRCode(session.id) || undefined
        if (qrCode) updateData.qrCode = qrCode
      }

      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: updateData,
      })

      if (io) {
        io.to(`user:${session.userId}`).emit('whatsapp-status', {
          sessionId: session.id,
          status: status.status,
          phoneNumber: status.phoneNumber,
          qrCode,
        })
      }

      logger.info(`[WhatsAppService] Status atualizado: ${session.id} → ${status.status}`)
    } catch (err) {
      logger.error('[WhatsAppService] Erro ao atualizar status da sessão:', err)
    }
  })
}

export class WhatsAppService {
  static async connect(userId: string) {
    const existing = await prisma.whatsAppSession.findFirst({
      where: { userId, status: { not: 'DISCONNECTED' } },
    })

    if (existing) {
      const provider = getWhatsAppProvider()
      const status = await provider.getStatus(existing.id)
      if (status.status === 'CONNECTED') {
        throw new Error('Já existe uma sessão conectada. Desconecte antes de conectar novamente.')
      }
    }

    const session = await prisma.whatsAppSession.create({
      data: {
        userId,
        status: 'WAITING_QR',
        provider: process.env.WHATSAPP_PROVIDER || 'mock',
      },
    })

    const provider = getWhatsAppProvider()
    const connectionStatus = await provider.connect(session.id, userId)

    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: { status: connectionStatus.status, qrCode: connectionStatus.qrCode },
    })

    return { session, status: connectionStatus }
  }

  static async disconnect(userId: string) {
    const session = await prisma.whatsAppSession.findFirst({
      where: { userId, status: { not: 'DISCONNECTED' } },
      orderBy: { createdAt: 'desc' },
    })

    if (!session) throw new Error('Nenhuma sessão ativa encontrada')

    const provider = getWhatsAppProvider()
    await provider.disconnect(session.id)

    return prisma.whatsAppSession.update({
      where: { id: session.id },
      data: { status: 'DISCONNECTED', disconnectedAt: new Date(), qrCode: null },
    })
  }

  static async getMySession(userId: string) {
    return prisma.whatsAppSession.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  }

  static async getQRCode(userId: string) {
    const session = await prisma.whatsAppSession.findFirst({
      where: { userId, status: 'WAITING_QR' },
      orderBy: { createdAt: 'desc' },
    })

    if (!session) return null

    // Fetch live QR from provider (WAHA generates it dynamically)
    const provider = getWhatsAppProvider()
    const liveQr = await provider.getQRCode(session.id)

    if (liveQr) {
      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: { qrCode: liveQr },
      })
      return liveQr
    }

    // Fall back to DB-cached QR if provider returned null
    return session.qrCode
  }

  static async getAllSessions() {
    return prisma.whatsAppSession.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  static async sendMessage(userId: string, to: string, body: string) {
    const session = await prisma.whatsAppSession.findFirst({
      where: { userId, status: 'CONNECTED' },
    })

    if (!session) throw new Error('Nenhuma sessão conectada encontrada')

    let contact = await prisma.contact.findFirst({
      where: { userId, phone: to },
    })

    if (!contact) {
      contact = await prisma.contact.create({
        data: { userId, name: to, phone: to },
      })
    }

    let conversation = await prisma.conversation.findFirst({
      where: { userId, whatsappSessionId: session.id, contactId: contact.id },
    })

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId,
          whatsappSessionId: session.id,
          contactId: contact.id,
          status: 'OPEN',
          lastMessage: body,
          lastMessageAt: new Date(),
        },
      })
    }

    const provider = getWhatsAppProvider()
    const result = await provider.sendMessage(session.id, to, body)

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId,
        whatsappSessionId: session.id,
        contactId: contact.id,
        direction: 'OUT',
        type: 'TEXT',
        textBody: body,
        externalMessageId: result.externalId,
        sentAt: result.sentAt,
      },
    })

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessage: body, lastMessageAt: result.sentAt },
    })

    if (io) {
      io.to(`user:${userId}`).emit('new-message', { message, conversation, contact })
    }

    return message
  }

  static simulateIncomingMessage(sessionId: string, from: string, body: string): void {
    const mockProvider = getMockProvider()
    mockProvider.simulateIncomingMessage(sessionId, from, body)
  }
}

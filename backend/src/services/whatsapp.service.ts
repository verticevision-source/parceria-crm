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
  // Cloud API: a Meta envia o phoneNumberId como sessionId — busca pela sessão cloud ativa
  const byId = await prisma.whatsAppSession.findUnique({
    where: { id: sessionId },
    include: { user: true },
  })
  if (byId) return byId

  // Fallback: busca sessão cloud ativa
  return prisma.whatsAppSession.findFirst({
    where: { provider: 'cloud', status: 'CONNECTED' },
    orderBy: { createdAt: 'desc' },
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

    const providerName = process.env.WHATSAPP_PROVIDER || 'mock'

    const session = await prisma.whatsAppSession.create({
      data: {
        userId,
        // Cloud API conecta direto sem QR
        status: providerName === 'cloud' ? 'CONNECTED' : 'WAITING_QR',
        provider: providerName,
      },
    })

    const provider = getWhatsAppProvider()
    const connectionStatus = await provider.connect(session.id, userId)

    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: {
        status: connectionStatus.status,
        qrCode: connectionStatus.qrCode || null,
        phoneNumber: connectionStatus.phoneNumber || null,
        connectedAt: connectionStatus.status === 'CONNECTED' ? new Date() : null,
      },
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

    const provider = getWhatsAppProvider()

    // Sync live WAHA status — session might have connected while DB wasn't updated
    const liveStatus = await provider.getStatus(session.id)
    if (liveStatus.status === 'CONNECTED') {
      logger.info(`[WhatsAppService] WAHA conectado mas DB desatualizado — sincronizando`)
      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: {
          status: 'CONNECTED',
          phoneNumber: liveStatus.phoneNumber || null,
          connectedAt: new Date(),
          qrCode: null,
        },
      })
      if (io) {
        io.to(`user:${session.userId}`).emit('whatsapp-status', {
          sessionId: session.id,
          status: 'CONNECTED',
          phoneNumber: liveStatus.phoneNumber,
        })
        logger.info(`[WhatsAppService] Status CONNECTED emitido via socket para user ${session.userId}`)
      }
      return null  // Already connected — no QR needed
    }

    // Fetch live QR from provider (WAHA generates it dynamically)
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
    const sessions = await prisma.whatsAppSession.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    })

    // Para sessões aguardando QR, busca QR atualizado diretamente na Evolution API
    const provider = getWhatsAppProvider()
    const refreshed = await Promise.all(sessions.map(async (s) => {
      if (s.status !== 'WAITING_QR') return s
      try {
        // Verifica se já conectou
        const live = await provider.getStatus(s.id)
        if (live.status === 'CONNECTED') {
          const updated = await prisma.whatsAppSession.update({
            where: { id: s.id },
            data: { status: 'CONNECTED', phoneNumber: live.phoneNumber || null, connectedAt: new Date(), qrCode: null },
            include: { user: { select: { id: true, name: true, email: true } } },
          })
          if (io) io.to(`user:${s.userId}`).emit('whatsapp-status', { sessionId: s.id, status: 'CONNECTED', phoneNumber: live.phoneNumber })
          return updated
        }
        // Busca QR fresco
        const qrCode = await provider.getQRCode(s.id)
        if (qrCode) {
          return { ...s, qrCode }  // retorna sem persistir — evita write no banco a cada poll
        }
      } catch { /* ignora falhas de rede */ }
      return s
    }))

    return refreshed
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

  // Admin connects a number for a specific user
  static async connectForUser(adminId: string, targetUserId: string) {
    void adminId // caller must verify admin role before calling
    return WhatsAppService.connect(targetUserId)
  }

  // Admin gets all sessions with user info (already exists as getAllSessions)
  static async getAllSessionsWithUsers() {
    return WhatsAppService.getAllSessions()
  }

  // Admin assigns existing session to a different user
  static async assignSession(sessionId: string, targetUserId: string) {
    const session = await prisma.whatsAppSession.findUnique({ where: { id: sessionId } })
    if (!session) throw new Error('Sessão não encontrada')

    return prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: { userId: targetUserId },
    })
  }

  // Admin disconnects a session by ID
  static async disconnectById(sessionId: string) {
    const session = await prisma.whatsAppSession.findUnique({ where: { id: sessionId } })
    if (!session) throw new Error('Sessão não encontrada')

    const provider = getWhatsAppProvider()
    await provider.disconnect(session.id)

    return prisma.whatsAppSession.update({
      where: { id: session.id },
      data: { status: 'DISCONNECTED', disconnectedAt: new Date(), qrCode: null },
    })
  }

  // Send media (image/document) via WAHA
  static async sendMedia(
    userId: string,
    to: string,
    file: { data: string; mimetype: string; filename: string }
  ) {
    const session = await prisma.whatsAppSession.findFirst({
      where: { userId, status: 'CONNECTED' },
    })
    if (!session) throw new Error('Nenhuma sessão conectada encontrada')

    let contact = await prisma.contact.findFirst({ where: { userId, phone: to } })
    if (!contact) {
      contact = await prisma.contact.create({ data: { userId, name: to, phone: to } })
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
          lastMessage: `[${file.mimetype.split('/')[0]}]`,
          lastMessageAt: new Date(),
        },
      })
    }

    const provider = getWhatsAppProvider()
    const result = await (provider as any).sendFile
      ? (provider as any).sendFile(session.id, to, file)
      : provider.sendMessage(session.id, to, `[Arquivo: ${file.filename}]`)

    const msgType = file.mimetype.startsWith('image/')
      ? 'IMAGE'
      : file.mimetype.startsWith('video/')
      ? 'VIDEO'
      : file.mimetype.startsWith('audio/')
      ? 'AUDIO'
      : 'DOCUMENT'

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId,
        whatsappSessionId: session.id,
        contactId: contact.id,
        direction: 'OUT',
        type: msgType,
        textBody: file.filename,
        externalMessageId: result?.externalId,
        sentAt: result?.sentAt || new Date(),
      },
    })

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessage: `[${msgType}]`, lastMessageAt: new Date() },
    })

    if (io) {
      io.to(`user:${userId}`).emit('new-message', { message, conversation, contact })
    }

    return message
  }

  // Send audio (voice message) via WAHA
  static async sendAudio(userId: string, to: string, audioData: string, mimetype?: string) {
    const session = await prisma.whatsAppSession.findFirst({
      where: { userId, status: 'CONNECTED' },
    })
    if (!session) throw new Error('Nenhuma sessão conectada encontrada')

    let contact = await prisma.contact.findFirst({ where: { userId, phone: to } })
    if (!contact) {
      contact = await prisma.contact.create({ data: { userId, name: to, phone: to } })
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
          lastMessage: '[Áudio]',
          lastMessageAt: new Date(),
        },
      })
    }

    const provider = getWhatsAppProvider()
    const result = await (provider as any).sendAudio
      ? (provider as any).sendAudio(session.id, to, audioData, mimetype)
      : provider.sendMessage(session.id, to, '[Áudio]')

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId,
        whatsappSessionId: session.id,
        contactId: contact.id,
        direction: 'OUT',
        type: 'AUDIO',
        textBody: null,
        externalMessageId: result?.externalId,
        sentAt: result?.sentAt || new Date(),
      },
    })

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessage: '[Áudio]', lastMessageAt: new Date() },
    })

    if (io) {
      io.to(`user:${userId}`).emit('new-message', { message, conversation, contact })
    }

    return message
  }
}

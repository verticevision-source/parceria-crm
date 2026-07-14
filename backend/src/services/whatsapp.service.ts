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

// ── Helpers de telefone/contato (dedup) ───────────────────────────────────────
function normalizePhone(p: string): string {
  return (p || '').replace(/@.*$/, '').replace(/\D/g, '')
}

/** Acha contato por telefone tolerando formatação (compara últimos dígitos) */
async function findContactByPhone(userId: string, phone: string) {
  const exact = await prisma.contact.findFirst({ where: { userId, phone } })
  if (exact) return exact
  const tail = phone.slice(-8)
  if (tail.length < 6) return null
  const candidates = await prisma.contact.findMany({ where: { userId, phone: { contains: tail } } })
  return candidates[0] || null
}

/** Acha contato por telefone em qualquer usuário (modelo de número compartilhado).
 *  Match PRECISO: número exato + variação do 9º dígito (celular BR). Não usa
 *  "últimos 8 dígitos" (que misturava contatos de DDDs diferentes). Sempre
 *  ordena por createdAt (determinístico) para não duplicar conversas. */
async function findContactGlobal(phone: string) {
  const digits = (phone || '').replace(/\D/g, '')
  const candidates = [phone, digits].filter(Boolean)

  // Variação do 9º dígito: 55 DDD [9] XXXXXXXX
  const m = digits.match(/^55(\d{2})(\d{8,9})$/)
  if (m) {
    const ddd = m[1], rest = m[2]
    if (rest.length === 9 && rest.startsWith('9')) candidates.push(`55${ddd}${rest.slice(1)}`)
    else if (rest.length === 8) candidates.push(`55${ddd}9${rest}`)
  }

  for (const p of [...new Set(candidates)]) {
    const c = await prisma.contact.findFirst({ where: { phone: p }, orderBy: { createdAt: 'asc' } })
    if (c) return c
  }
  return null
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

      const phone = normalizePhone(message.from)

      // ── Mensagem enviada por fora do CRM (celular/WhatsApp Web espelhado) ──
      // Espelha como mensagem de SAÍDA; não dispara bot/IA/auto-tag.
      if (message.fromMe) {
        await handleOutgoingMirror(session, session.userId, phone, message)
        return
      }

      // Dono = o atendente que conectou este número (a sessão). Ele recebe e vê
      // tudo que chega no número. Se o contato já existia com outro dono (sobra
      // de uso anterior), reatribuímos ao dono do número.
      const ownerUserId = session.userId

      let contact = await findContactGlobal(phone)

      if (!contact) {
        contact = await prisma.contact.create({
          data: {
            userId: ownerUserId,
            name: message.senderName?.trim() || phone,
            phone,
          },
        })
        logger.info(`[WhatsAppService] Novo contato criado: ${contact.name} (${phone})`)
      } else {
        const reassign = contact.userId !== ownerUserId
        const newName = (message.senderName?.trim() && (contact.name === contact.phone || !contact.name))
          ? message.senderName.trim() : undefined
        if (reassign || newName) {
          contact = await prisma.contact.update({
            where: { id: contact.id },
            data: {
              ...(reassign ? { userId: ownerUserId } : {}),
              ...(newName ? { name: newName } : {}),
            },
          })
          if (reassign) logger.info(`[WhatsAppService] Contato ${phone} reatribuído ao dono do número (${ownerUserId})`)
        }
      }

      // Foto de perfil do WhatsApp — preenche se o contato ainda não tem (1ª vez)
      if (!contact.avatarUrl && typeof (provider as any).getProfilePicUrl === 'function') {
        try {
          const pic = await (provider as any).getProfilePicUrl(session.id, contact.phone)
          if (pic) contact = await prisma.contact.update({ where: { id: contact.id }, data: { avatarUrl: pic } })
        } catch { /* ignora falha de foto */ }
      }

      // Conversa única por contato
      let conversation = await prisma.conversation.findFirst({
        where: { contactId: contact.id },
        orderBy: { createdAt: 'asc' },
      })

      let isNewConversation = false
      if (!conversation) {
        isNewConversation = true
        conversation = await prisma.conversation.create({
          data: {
            userId: ownerUserId,
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
            userId: ownerUserId,   // garante que a conversa fica com o dono do número
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
          userId: conversation.userId,
          whatsappSessionId: session.id,
          contactId: contact.id,
          direction: 'IN',
          type: message.type,
          textBody: message.body,
          mediaUrl: message.mediaUrl,
          latitude: message.latitude ?? null,
          longitude: message.longitude ?? null,
          externalMessageId: message.externalId,
          sentAt: message.timestamp,
        },
      })

      const ownerId = conversation.userId
      if (io) {
        io.to(`user:${ownerId}`).emit('new-message', {
          message: savedMessage,
          conversation,
          contact,
        })
      }

      // ── Auto-tag por palavra-chave (mensagens de texto) ──
      try {
        const { applyAutoTags } = await import('./autoTag.service')
        const applied = await applyAutoTags(conversation.id, message.body)
        if (applied.length > 0 && io) {
          io.to(`user:${ownerId}`).emit('conversation:tags', { conversationId: conversation.id, tags: applied })
        }
      } catch (e) {
        console.error('[auto-tag] erro:', e)
      }

      // ── Chatbot (fluxo): roda antes da roleta/IA ──
      let botHandled = false
      if (message.type === 'TEXT') {
        try {
          const { ChatFlowService } = await import('./chatFlow.service')
          // Continua um fluxo aguardando resposta
          botHandled = await ChatFlowService.handleInbound(conversation.id, message.body, ownerId, contact.phone)
          // Ou inicia o fluxo para conversa nova
          if (!botHandled && isNewConversation) {
            botHandled = await ChatFlowService.startForConversation(conversation.id, contact.id, ownerId, contact.phone)
          }
        } catch (e) {
          logger.error('[WhatsAppService] Erro no fluxo do chatbot:', e)
        }
      }

      // ── Remarketing: se este contato respondeu a um disparo, marca e devolve à roleta ──
      await handleRemarketingReply(contact.id, contact.phone).catch((e) =>
        logger.error('[WhatsAppService] Erro no retorno de remarketing:', e)
      )

      // ── IA: resposta automática (somente se o bot não assumiu) ──
      if (!botHandled && conversation.aiAuto && message.type === 'TEXT') {
        handleAiAutoReply(conversation.id, ownerId, contact.phone).catch((e) =>
          logger.error('[WhatsAppService] Erro na resposta automática de IA:', e)
        )
      }

      logger.info(`[WhatsAppService] Mensagem recebida de ${message.from} salva no banco`)
    } catch (err) {
      logger.error('[WhatsAppService] Erro ao processar mensagem recebida:', err)
    }
  })
}

/**
 * Espelha no CRM uma mensagem enviada pelo próprio número por fora do CRM
 * (o atendente respondeu pelo celular / WhatsApp Web). Registra como direção
 * OUT, sem disparar bot/IA/auto-tag/remarketing.
 */
async function handleOutgoingMirror(
  session: { id: string; userId: string },
  ownerUserId: string,
  phone: string,
  message: IncomingMessage,
): Promise<void> {
  // Evita duplicar: o eco das mensagens que o próprio CRM enviou já está salvo
  if (message.externalId) {
    const exists = await prisma.message.findFirst({
      where: { externalMessageId: message.externalId },
      select: { id: true },
    })
    if (exists) return
  }

  let contact = await findContactGlobal(phone)
  if (!contact) {
    contact = await prisma.contact.create({
      data: { userId: ownerUserId, name: phone, phone },
    })
    logger.info(`[WhatsAppService] Novo contato criado (msg de saída): ${phone}`)
  } else if (contact.userId !== ownerUserId) {
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: { userId: ownerUserId },
    })
  }

  let conversation = await prisma.conversation.findFirst({
    where: { contactId: contact.id },
    orderBy: { createdAt: 'asc' },
  })

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        userId: ownerUserId,
        whatsappSessionId: session.id,
        contactId: contact.id,
        status: 'OPEN',
        lastMessage: message.body,
        lastMessageAt: message.timestamp,
        unreadCount: 0,
      },
    })
  } else {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        userId: ownerUserId,
        lastMessage: message.body,
        lastMessageAt: message.timestamp,
        unreadCount: 0, // o atendente respondeu → zera não-lidas
        status: 'OPEN',
      },
    })
  }

  const savedMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      userId: conversation.userId,
      whatsappSessionId: session.id,
      contactId: contact.id,
      direction: 'OUT',
      type: message.type,
      textBody: message.body,
      mediaUrl: message.mediaUrl,
      latitude: message.latitude ?? null,
      longitude: message.longitude ?? null,
      externalMessageId: message.externalId,
      sentAt: message.timestamp,
    },
  })

  if (io) {
    io.to(`user:${conversation.userId}`).emit('new-message', {
      message: savedMessage,
      conversation,
      contact,
    })
  }
  logger.info(`[WhatsAppService] Mensagem enviada por fora do CRM espelhada (para ${phone})`)
}

/**
 * Quando um contato que recebeu um disparo de remarketing responde:
 *  - marca o recipient como "replied"
 *  - devolve o lead para a fila da roleta (redistribui para um agente ativo)
 */
async function handleRemarketingReply(contactId: string, phone: string): Promise<void> {
  // Procura recipients enviados nas últimas 72h ainda não respondidos
  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - 72)

  const recipient = await prisma.bulkMessageRecipient.findFirst({
    where: {
      contactId,
      status: 'sent',
      sentAt: { gte: cutoff },
    },
    orderBy: { sentAt: 'desc' },
  })

  if (!recipient) return

  // Marca como respondido
  await prisma.bulkMessageRecipient.update({
    where: { id: recipient.id },
    data: { status: 'replied', repliedAt: new Date() },
  })

  logger.info(`[Remarketing] Contato ${phone} respondeu ao disparo — devolvendo à roleta`)

  // Devolve à roleta (distribui para um agente ativo)
  try {
    const { RouletteService } = await import('./roulette.service')
    await RouletteService.distribute({
      contactId,
      source: 'remarketing-reply',
      notes: 'Cliente respondeu a disparo de remarketing',
    })
  } catch (e: any) {
    // Sem agente ativo — apenas loga, não quebra o fluxo
    logger.warn(`[Remarketing] Não foi possível redistribuir: ${e.message}`)
  }
}

/**
 * Resposta automática da IA: gera uma resposta com base no histórico e envia.
 */
async function handleAiAutoReply(conversationId: string, userId: string, phone: string): Promise<void> {
  try {
    const { AIService } = await import('./ai.service')
    const reply = await AIService.suggestForConversation(conversationId)
    if (!reply?.trim()) return
    // Pequeno atraso para parecer mais natural
    await new Promise((r) => setTimeout(r, 1500))
    await WhatsAppService.sendMessage(userId, phone, reply)
    logger.info(`[IA] Resposta automática enviada para ${phone}`)
  } catch (e: any) {
    logger.warn(`[IA] Falha na resposta automática: ${e.message}`)
  }
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
    const providerName = process.env.WHATSAPP_PROVIDER || 'mock'

    // Cloud API: número compartilhado — reutiliza a sessão existente em vez de criar nova
    if (providerName === 'cloud') {
      const existingCloud = await prisma.whatsAppSession.findFirst({
        where: { userId, provider: 'cloud', status: 'CONNECTED' },
        orderBy: { createdAt: 'desc' },
      })
      if (existingCloud) {
        const provider = getWhatsAppProvider()
        const status = await provider.connect(existingCloud.id, userId)
        return { session: existingCloud, status }
      }
    }

    const existing = await prisma.whatsAppSession.findFirst({
      where: { userId, status: { not: 'DISCONNECTED' } },
    })

    if (existing && providerName !== 'cloud') {
      const provider = getWhatsAppProvider()
      const status = await provider.getStatus(existing.id)
      if (status.status === 'CONNECTED') {
        throw new Error('Já existe uma sessão conectada. Desconecte antes de conectar novamente.')
      }
    }

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
    // Prefere a sessão do próprio usuário; se não tiver, usa qualquer número
    // conectado (modelo de número compartilhado da Cloud API oficial)
    let session = await prisma.whatsAppSession.findFirst({
      where: { userId, status: 'CONNECTED' },
      orderBy: { createdAt: 'desc' },  // prefere a sessão reconectada mais recente
    })
    if (!session) {
      session = await prisma.whatsAppSession.findFirst({
        where: { status: 'CONNECTED' },
        orderBy: { createdAt: 'desc' },
      })
    }

    if (!session) throw new Error('Nenhuma sessão conectada encontrada')

    const phone = normalizePhone(to)
    let contact = await findContactGlobal(phone)
    if (!contact) {
      contact = await prisma.contact.create({ data: { userId, name: phone, phone } })
    }

    let conversation = await prisma.conversation.findFirst({
      where: { contactId: contact.id },
      orderBy: { createdAt: 'asc' },
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
      orderBy: { createdAt: 'desc' },  // prefere a sessão reconectada mais recente
    })
    if (!session) throw new Error('Nenhuma sessão conectada encontrada')

    let contact = await prisma.contact.findFirst({ where: { userId, phone: to } })
    if (!contact) {
      contact = await prisma.contact.create({ data: { userId, name: to, phone: to } })
    }

    let conversation = await prisma.conversation.findFirst({
      where: { contactId: contact.id },
      orderBy: { createdAt: 'asc' },
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
    // IMPORTANTE: o await tem que envolver a CHAMADA, não a referência da função.
    // `await x.sendFile ? a : b` avalia (await x.sendFile) primeiro → bug (result vira Promise).
    const result = (provider as any).sendFile
      ? await (provider as any).sendFile(session.id, to, file)
      : await provider.sendMessage(session.id, to, `[Arquivo: ${file.filename}]`)

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
        // Referência à mídia no Evolution (não base64) — evita inchar o banco
        mediaUrl: result?.externalId ? `evo:${session.id}:${result.externalId}` : null,
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
      orderBy: { createdAt: 'desc' },  // prefere a sessão reconectada mais recente
    })
    if (!session) throw new Error('Nenhuma sessão conectada encontrada')

    let contact = await prisma.contact.findFirst({ where: { userId, phone: to } })
    if (!contact) {
      contact = await prisma.contact.create({ data: { userId, name: to, phone: to } })
    }

    let conversation = await prisma.conversation.findFirst({
      where: { contactId: contact.id },
      orderBy: { createdAt: 'asc' },
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
    const result = (provider as any).sendAudio
      ? await (provider as any).sendAudio(session.id, to, audioData, mimetype)
      : await provider.sendMessage(session.id, to, '[Áudio]')

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId,
        whatsappSessionId: session.id,
        contactId: contact.id,
        direction: 'OUT',
        type: 'AUDIO',
        textBody: null,
        // Referência à mídia no Evolution (não base64)
        mediaUrl: result?.externalId ? `evo:${session.id}:${result.externalId}` : null,
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

  // Envia mensagem de modelo (template) — inicia conversa fora da janela 24h
  static async sendTemplate(
    userId: string, to: string,
    templateName: string, language: string, variables: string[], previewText: string
  ) {
    let session = await prisma.whatsAppSession.findFirst({ where: { userId, status: 'CONNECTED' } })
    if (!session) {
      session = await prisma.whatsAppSession.findFirst({ where: { status: 'CONNECTED' }, orderBy: { createdAt: 'desc' } })
    }
    if (!session) throw new Error('Nenhuma sessão conectada encontrada')

    const phone = normalizePhone(to)
    let contact = await findContactGlobal(phone)
    if (!contact) contact = await prisma.contact.create({ data: { userId, name: phone, phone } })

    let conversation = await prisma.conversation.findFirst({
      where: { contactId: contact.id },
      orderBy: { createdAt: 'asc' },
    })
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId, whatsappSessionId: session.id, contactId: contact.id,
          status: 'OPEN', lastMessage: previewText, lastMessageAt: new Date(),
        },
      })
    }

    const provider = getWhatsAppProvider()
    const result = (provider as any).sendTemplate
      ? await (provider as any).sendTemplate(session.id, to, templateName, language, variables)
      : await provider.sendMessage(session.id, to, previewText)

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id, userId, whatsappSessionId: session.id, contactId: contact.id,
        direction: 'OUT', type: 'TEXT', textBody: previewText,
        externalMessageId: result?.externalId, sentAt: result?.sentAt || new Date(),
      },
    })

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessage: previewText, lastMessageAt: new Date() },
    })

    if (io) io.to(`user:${userId}`).emit('new-message', { message, conversation, contact })
    return message
  }

  // Envia localização
  static async sendLocation(
    userId: string, to: string,
    latitude: number, longitude: number, name?: string
  ) {
    let session = await prisma.whatsAppSession.findFirst({ where: { userId, status: 'CONNECTED' } })
    if (!session) {
      session = await prisma.whatsAppSession.findFirst({ where: { status: 'CONNECTED' }, orderBy: { createdAt: 'desc' } })
    }
    if (!session) throw new Error('Nenhuma sessão conectada encontrada')

    const phone = normalizePhone(to)
    let contact = await findContactGlobal(phone)
    if (!contact) contact = await prisma.contact.create({ data: { userId, name: phone, phone } })

    let conversation = await prisma.conversation.findFirst({
      where: { contactId: contact.id },
      orderBy: { createdAt: 'asc' },
    })
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId, whatsappSessionId: session.id, contactId: contact.id,
          status: 'OPEN', lastMessage: '[Localização]', lastMessageAt: new Date(),
        },
      })
    }

    const provider = getWhatsAppProvider()
    const result = (provider as any).sendLocation
      ? await (provider as any).sendLocation(session.id, to, latitude, longitude, name)
      : await provider.sendMessage(session.id, to, `Localização: https://maps.google.com/?q=${latitude},${longitude}`)

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        userId, whatsappSessionId: session.id, contactId: contact.id,
        direction: 'OUT', type: 'LOCATION',
        textBody: name || null,
        latitude, longitude,
        externalMessageId: result?.externalId,
        sentAt: result?.sentAt || new Date(),
      },
    })

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessage: '[Localização]', lastMessageAt: new Date() },
    })

    if (io) io.to(`user:${userId}`).emit('new-message', { message, conversation, contact })
    return message
  }
}

import 'dotenv/config'
import http from 'http'
import { Server as SocketServer } from 'socket.io'
import app from './app'
import { setSocketIO } from './services/whatsapp.service'
import { setRouletteSocketIO } from './services/roulette.service'
import { setInternalChatIO } from './services/internalChat.service'
import { verifyToken } from './utils/jwt'
import { logger } from './utils/logger'

const PORT = process.env.PORT || 3001
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

const httpServer = http.createServer(app)

const io = new SocketServer(httpServer, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

// Autenticação do socket: exige JWT válido no handshake
io.use((socket, next) => {
  try {
    const token = (socket.handshake.auth as any)?.token
    if (!token) return next(new Error('unauthorized'))
    const payload = verifyToken(token)
    ;(socket.data as any).userId = payload.userId
    ;(socket.data as any).role = payload.role
    next()
  } catch {
    next(new Error('unauthorized'))
  }
})

io.on('connection', (socket) => {
  const userId = (socket.data as any).userId as string
  // Entra automaticamente APENAS na própria sala — impede ouvir conversas de outros
  socket.join(`user:${userId}`)
  logger.info(`[Socket.IO] Conectado e autenticado: user:${userId}`)

  // 'join' mantido por compatibilidade, mas só entra na própria sala (ignora o arg do cliente)
  socket.on('join', () => { socket.join(`user:${userId}`) })

  socket.on('disconnect', () => {
    logger.info(`[Socket.IO] Desconectado: user:${userId}`)
  })
})

setSocketIO(io)
setRouletteSocketIO(io)
setInternalChatIO(io)

// Verifica timeouts do chatbot a cada 5 minutos
setInterval(async () => {
  try {
    const { ChatFlowService } = await import('./services/chatFlow.service')
    await ChatFlowService.processTimeouts(30)
  } catch { /* silencioso */ }
}, 5 * 60 * 1000)

// Poller de mensagens agendadas
import('./services/scheduledMessage.service')
  .then(({ ScheduledMessageService }) => ScheduledMessageService.start())
  .catch((e) => logger.error('[scheduler] falha ao iniciar:', e))

httpServer.listen(PORT, () => {
  logger.info(`🚀 Servidor rodando na porta ${PORT}`)
  logger.info(`📡 Socket.IO ativo`)
  logger.info(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`)
  logger.info(`📋 API: http://localhost:${PORT}/api`)
  logger.info(`❤️  Health: http://localhost:${PORT}/health`)
})

export { io }

import 'dotenv/config'
import http from 'http'
import { Server as SocketServer } from 'socket.io'
import app from './app'
import { setSocketIO } from './services/whatsapp.service'
import { setRouletteSocketIO } from './services/roulette.service'
import { setInternalChatIO } from './services/internalChat.service'
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

io.on('connection', (socket) => {
  logger.info(`[Socket.IO] Cliente conectado: ${socket.id}`)

  socket.on('join', (userId: string) => {
    socket.join(`user:${userId}`)
    logger.info(`[Socket.IO] Usuário ${userId} entrou na sala user:${userId}`)
  })

  socket.on('leave', (userId: string) => {
    socket.leave(`user:${userId}`)
  })

  socket.on('disconnect', () => {
    logger.info(`[Socket.IO] Cliente desconectado: ${socket.id}`)
  })
})

setSocketIO(io)
setRouletteSocketIO(io)
setInternalChatIO(io)

httpServer.listen(PORT, () => {
  logger.info(`🚀 Servidor rodando na porta ${PORT}`)
  logger.info(`📡 Socket.IO ativo`)
  logger.info(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`)
  logger.info(`📋 API: http://localhost:${PORT}/api`)
  logger.info(`❤️  Health: http://localhost:${PORT}/health`)
})

export { io }

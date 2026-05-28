import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import 'dotenv/config'
import routes from './routes'
import webhookRoutes from './routes/webhook.routes'
import { errorHandler } from './middlewares/errorHandler.middleware'
import { logger } from './utils/logger'

const app = express()

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev', { stream: { write: (msg) => logger.info(msg.trim()) } }))
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Webhook público — sem JWT (Evolution API chama diretamente)
app.use('/api/webhook', webhookRoutes)

app.use('/api', routes)

app.use(errorHandler)

export default app

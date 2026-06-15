import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import morgan from 'morgan'
import 'dotenv/config'
import routes from './routes'
import webhookRoutes from './routes/webhook.routes'
import { errorHandler } from './middlewares/errorHandler.middleware'
import { logger } from './utils/logger'

const app = express()

// Atrás do proxy do DigitalOcean — necessário para rate-limit por IP funcionar
app.set('trust proxy', 1)

// Headers de segurança. CSP desligado (é API) e CORP cross-origin para não
// bloquear imagens servidas pelo proxy de mídia no frontend.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))

app.use(express.json({ limit: '25mb' }))
app.use(express.urlencoded({ extended: true, limit: '25mb' }))

// Anti força-bruta no login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
})
app.use('/api/auth/login', loginLimiter)

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

import { Response } from 'express'
import { z } from 'zod'
import { WhatsAppService } from '../services/whatsapp.service'
import { AuthRequest } from '../types'

const sendSchema = z.object({
  to: z.string().min(10, 'Número inválido'),
  body: z.string().min(1, 'Mensagem não pode ser vazia'),
})

const simulateSchema = z.object({
  sessionId: z.string().uuid(),
  from: z.string().min(10),
  body: z.string().min(1),
})

export class WhatsAppController {
  static async connect(req: AuthRequest, res: Response): Promise<void> {
    const result = await WhatsAppService.connect(req.user!.userId)
    res.json({ success: true, data: result })
  }

  static async disconnect(req: AuthRequest, res: Response): Promise<void> {
    const session = await WhatsAppService.disconnect(req.user!.userId)
    res.json({ success: true, data: session })
  }

  static async getSession(req: AuthRequest, res: Response): Promise<void> {
    const session = await WhatsAppService.getMySession(req.user!.userId)
    res.json({ success: true, data: session })
  }

  static async getQRCode(req: AuthRequest, res: Response): Promise<void> {
    const qrCode = await WhatsAppService.getQRCode(req.user!.userId)
    res.json({ success: true, data: { qrCode } })
  }

  static async sendMessage(req: AuthRequest, res: Response): Promise<void> {
    const parse = sendSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.errors[0].message })
      return
    }
    const message = await WhatsAppService.sendMessage(
      req.user!.userId,
      parse.data.to,
      parse.data.body
    )
    res.json({ success: true, data: message })
  }

  static async getAllSessions(_req: AuthRequest, res: Response): Promise<void> {
    const sessions = await WhatsAppService.getAllSessions()
    res.json({ success: true, data: sessions })
  }

  // DEV ONLY: simula chegada de mensagem para testes
  static async simulateMessage(req: AuthRequest, res: Response): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ success: false, message: 'Não disponível em produção' })
      return
    }
    const parse = simulateSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ success: false, message: parse.error.errors[0].message })
      return
    }
    WhatsAppService.simulateIncomingMessage(
      parse.data.sessionId,
      parse.data.from,
      parse.data.body
    )
    res.json({ success: true, message: 'Mensagem simulada enviada' })
  }

  // Admin: connect a number for a specific user
  static async adminConnect(req: AuthRequest, res: Response): Promise<void> {
    const { userId } = req.body
    if (!userId) {
      res.status(400).json({ success: false, message: 'userId é obrigatório' })
      return
    }
    const result = await WhatsAppService.connectForUser(req.user!.userId, userId)
    res.json({ success: true, data: result })
  }

  // Admin: disconnect a session by ID
  static async adminDisconnect(req: AuthRequest, res: Response): Promise<void> {
    const { sessionId } = req.params
    const session = await WhatsAppService.disconnectById(sessionId)
    res.json({ success: true, data: session })
  }

  // Send media file (multipart or base64 JSON)
  static async sendMedia(req: AuthRequest, res: Response): Promise<void> {
    const { to } = req.body

    if (!to) {
      res.status(400).json({ success: false, message: 'to é obrigatório' })
      return
    }

    let filePayload: { data: string; mimetype: string; filename: string }

    // Support multipart upload (multer populates req.file)
    const multerFile = (req as any).file as Express.Multer.File | undefined
    if (multerFile) {
      filePayload = {
        data: multerFile.buffer.toString('base64'),
        mimetype: multerFile.mimetype,
        filename: multerFile.originalname,
      }
    } else if (req.body.data && req.body.mimetype && req.body.filename) {
      // JSON base64 body
      filePayload = {
        data: req.body.data,
        mimetype: req.body.mimetype,
        filename: req.body.filename,
      }
    } else {
      res.status(400).json({ success: false, message: 'Arquivo não fornecido' })
      return
    }

    const message = await WhatsAppService.sendMedia(req.user!.userId, to, filePayload)
    res.json({ success: true, data: message })
  }

  // Send audio voice message
  static async sendAudio(req: AuthRequest, res: Response): Promise<void> {
    const { to, audio, mimetype } = req.body
    if (!to || !audio) {
      res.status(400).json({ success: false, message: 'to e audio são obrigatórios' })
      return
    }
    const message = await WhatsAppService.sendAudio(req.user!.userId, to, audio, mimetype)
    res.json({ success: true, data: message })
  }
}

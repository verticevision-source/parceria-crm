import { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'

// Mensagens de erro internas que NÃO devem vazar para o cliente
const INTERNAL_PATTERNS = [
  /prisma/i,
  /econnrefused/i,
  /timeout/i,
  /database/i,
  /pool/i,
  /\bP\d{4}\b/, // códigos de erro do Prisma (P2002, etc.)
]

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error(`${req.method} ${req.path} - ${err.message}`, err)

  if (res.headersSent) return

  const message = err.message || 'Erro interno do servidor'
  const isInternal = INTERNAL_PATTERNS.some((re) => re.test(message))

  // Erros de regra de negócio (mensagens amigáveis) → 400 com a mensagem.
  // Erros internos/técnicos → 500 genérico (não vaza detalhes).
  if (isInternal) {
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: process.env.NODE_ENV === 'development' ? message : undefined,
    })
  } else {
    res.status(400).json({ success: false, message })
  }
}

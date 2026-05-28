import { Response, NextFunction } from 'express'
import { AuthRequest } from '../types'

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Não autenticado' })
    return
  }

  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Acesso restrito a administradores' })
    return
  }

  next()
}

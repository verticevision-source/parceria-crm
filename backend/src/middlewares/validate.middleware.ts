import { Request, Response, NextFunction } from 'express'
import { ZodSchema } from 'zod'

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        error: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      })
      return
    }
    req.body = result.data
    next()
  }
}

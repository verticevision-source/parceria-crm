import { Response } from 'express'
import { ReportService } from '../services/report.service'
import { AuthRequest } from '../types'

export class ReportController {
  static async getReports(req: AuthRequest, res: Response): Promise<void> {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365)
    const data = await ReportService.getReports(days)
    res.json({ success: true, data })
  }

  /** Leads do período, um por linha, com tempo de resposta. */
  static async getLeadsReport(req: AuthRequest, res: Response): Promise<void> {
    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
    const dia = /^\d{4}-\d{2}-\d{2}$/
    const from = dia.test(String(req.query.from)) ? String(req.query.from) : hoje
    const to = dia.test(String(req.query.to)) ? String(req.query.to) : from

    if (to < from) {
      res.status(400).json({ success: false, message: 'A data final é anterior à inicial' })
      return
    }

    const userId = typeof req.query.userId === 'string' && req.query.userId ? req.query.userId : undefined
    const data = await ReportService.getLeadsReport({ from, to, userId })
    res.json({ success: true, data })
  }
}

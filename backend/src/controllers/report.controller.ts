import { Response } from 'express'
import { ReportService } from '../services/report.service'
import { AuthRequest } from '../types'

export class ReportController {
  static async getReports(req: AuthRequest, res: Response): Promise<void> {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365)
    const data = await ReportService.getReports(days)
    res.json({ success: true, data })
  }
}

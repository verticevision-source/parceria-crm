import { Response } from 'express'
import { DashboardService } from '../services/dashboard.service'
import { AuthRequest } from '../types'

export class DashboardController {
  static async getUserDashboard(req: AuthRequest, res: Response): Promise<void> {
    const data = await DashboardService.getUserDashboard(req.user!.userId)
    res.json({ success: true, data })
  }

  static async getAdminDashboard(_req: AuthRequest, res: Response): Promise<void> {
    const data = await DashboardService.getAdminDashboard()
    res.json({ success: true, data })
  }
}

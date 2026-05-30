import { Router } from 'express'
import { ReportController } from '../controllers/report.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

// Relatórios são exclusivos do administrador
router.get('/', authMiddleware, adminMiddleware, asyncHandler(ReportController.getReports))

export default router

import { Router } from 'express'
import { DashboardController } from '../controllers/dashboard.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(authMiddleware)

router.get('/user', asyncHandler(DashboardController.getUserDashboard))
router.get('/admin', adminMiddleware, asyncHandler(DashboardController.getAdminDashboard))

export default router

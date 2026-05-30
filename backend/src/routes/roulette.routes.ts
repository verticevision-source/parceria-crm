import { Router } from 'express'
import { RouletteController } from '../controllers/roulette.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

// ── Rotas do agente (qualquer usuário autenticado) ─────────────────────────
router.patch('/toggle',    authMiddleware, asyncHandler(RouletteController.toggle))
router.get('/my-status',   authMiddleware, asyncHandler(RouletteController.myStatus))

// ── Rotas admin ────────────────────────────────────────────────────────────
router.get('/status',      authMiddleware, adminMiddleware, asyncHandler(RouletteController.status))
router.patch('/agents/:userId/weight', authMiddleware, adminMiddleware, asyncHandler(RouletteController.setWeight))
router.post('/distribute', authMiddleware, adminMiddleware, asyncHandler(RouletteController.distribute))
router.get('/logs',        authMiddleware, adminMiddleware, asyncHandler(RouletteController.logs))
router.post('/reset-daily', authMiddleware, adminMiddleware, asyncHandler(RouletteController.resetDaily))

// ── Campanhas ──────────────────────────────────────────────────────────────
router.get('/campaigns',           authMiddleware, asyncHandler(RouletteController.listCampaigns))
router.post('/campaigns',          authMiddleware, adminMiddleware, asyncHandler(RouletteController.createCampaign))
router.patch('/campaigns/:id/toggle', authMiddleware, adminMiddleware, asyncHandler(RouletteController.toggleCampaign))
router.delete('/campaigns/:id',    authMiddleware, adminMiddleware, asyncHandler(RouletteController.deleteCampaign))

export default router

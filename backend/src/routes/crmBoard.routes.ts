import { Router } from 'express'
import { CRMBoardController } from '../controllers/crmBoard.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

// Todos autenticados podem ver boards (filtrado por membro)
router.get('/',                   authMiddleware, asyncHandler(CRMBoardController.list))
router.get('/:id/kanban',         authMiddleware, asyncHandler(CRMBoardController.getKanban))
router.get('/:id/members',        authMiddleware, asyncHandler(CRMBoardController.listMembers))

// Apenas admin gerencia boards
router.post('/',                       authMiddleware, adminMiddleware, asyncHandler(CRMBoardController.create))
router.put('/:id',                     authMiddleware, adminMiddleware, asyncHandler(CRMBoardController.update))
router.delete('/:id',                  authMiddleware, adminMiddleware, asyncHandler(CRMBoardController.remove))
router.post('/:id/members',            authMiddleware, adminMiddleware, asyncHandler(CRMBoardController.addMember))
router.delete('/:id/members/:userId',  authMiddleware, adminMiddleware, asyncHandler(CRMBoardController.removeMember))
router.post('/:id/stages',             authMiddleware, adminMiddleware, asyncHandler(CRMBoardController.addStage))
router.put('/:id/stages/:stageId',     authMiddleware, adminMiddleware, asyncHandler(CRMBoardController.updateStage))
router.delete('/:id/stages/:stageId',  authMiddleware, adminMiddleware, asyncHandler(CRMBoardController.deleteStage))

export default router

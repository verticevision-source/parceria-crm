import { Router } from 'express'
import { LeadController } from '../controllers/lead.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(authMiddleware)

router.get('/', asyncHandler(LeadController.findAll))
router.post('/', asyncHandler(LeadController.create))
router.post('/from-conversation', asyncHandler(LeadController.createFromConversation))
router.get('/:id', asyncHandler(LeadController.findById))
router.put('/:id', asyncHandler(LeadController.update))
router.delete('/:id', asyncHandler(LeadController.delete))
router.patch('/:id/stage', asyncHandler(LeadController.updateStage))
router.patch('/:id/status', asyncHandler(LeadController.updateStatus))
router.get('/:id/notes', asyncHandler(LeadController.getNotes))
router.post('/:id/notes', asyncHandler(LeadController.addNote))

export default router

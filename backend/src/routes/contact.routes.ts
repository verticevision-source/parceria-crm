import { Router } from 'express'
import { ContactController } from '../controllers/contact.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(authMiddleware)

router.get('/', asyncHandler(ContactController.findAll))
router.post('/', asyncHandler(ContactController.create))
router.get('/:id', asyncHandler(ContactController.findById))
router.put('/:id', asyncHandler(ContactController.update))
router.delete('/:id', asyncHandler(ContactController.delete))

export default router

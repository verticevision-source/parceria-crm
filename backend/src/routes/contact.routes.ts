import { Router } from 'express'
import { ContactController } from '../controllers/contact.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(authMiddleware)

router.get('/', asyncHandler(ContactController.findAll))
router.post('/', asyncHandler(ContactController.create))
router.post('/import', adminMiddleware, asyncHandler(ContactController.importMany))
router.get('/:id', asyncHandler(ContactController.findById))
router.put('/:id', asyncHandler(ContactController.update))
router.delete('/:id', asyncHandler(ContactController.delete))

export default router

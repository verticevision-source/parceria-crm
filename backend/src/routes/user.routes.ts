import { Router } from 'express'
import { UserController } from '../controllers/user.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(authMiddleware, adminMiddleware)

router.get('/', asyncHandler(UserController.findAll))
router.post('/', asyncHandler(UserController.create))
router.get('/:id', asyncHandler(UserController.findById))
router.put('/:id', asyncHandler(UserController.update))
router.patch('/:id/activate', asyncHandler(UserController.activate))
router.patch('/:id/deactivate', asyncHandler(UserController.deactivate))
router.delete('/:id', asyncHandler(UserController.delete))

export default router

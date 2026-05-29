import { Router } from 'express'
import { CustomFieldController } from '../controllers/customField.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()

router.use(authMiddleware)

// Field definitions — read for all, write for admin only
router.get('/', asyncHandler(CustomFieldController.getFields))
router.post('/', adminMiddleware, asyncHandler(CustomFieldController.createField))
router.put('/:id', adminMiddleware, asyncHandler(CustomFieldController.updateField))
router.delete('/:id', adminMiddleware, asyncHandler(CustomFieldController.deleteField))

// Values — available to all authenticated users
router.get('/values/:entityId', asyncHandler(CustomFieldController.getValues))
router.put('/values/:entityId', asyncHandler(CustomFieldController.upsertValue))

export default router

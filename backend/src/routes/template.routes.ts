import { Router } from 'express'
import { TemplateController } from '../controllers/template.controller'
import { authMiddleware } from '../middlewares/auth.middleware'
import { adminMiddleware } from '../middlewares/admin.middleware'
import { asyncHandler } from '../utils/asyncHandler'

const router = Router()
router.use(authMiddleware)

// Listar e enviar: qualquer atendente autenticado
router.get('/', asyncHandler(TemplateController.list))
router.post('/send', asyncHandler(TemplateController.send))

// Criar e remover modelos: só admin
router.post('/', adminMiddleware, asyncHandler(TemplateController.create))
router.delete('/:name', adminMiddleware, asyncHandler(TemplateController.remove))

export default router

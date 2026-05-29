import { Response } from 'express'
import { prisma } from '../config/database'
import { AuthRequest } from '../types'

function parseFieldOptions(f: { options?: string | null; [key: string]: unknown }) {
  return {
    ...f,
    options: f.options ? (() => { try { return JSON.parse(f.options as string) } catch { return [] } })() : null,
  }
}

export class CustomFieldController {
  static async getFields(req: AuthRequest, res: Response): Promise<void> {
    const { entity } = req.query
    const where: Record<string, unknown> = {}
    if (entity) where.entity = entity as string

    const fields = await prisma.customField.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    })
    // Parse options JSON for SELECT fields
    const parsed = fields.map((f) => ({
      ...f,
      options: f.options ? (() => { try { return JSON.parse(f.options!) } catch { return [] } })() : null,
    }))
    res.json({ success: true, data: parsed })
  }

  static async createField(req: AuthRequest, res: Response): Promise<void> {
    const { name, fieldKey, type, entity, options, isRequired } = req.body

    if (!name || !fieldKey || !type || !entity) {
      res.status(400).json({ success: false, message: 'name, fieldKey, type e entity são obrigatórios' })
      return
    }

    if (!['TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN'].includes(type)) {
      res.status(400).json({ success: false, message: 'Tipo inválido' })
      return
    }

    if (!['CONTACT', 'LEAD'].includes(entity)) {
      res.status(400).json({ success: false, message: 'Entidade inválida' })
      return
    }

    const field = await prisma.customField.create({
      data: {
        name,
        fieldKey,
        type,
        entity,
        options: options ? JSON.stringify(options) : null,
        isRequired: Boolean(isRequired),
      },
    })
    res.status(201).json({ success: true, data: parseFieldOptions(field) })
  }

  static async updateField(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params
    const { name, options, isRequired } = req.body

    const existing = await prisma.customField.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ success: false, message: 'Campo não encontrado' })
      return
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (options !== undefined) updateData.options = JSON.stringify(options)
    if (isRequired !== undefined) updateData.isRequired = Boolean(isRequired)

    const field = await prisma.customField.update({ where: { id }, data: updateData })
    res.json({ success: true, data: parseFieldOptions(field) })
  }

  static async deleteField(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params

    const existing = await prisma.customField.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ success: false, message: 'Campo não encontrado' })
      return
    }

    await prisma.customField.delete({ where: { id } })
    res.json({ success: true, message: 'Campo removido' })
  }

  static async getValues(req: AuthRequest, res: Response): Promise<void> {
    const { entityId } = req.params
    const values = await prisma.customFieldValue.findMany({
      where: { entityId },
      include: { customField: true },
    })
    res.json({ success: true, data: values })
  }

  static async upsertValue(req: AuthRequest, res: Response): Promise<void> {
    const { entityId } = req.params
    const { customFieldId, value } = req.body

    if (!customFieldId) {
      res.status(400).json({ success: false, message: 'customFieldId é obrigatório' })
      return
    }

    const fieldExists = await prisma.customField.findUnique({ where: { id: customFieldId } })
    if (!fieldExists) {
      res.status(404).json({ success: false, message: 'Campo não encontrado' })
      return
    }

    const result = await prisma.customFieldValue.upsert({
      where: { customFieldId_entityId: { customFieldId, entityId } },
      update: { value: value !== undefined ? String(value) : null },
      create: { customFieldId, entityId, value: value !== undefined ? String(value) : null },
    })
    res.json({ success: true, data: result })
  }
}

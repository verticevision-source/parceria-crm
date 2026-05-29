import { Response } from 'express'
import { prisma } from '../config/database'
import { AuthRequest } from '../types'

export class QuickReplyController {
  static async getAll(req: AuthRequest, res: Response): Promise<void> {
    const userId = req.user!.userId
    const replies = await prisma.quickReply.findMany({
      where: {
        OR: [{ userId }, { isGlobal: true }],
      },
      orderBy: { createdAt: 'asc' },
    })
    res.json({ success: true, data: replies })
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    const userId = req.user!.userId
    const role = req.user!.role
    const { title, body, isGlobal } = req.body

    if (!title || !body) {
      res.status(400).json({ success: false, message: 'title e body são obrigatórios' })
      return
    }

    const reply = await prisma.quickReply.create({
      data: {
        userId,
        title,
        body,
        isGlobal: role === 'ADMIN' ? Boolean(isGlobal) : false,
      },
    })
    res.status(201).json({ success: true, data: reply })
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    const userId = req.user!.userId
    const role = req.user!.role
    const { id } = req.params
    const { title, body, isGlobal } = req.body

    const existing = await prisma.quickReply.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ success: false, message: 'Resposta rápida não encontrada' })
      return
    }

    if (role !== 'ADMIN' && existing.userId !== userId) {
      res.status(403).json({ success: false, message: 'Acesso negado' })
      return
    }

    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title
    if (body !== undefined) updateData.body = body
    if (isGlobal !== undefined && role === 'ADMIN') updateData.isGlobal = Boolean(isGlobal)

    const reply = await prisma.quickReply.update({ where: { id }, data: updateData })
    res.json({ success: true, data: reply })
  }

  static async remove(req: AuthRequest, res: Response): Promise<void> {
    const userId = req.user!.userId
    const role = req.user!.role
    const { id } = req.params

    const existing = await prisma.quickReply.findUnique({ where: { id } })
    if (!existing) {
      res.status(404).json({ success: false, message: 'Resposta rápida não encontrada' })
      return
    }

    if (role !== 'ADMIN' && existing.userId !== userId) {
      res.status(403).json({ success: false, message: 'Acesso negado' })
      return
    }

    await prisma.quickReply.delete({ where: { id } })
    res.json({ success: true, message: 'Resposta rápida removida' })
  }
}

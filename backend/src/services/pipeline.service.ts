import { prisma } from '../config/database'

export class PipelineService {
  static async findAll() {
    return prisma.pipelineStage.findMany({
      include: { _count: { select: { leads: true } } },
      orderBy: { order: 'asc' },
    })
  }

  static async create(data: { name: string; order: number; color?: string }) {
    return prisma.pipelineStage.create({ data })
  }

  static async update(id: string, data: { name?: string; order?: number; color?: string }) {
    return prisma.pipelineStage.update({ where: { id }, data })
  }

  static async delete(id: string) {
    const leadsCount = await prisma.lead.count({ where: { pipelineStageId: id } })
    if (leadsCount > 0) {
      throw new Error(`Não é possível excluir: ${leadsCount} lead(s) nessa etapa`)
    }
    return prisma.pipelineStage.delete({ where: { id } })
  }

  static async getKanban(userId: string, role: string) {
    const stages = await prisma.pipelineStage.findMany({ orderBy: { order: 'asc' } })
    const whereUser = role === 'ADMIN' ? {} : { responsibleUserId: userId }

    const leads = await prisma.lead.findMany({
      where: { ...whereUser, status: 'OPEN' },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        responsibleUser: { select: { id: true, name: true } },
        pipelineStage: { select: { id: true, name: true, color: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return stages.map((stage) => ({
      ...stage,
      leads: leads.filter((l) => l.pipelineStageId === stage.id),
    }))
  }
}

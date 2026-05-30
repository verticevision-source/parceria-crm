import { prisma } from '../config/database'
import { logger } from '../utils/logger'
import { Server as SocketServer } from 'socket.io'

let io: SocketServer | null = null

export function setRouletteSocketIO(socketServer: SocketServer): void {
  io = socketServer
}

export class RouletteService {

  // ── Agente: toggle ativo/inativo ─────────────────────────────────────────

  static async toggleActive(userId: string): Promise<{ isActive: boolean }> {
    // Garante que existe registro para o agente
    const existing = await prisma.rouletteAgent.findUnique({ where: { userId } })

    let agent
    if (!existing) {
      agent = await prisma.rouletteAgent.create({
        data: { userId, isActive: true, weight: 1 },
      })
    } else {
      agent = await prisma.rouletteAgent.update({
        where: { userId },
        data: { isActive: !existing.isActive },
      })
    }

    logger.info(`[Roleta] Agente ${userId} → ${agent.isActive ? 'ATIVO' : 'INATIVO'}`)

    // Emite status atualizado para todos via socket
    if (io) {
      io.emit('roulette-status-update', await RouletteService.getStatus())
    }

    return { isActive: agent.isActive }
  }

  // ── Agente: obtém próprio status ──────────────────────────────────────────

  static async getAgentStatus(userId: string) {
    const agent = await prisma.rouletteAgent.findUnique({
      where: { userId },
      include: { user: { select: { id: true, name: true, email: true } } },
    })

    if (!agent) {
      return { isActive: false, weight: 1, leadsToday: 0, leadsTotal: 0 }
    }

    return agent
  }

  // ── Admin: configura peso de um agente ───────────────────────────────────

  static async setWeight(userId: string, weight: number): Promise<void> {
    if (weight < 1 || weight > 10) throw new Error('Peso deve ser entre 1 e 10')

    await prisma.rouletteAgent.upsert({
      where: { userId },
      create: { userId, weight, isActive: false },
      update: { weight },
    })

    if (io) io.emit('roulette-status-update', await RouletteService.getStatus())
  }

  // ── Admin: lista todos os agentes na roleta ───────────────────────────────

  static async getStatus() {
    const users = await prisma.user.findMany({
      where: { role: 'USER', isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        rouletteAgent: {
          include: { teams: { include: { team: true } } },
        },
      },
      orderBy: { name: 'asc' },
    })

    return users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      isActive: u.rouletteAgent?.isActive ?? false,
      weight: u.rouletteAgent?.weight ?? 1,
      leadsToday: u.rouletteAgent?.leadsToday ?? 0,
      leadsTotal: u.rouletteAgent?.leadsTotal ?? 0,
      lastLeadAt: u.rouletteAgent?.lastLeadAt ?? null,
      teams: u.rouletteAgent?.teams.map(at => ({
        teamId: at.teamId,
        teamName: at.team.name,
        teamColor: at.team.color,
      })) ?? [],
    }))
  }

  // ── Times ─────────────────────────────────────────────────────────────────

  static async listTeams() {
    return prisma.rouletteTeam.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { agents: true, campaigns: true } },
      },
    })
  }

  static async createTeam(data: { name: string; description?: string; color?: string }) {
    return prisma.rouletteTeam.create({ data })
  }

  static async updateTeam(id: string, data: { name?: string; description?: string; color?: string; isActive?: boolean }) {
    return prisma.rouletteTeam.update({ where: { id }, data })
  }

  static async deleteTeam(id: string) {
    // Remove vínculos many-to-many e campanhas antes de deletar
    await prisma.rouletteAgentTeam.deleteMany({ where: { teamId: id } })
    await prisma.campaign.updateMany({ where: { teamId: id }, data: { teamId: null } })
    return prisma.rouletteTeam.delete({ where: { id } })
  }

  /** Atribui/remove agente de um time (many-to-many) */
  static async toggleAgentTeam(userId: string, teamId: string): Promise<{ added: boolean }> {
    // Garante que o agente existe
    const agent = await prisma.rouletteAgent.upsert({
      where: { userId },
      create: { userId, isActive: false },
      update: {},
    })

    const existing = await prisma.rouletteAgentTeam.findUnique({
      where: { agentId_teamId: { agentId: agent.id, teamId } },
    })

    if (existing) {
      await prisma.rouletteAgentTeam.delete({
        where: { agentId_teamId: { agentId: agent.id, teamId } },
      })
      if (io) io.emit('roulette-status-update', await RouletteService.getStatus())
      return { added: false }
    } else {
      await prisma.rouletteAgentTeam.create({ data: { agentId: agent.id, teamId } })
      if (io) io.emit('roulette-status-update', await RouletteService.getStatus())
      return { added: true }
    }
  }

  // ── Distribui um lead para o próximo agente ativo ─────────────────────────

  static async distribute(input: {
    contactId: string
    campaignId?: string
    source?: string
    notes?: string
    pipelineStageId?: string
  }): Promise<{ lead: any; assignedUser: any }> {

    // Se tem campanha, descobre o time dela para filtrar agentes
    let teamId: string | null = null
    if (input.campaignId) {
      const campaign = await prisma.campaign.findUnique({ where: { id: input.campaignId } })
      teamId = campaign?.teamId ?? null
    }

    // Filtra por time via many-to-many
    const whereAgents: any = { isActive: true }
    if (teamId) {
      whereAgents.teams = { some: { teamId } }
    }

    const activeAgents = await prisma.rouletteAgent.findMany({
      where: whereAgents,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [
        { lastLeadAt: 'asc' },
        { leadsToday: 'asc' },
      ],
    })

    if (activeAgents.length === 0) {
      const teamMsg = teamId ? ` no time selecionado` : ''
      throw new Error(`Nenhum agente ativo na roleta${teamMsg} no momento`)
    }

    // Aplica peso: expande lista conforme peso de cada agente
    // Ex: weight=2 → aparece 2x na lista, recebe o dobro de leads
    const weightedList: typeof activeAgents = []
    for (const agent of activeAgents) {
      for (let i = 0; i < agent.weight; i++) {
        weightedList.push(agent)
      }
    }

    // Escolhe o primeiro da lista ponderada (já está ordenada por tempo/leads)
    const chosen = weightedList[0]

    // Cria o lead no banco
    const lead = await prisma.lead.create({
      data: {
        contactId: input.contactId,
        responsibleUserId: chosen.userId,
        campaignId: input.campaignId || null,
        source: input.source || 'roulette',
        notes: input.notes || null,
        pipelineStageId: input.pipelineStageId || null,
        lastInteractionAt: new Date(),
      },
      include: {
        contact: true,
        responsibleUser: { select: { id: true, name: true, email: true } },
        campaign: true,
        pipelineStage: true,
      },
    })

    // Atualiza contadores do agente
    await prisma.rouletteAgent.update({
      where: { userId: chosen.userId },
      data: {
        leadsToday: { increment: 1 },
        leadsTotal: { increment: 1 },
        lastLeadAt: new Date(),
      },
    })

    // Se campaignId fornecido, incrementa contador de leads da campanha
    if (input.campaignId) {
      await prisma.campaign.update({
        where: { id: input.campaignId },
        data: { leadsCount: { increment: 1 } },
      }).catch(() => {}) // ignora se campanha não existir
    }

    // Registra no log
    await prisma.rouletteLog.create({
      data: {
        userId: chosen.userId,
        leadId: lead.id,
        campaignId: input.campaignId || null,
        notes: `Distribuído automaticamente pela roleta`,
      },
    })

    // Notifica o agente via Socket.IO
    if (io) {
      io.to(`user:${chosen.userId}`).emit('roulette-new-lead', {
        lead,
        message: `Novo lead recebido${lead.campaign ? ` da campanha "${lead.campaign.name}"` : ''}!`,
      })
      // Atualiza status geral da roleta para admins
      io.emit('roulette-status-update', await RouletteService.getStatus())
    }

    logger.info(`[Roleta] Lead ${lead.id} distribuído para ${chosen.user.name}`)

    return { lead, assignedUser: chosen.user }
  }

  // ── Admin: reset de contadores diários ───────────────────────────────────

  static async resetDailyCounters(): Promise<void> {
    await prisma.rouletteAgent.updateMany({
      data: { leadsToday: 0 },
    })
    logger.info('[Roleta] Contadores diários resetados')
  }

  // ── Campanhas ────────────────────────────────────────────────────────────

  static async createCampaign(data: {
    name: string
    description?: string
    source?: string
  }) {
    return prisma.campaign.create({ data })
  }

  static async listCampaigns() {
    return prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
    })
  }

  static async toggleCampaign(id: string) {
    const campaign = await prisma.campaign.findUnique({ where: { id } })
    if (!campaign) throw new Error('Campanha não encontrada')

    return prisma.campaign.update({
      where: { id },
      data: { isActive: !campaign.isActive },
    })
  }

  static async deleteCampaign(id: string) {
    return prisma.campaign.delete({ where: { id } })
  }

  // ── Histórico de distribuições ────────────────────────────────────────────

  static async getLogs(limit = 50) {
    return prisma.rouletteLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true } },
        lead: { include: { contact: true } },
        campaign: true,
      },
    })
  }
}

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

  static async createTeam(data: { name: string; description?: string; color?: string; keywords?: string; isGeneral?: boolean; offersWeekly?: boolean }) {
    // Só um grupo geral por vez
    if (data.isGeneral) {
      await prisma.rouletteTeam.updateMany({ data: { isGeneral: false } })
    }
    return prisma.rouletteTeam.create({ data })
  }

  static async updateTeam(id: string, data: { name?: string; description?: string; color?: string; isActive?: boolean; keywords?: string; isGeneral?: boolean; offersWeekly?: boolean }) {
    if (data.isGeneral === true) {
      await prisma.rouletteTeam.updateMany({ where: { id: { not: id } }, data: { isGeneral: false } })
    }
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

  // Normaliza texto para casar cidade (sem acento, minúsculo)
  private static normCity(s: string): string {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  }

  // ── Acha TODOS os grupos (times) que atendem uma cidade ───────────────────
  // Uma cidade pode estar em vários grupos (ex: Rio Preto). Retorna todos que
  // casam pelo nome/apelidos (keywords). Usado pelo robô p/ decidir se atende,
  // se oferece semanal, e p/ montar o pool de vendedores.
  static async findTeamsForCity(cityText: string) {
    const city = RouletteService.normCity(cityText)
    if (!city) return []
    const teams = await prisma.rouletteTeam.findMany({ where: { isActive: true } })
    return teams.filter((t) => {
      const terms = [t.name, ...((t.keywords || '').split(','))]
        .map((x) => RouletteService.normCity(x)).filter(Boolean)
      return terms.some((term) => city.includes(term))
    })
  }

  // ── Distribui um lead para os vendedores de uma cidade ───────────────────
  // Junta os vendedores de TODOS os grupos que atendem a cidade (pool único).
  // Se nenhum grupo casar, usa o grupo "geral". Se não houver, qualquer agente ativo.
  static async distributeToCity(input: {
    contactId: string
    cityText: string
    source?: string
    notes?: string
  }): Promise<{ lead: any; assignedUser: any }> {
    const matches = await RouletteService.findTeamsForCity(input.cityText)

    let teamIds: string[] = matches.map((t) => t.id)
    if (teamIds.length === 0) {
      const general = await prisma.rouletteTeam.findFirst({ where: { isActive: true, isGeneral: true } })
      if (general) teamIds = [general.id]
    }

    const label = matches.length ? matches.map((t) => t.name).join(', ') : 'geral'
    const notes = input.notes || `Cidade: ${input.cityText} → ${label}`
    // Distribui entre os vendedores dos grupos (mesmo que não estejam "Na Roleta")
    return RouletteService.distribute({
      contactId: input.contactId,
      source: input.source || 'robo-cidade',
      notes,
      teamIds,
      requireActive: teamIds.length === 0, // sem nenhum grupo: exige agente ativo
    })
  }

  static async distribute(input: {
    contactId: string
    campaignId?: string
    source?: string
    notes?: string
    pipelineStageId?: string
    teamId?: string
    teamIds?: string[]
    requireActive?: boolean
  }): Promise<{ lead: any; assignedUser: any }> {

    // times explícitos têm prioridade (um ou vários); senão usa o time da campanha
    let teamIds: string[] = input.teamIds ?? (input.teamId ? [input.teamId] : [])
    if (teamIds.length === 0 && input.campaignId) {
      const campaign = await prisma.campaign.findUnique({ where: { id: input.campaignId } })
      if (campaign?.teamId) teamIds = [campaign.teamId]
    }

    // Por padrão exige agente ativo; no roteamento por cidade aceitamos os
    // vendedores dos grupos mesmo fora da roleta (requireActive=false)
    const requireActive = input.requireActive !== false
    const whereAgents: any = {}
    if (requireActive) whereAgents.isActive = true
    if (teamIds.length > 0) {
      whereAgents.teams = { some: { teamId: { in: teamIds } } }
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
      const teamMsg = teamIds.length > 0 ? ` no(s) grupo(s) selecionado(s)` : ''
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

    // Reatribui o contato e suas conversas/mensagens ao agente escolhido
    // (assim o atendente passa a ver e responder a conversa no painel)
    await prisma.contact.update({ where: { id: input.contactId }, data: { userId: chosen.userId } }).catch(() => {})
    await prisma.conversation.updateMany({ where: { contactId: input.contactId }, data: { userId: chosen.userId } }).catch(() => {})
    await prisma.message.updateMany({ where: { contactId: input.contactId }, data: { userId: chosen.userId } }).catch(() => {})

    // Garante uma etapa (senão o lead some do Kanban, que agrupa por etapa)
    const firstStage = input.pipelineStageId
      ? null
      : await prisma.pipelineStage.findFirst({ where: { boardId: null }, orderBy: { order: 'asc' } })

    // Cria o lead no banco
    const lead = await prisma.lead.create({
      data: {
        contactId: input.contactId,
        responsibleUserId: chosen.userId,
        campaignId: input.campaignId || null,
        source: input.source || 'roulette',
        notes: input.notes || null,
        pipelineStageId: input.pipelineStageId || firstStage?.id || null,
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

  static async updateCampaign(id: string, data: {
    name?: string; description?: string; source?: string; teamId?: string | null
  }) {
    return prisma.campaign.update({ where: { id }, data })
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

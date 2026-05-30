import { prisma } from '../config/database'

function sinceDate(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(0, 0, 0, 0)
  return d
}

export class ReportService {
  /**
   * Relatório consolidado. `days` = janela (7, 30, 90...).
   */
  static async getReports(days = 30) {
    const since = sinceDate(days)

    const [
      leadsByStatus,
      leadsByAgentStatus,
      leadsByCampaignStatus,
      stages,
      campaigns,
      teams,
      agents,
      messagesByDirection,
      messageVolume,
      leadsTrend,
    ] = await Promise.all([
      // Total de leads por status (na janela)
      prisma.lead.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: { createdAt: { gte: since } },
      }),

      // Leads por agente + status
      prisma.lead.groupBy({
        by: ['responsibleUserId', 'status'],
        _count: { _all: true },
        where: { createdAt: { gte: since } },
      }),

      // Leads por campanha + status
      prisma.lead.groupBy({
        by: ['campaignId', 'status'],
        _count: { _all: true },
        where: { createdAt: { gte: since } },
      }),

      // Funil: leads por etapa (somente OPEN no momento)
      prisma.pipelineStage.findMany({
        select: {
          id: true, name: true, color: true, order: true, boardId: true,
          _count: { select: { leads: { where: { status: 'OPEN' } } } },
        },
        orderBy: { order: 'asc' },
      }),

      prisma.campaign.findMany({ select: { id: true, name: true, teamId: true } }),
      prisma.rouletteTeam.findMany({
        select: { id: true, name: true, color: true, _count: { select: { agents: true } } },
      }),
      prisma.user.findMany({
        where: { role: 'USER' },
        select: { id: true, name: true },
      }),

      // Mensagens por direção (na janela)
      prisma.message.groupBy({
        by: ['direction'],
        _count: { _all: true },
        where: { createdAt: { gte: since } },
      }),

      // Volume de mensagens por dia (SQL bruto p/ truncar data)
      prisma.$queryRaw<Array<{ day: Date; direction: string; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day, "direction", COUNT(*)::bigint AS count
        FROM "messages"
        WHERE "createdAt" >= ${since}
        GROUP BY 1, 2
        ORDER BY 1 ASC
      `,

      // Leads ganhos/perdidos por dia
      prisma.$queryRaw<Array<{ day: Date; status: string; count: bigint }>>`
        SELECT date_trunc('day', "updatedAt") AS day, "status", COUNT(*)::bigint AS count
        FROM "leads"
        WHERE "updatedAt" >= ${since} AND "status" IN ('WON','LOST')
        GROUP BY 1, 2
        ORDER BY 1 ASC
      `,
    ])

    // ── KPIs gerais ──────────────────────────────────────────────────────────
    const countBy = (arr: any[], key: string, val: string) =>
      arr.filter((x) => x[key] === val).reduce((s, x) => s + x._count._all, 0)

    const totalLeads = leadsByStatus.reduce((s, x) => s + x._count._all, 0)
    const wonLeads = countBy(leadsByStatus, 'status', 'WON')
    const lostLeads = countBy(leadsByStatus, 'status', 'LOST')
    const openLeads = countBy(leadsByStatus, 'status', 'OPEN')
    const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0

    const messagesIn = messagesByDirection.find((m) => m.direction === 'IN')?._count._all || 0
    const messagesOut = messagesByDirection.find((m) => m.direction === 'OUT')?._count._all || 0

    // ── Performance por vendedor ─────────────────────────────────────────────
    const agentMap = new Map(agents.map((a) => [a.id, a.name]))
    const perAgent = agents.map((a) => {
      const rows = leadsByAgentStatus.filter((r) => r.responsibleUserId === a.id)
      const total = rows.reduce((s, r) => s + r._count._all, 0)
      const won = rows.filter((r) => r.status === 'WON').reduce((s, r) => s + r._count._all, 0)
      const lost = rows.filter((r) => r.status === 'LOST').reduce((s, r) => s + r._count._all, 0)
      const open = rows.filter((r) => r.status === 'OPEN').reduce((s, r) => s + r._count._all, 0)
      return {
        userId: a.id,
        name: a.name,
        total, won, lost, open,
        conversion: total > 0 ? Math.round((won / total) * 100) : 0,
      }
    }).sort((a, b) => b.won - a.won)

    // ── Conversão por campanha ───────────────────────────────────────────────
    const campMap = new Map(campaigns.map((c) => [c.id, c.name]))
    const perCampaign = campaigns.map((c) => {
      const rows = leadsByCampaignStatus.filter((r) => r.campaignId === c.id)
      const total = rows.reduce((s, r) => s + r._count._all, 0)
      const won = rows.filter((r) => r.status === 'WON').reduce((s, r) => s + r._count._all, 0)
      return {
        campaignId: c.id,
        name: c.name,
        total, won,
        conversion: total > 0 ? Math.round((won / total) * 100) : 0,
      }
    }).filter((c) => c.total > 0).sort((a, b) => b.total - a.total)

    // Leads sem campanha
    const noCampRows = leadsByCampaignStatus.filter((r) => r.campaignId === null)
    const noCampTotal = noCampRows.reduce((s, r) => s + r._count._all, 0)
    if (noCampTotal > 0) {
      const won = noCampRows.filter((r) => r.status === 'WON').reduce((s, r) => s + r._count._all, 0)
      perCampaign.push({
        campaignId: 'none', name: 'Sem campanha',
        total: noCampTotal, won,
        conversion: noCampTotal > 0 ? Math.round((won / noCampTotal) * 100) : 0,
      })
    }

    // ── Desempenho por time ──────────────────────────────────────────────────
    // Agrega leads dos agentes de cada time (via campanha->time não é 1:1, então
    // usamos os leads dos agentes membros do time)
    const teamAgents = await prisma.rouletteAgentTeam.findMany({
      include: { agent: { select: { userId: true } } },
    })
    const perTeam = teams.map((t) => {
      const memberIds = teamAgents.filter((ta) => ta.teamId === t.id).map((ta) => ta.agent.userId)
      const rows = leadsByAgentStatus.filter((r) => memberIds.includes(r.responsibleUserId))
      const total = rows.reduce((s, r) => s + r._count._all, 0)
      const won = rows.filter((r) => r.status === 'WON').reduce((s, r) => s + r._count._all, 0)
      return {
        teamId: t.id, name: t.name, color: t.color,
        agents: t._count.agents, total, won,
        conversion: total > 0 ? Math.round((won / total) * 100) : 0,
      }
    }).sort((a, b) => b.total - a.total)

    // ── Funil ────────────────────────────────────────────────────────────────
    const funnel = stages.map((s) => ({
      name: s.name, color: s.color, count: s._count.leads,
    }))

    // ── Séries temporais ─────────────────────────────────────────────────────
    const fmtDay = (d: Date) => new Date(d).toISOString().slice(0, 10)
    // Volume de mensagens por dia
    const volMap = new Map<string, { in: number; out: number }>()
    for (const row of messageVolume) {
      const day = fmtDay(row.day)
      const cur = volMap.get(day) || { in: 0, out: 0 }
      if (row.direction === 'IN') cur.in += Number(row.count)
      else cur.out += Number(row.count)
      volMap.set(day, cur)
    }
    const messageSeries = Array.from(volMap.entries()).map(([day, v]) => ({ day, ...v }))

    // Won/Lost por dia
    const trendMap = new Map<string, { won: number; lost: number }>()
    for (const row of leadsTrend) {
      const day = fmtDay(row.day)
      const cur = trendMap.get(day) || { won: 0, lost: 0 }
      if (row.status === 'WON') cur.won += Number(row.count)
      else cur.lost += Number(row.count)
      trendMap.set(day, cur)
    }
    const leadsSeries = Array.from(trendMap.entries()).map(([day, v]) => ({ day, ...v }))

    return {
      period: { days, since: since.toISOString() },
      kpis: {
        totalLeads, wonLeads, lostLeads, openLeads, conversionRate,
        messagesIn, messagesOut,
      },
      perAgent,
      perCampaign,
      perTeam,
      funnel,
      messageSeries,
      leadsSeries,
    }
  }
}

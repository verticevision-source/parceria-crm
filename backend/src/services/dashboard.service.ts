import { prisma } from '../config/database'

export class DashboardService {
  static async getUserDashboard(userId: string) {
    const [
      totalConversations,
      openConversations,
      pendingConversations,
      closedConversations,
      totalMessages,
      unreadMessages,
      totalLeads,
      openLeads,
      wonLeads,
      recentMessages,
      mySession,
    ] = await Promise.all([
      prisma.conversation.count({ where: { userId } }),
      prisma.conversation.count({ where: { userId, status: 'OPEN' } }),
      prisma.conversation.count({ where: { userId, status: 'PENDING' } }),
      prisma.conversation.count({ where: { userId, status: 'CLOSED' } }),
      prisma.message.count({ where: { userId } }),
      prisma.conversation.aggregate({
        where: { userId },
        _sum: { unreadCount: true },
      }),
      prisma.lead.count({ where: { responsibleUserId: userId } }),
      prisma.lead.count({ where: { responsibleUserId: userId, status: 'OPEN' } }),
      prisma.lead.count({ where: { responsibleUserId: userId, status: 'WON' } }),
      prisma.message.findMany({
        where: { userId, direction: 'IN' },
        include: { contact: { select: { name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.whatsAppSession.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { status: true, phoneNumber: true },
      }),
    ])

    return {
      conversations: {
        total: totalConversations,
        open: openConversations,
        pending: pendingConversations,
        closed: closedConversations,
      },
      messages: {
        total: totalMessages,
        unread: unreadMessages._sum.unreadCount || 0,
      },
      leads: {
        total: totalLeads,
        open: openLeads,
        won: wonLeads,
      },
      recentMessages,
      whatsapp: mySession,
    }
  }

  static async getAdminDashboard() {
    const [
      totalUsers,
      activeUsers,
      connectedSessions,
      totalConversations,
      totalLeads,
      totalMessages,
      leadsPerStage,
      conversationsPerUser,
      leadsPerUser,
      wonLeads,
      lostLeads,
      conversationsToday,
      messagesToday,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.whatsAppSession.count({ where: { status: 'CONNECTED' } }),
      prisma.conversation.count(),
      prisma.lead.count(),
      prisma.message.count(),
      prisma.pipelineStage.findMany({
        include: { _count: { select: { leads: true } } },
        orderBy: { order: 'asc' },
      }),
      prisma.user.findMany({
        where: { role: 'USER', isActive: true },
        select: {
          id: true,
          name: true,
          _count: { select: { conversations: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.user.findMany({
        where: { role: 'USER', isActive: true },
        select: {
          id: true,
          name: true,
          _count: { select: { leads: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.lead.count({ where: { status: 'WON' } }),
      prisma.lead.count({ where: { status: 'LOST' } }),
      prisma.conversation.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      prisma.message.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    ])

    const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0
    const daily = await DashboardService.getDailySeries(14)

    return {
      daily,
      users: { total: totalUsers, active: activeUsers, connectedSessions },
      conversations: { total: totalConversations, today: conversationsToday },
      leads: { total: totalLeads, won: wonLeads, lost: lostLeads, conversionRate },
      messages: { total: totalMessages, today: messagesToday },
      leadsPerStage: leadsPerStage.map((s) => ({
        name: s.name,
        color: s.color,
        count: s._count.leads,
      })),
      conversationsPerUser: conversationsPerUser.map((u) => ({
        name: u.name,
        count: u._count.conversations,
      })),
      leadsPerUser: leadsPerUser.map((u) => ({
        name: u.name,
        count: u._count.leads,
      })),
    }
  }

  /**
   * Série diária dos últimos N dias (mensagens recebidas e leads criados).
   * Agrupa em SQL no fuso de Brasília — sem isso, o "dia" quebraria às 21h,
   * já que o banco guarda em UTC. Dias sem movimento entram com zero, pra o
   * gráfico não ter buracos.
   */
  private static async getDailySeries(days: number) {
    const rows = await prisma.$queryRaw<{ dia: Date; mensagens: bigint; leads: bigint }[]>`
      WITH dias AS (
        SELECT generate_series(
          (now() AT TIME ZONE 'America/Sao_Paulo')::date - (${days - 1}::int),
          (now() AT TIME ZONE 'America/Sao_Paulo')::date,
          '1 day'::interval
        )::date AS dia
      )
      SELECT d.dia,
        COALESCE(m.qtd, 0) AS mensagens,
        COALESCE(l.qtd, 0) AS leads
      FROM dias d
      LEFT JOIN (
        SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS dia, COUNT(*) AS qtd
        FROM messages WHERE direction = 'IN' GROUP BY 1
      ) m ON m.dia = d.dia
      LEFT JOIN (
        SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS dia, COUNT(*) AS qtd
        FROM leads GROUP BY 1
      ) l ON l.dia = d.dia
      ORDER BY d.dia
    `
    return rows.map((r) => ({
      dia: r.dia instanceof Date ? r.dia.toISOString().slice(0, 10) : String(r.dia).slice(0, 10),
      mensagens: Number(r.mensagens),
      leads: Number(r.leads),
    }))
  }
}

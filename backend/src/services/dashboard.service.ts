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
    ])

    return {
      users: { total: totalUsers, active: activeUsers, connectedSessions },
      conversations: { total: totalConversations },
      leads: { total: totalLeads },
      messages: { total: totalMessages },
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
}

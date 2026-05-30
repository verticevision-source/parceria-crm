import { prisma } from '../config/database'
import { logger } from '../utils/logger'

interface FlowNode {
  id: string
  type?: string
  data: { type?: string; text?: string; label?: string; [k: string]: any }
}
interface FlowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  label?: string
}

export class ChatFlowService {
  // ── CRUD (admin) ─────────────────────────────────────────────────────────────
  static async list() {
    return prisma.chatFlow.findMany({ orderBy: { updatedAt: 'desc' } })
  }
  static async get(id: string) {
    return prisma.chatFlow.findUnique({ where: { id } })
  }
  static async create(name: string) {
    // nó inicial padrão
    const startNode = { id: 'start', type: 'flowNode', position: { x: 250, y: 40 }, data: { type: 'start', label: 'Início' } }
    return prisma.chatFlow.create({ data: { name, nodes: [startNode] as any, edges: [] as any } })
  }
  static async update(id: string, data: { name?: string; isActive?: boolean; nodes?: any; edges?: any }) {
    // Se ativar este, desativa os outros (um fluxo ativo por vez)
    if (data.isActive === true) {
      await prisma.chatFlow.updateMany({ where: { id: { not: id } }, data: { isActive: false } })
    }
    return prisma.chatFlow.update({ where: { id }, data })
  }
  static async remove(id: string) {
    return prisma.chatFlow.delete({ where: { id } })
  }

  static async getActiveFlow() {
    return prisma.chatFlow.findFirst({ where: { isActive: true } })
  }

  // ── Execução ───────────────────────────────────────────────────────────────

  /** Inicia o fluxo para uma nova conversa. Retorna true se iniciou. */
  static async startForConversation(conversationId: string, contactId: string, userId: string, phone: string): Promise<boolean> {
    const flow = await ChatFlowService.getActiveFlow()
    if (!flow) return false

    const nodes = (flow.nodes as unknown as FlowNode[]) || []
    const start = nodes.find((n) => n.data?.type === 'start')
    if (!start) return false

    // Já existe sessão? não recria
    const existing = await prisma.chatFlowSession.findUnique({ where: { conversationId } })
    if (existing) return false

    const session = await prisma.chatFlowSession.create({
      data: { flowId: flow.id, conversationId, contactId, currentNodeId: start.id, status: 'running' },
    })

    await ChatFlowService.advance(session.id, userId, phone)
    return true
  }

  /** Processa uma resposta do cliente numa sessão em espera. Retorna true se o bot tratou. */
  static async handleInbound(conversationId: string, text: string, userId: string, phone: string): Promise<boolean> {
    const session = await prisma.chatFlowSession.findUnique({ where: { conversationId } })
    if (!session || session.status !== 'waiting') return false

    await prisma.chatFlowSession.update({
      where: { id: session.id },
      data: { lastReply: text, status: 'running' },
    })
    await ChatFlowService.advance(session.id, userId, phone)
    return true
  }

  /** Avança a execução a partir do nó atual até esperar resposta ou encerrar. */
  private static async advance(sessionId: string, userId: string, phone: string): Promise<void> {
    const { WhatsAppService } = await import('./whatsapp.service')

    let session = await prisma.chatFlowSession.findUnique({ where: { id: sessionId } })
    if (!session) return
    const flow = await prisma.chatFlow.findUnique({ where: { id: session.flowId } })
    if (!flow) return

    const nodes = (flow.nodes as unknown as FlowNode[]) || []
    const edges = (flow.edges as unknown as FlowEdge[]) || []
    const nodeById = (id: string) => nodes.find((n) => n.id === id)
    const outEdges = (id: string) => edges.filter((e) => e.source === id)

    let currentId: string | null = session.currentNodeId
    let guard = 0

    while (currentId && guard++ < 50) {
      const node = nodeById(currentId)
      if (!node) break
      const t = node.data?.type || 'message'

      if (t === 'start') {
        const next = outEdges(currentId)[0]
        currentId = next?.target || null
        continue
      }

      if (t === 'message') {
        if (node.data.text) await WhatsAppService.sendMessage(userId, phone, node.data.text).catch(() => {})
        const next = outEdges(currentId)[0]
        currentId = next?.target || null
        continue
      }

      if (t === 'question') {
        if (node.data.text) await WhatsAppService.sendMessage(userId, phone, node.data.text).catch(() => {})
        // pausa aguardando resposta
        await prisma.chatFlowSession.update({
          where: { id: sessionId },
          data: { status: 'waiting', currentNodeId: currentId, waitingSince: new Date() },
        })
        return
      }

      if (t === 'condition') {
        const reply = (session.lastReply || '').toLowerCase()
        const outs = outEdges(currentId)
        // tenta casar pela label/keyword da aresta
        let chosen = outs.find((e) => e.label && reply.includes(e.label.toLowerCase()))
        if (!chosen) chosen = outs.find((e) => (e.label || '').toLowerCase() === 'default' || (e.sourceHandle === 'else'))
        if (!chosen) chosen = outs[0]
        currentId = chosen?.target || null
        continue
      }

      if (t === 'handoff') {
        if (node.data.text) await WhatsAppService.sendMessage(userId, phone, node.data.text).catch(() => {})
        await prisma.chatFlowSession.update({ where: { id: sessionId }, data: { status: 'done', currentNodeId: currentId } })
        // Encaminha para a roleta
        try {
          const { RouletteService } = await import('./roulette.service')
          await RouletteService.distribute({ contactId: session.contactId, source: 'chatbot', notes: 'Qualificado pelo robô' })
        } catch (e: any) {
          logger.warn(`[Flow] Handoff sem agente ativo: ${e.message}`)
        }
        return
      }

      // tipo desconhecido — segue
      const next = outEdges(currentId)[0]
      currentId = next?.target || null
    }

    // Fim do fluxo sem handoff
    await prisma.chatFlowSession.update({ where: { id: sessionId }, data: { status: 'done', currentNodeId: null } })
  }

  /** Verifica timeouts: sessões aguardando há muito tempo recebem handoff. */
  static async processTimeouts(timeoutMinutes = 30): Promise<void> {
    const cutoff = new Date(Date.now() - timeoutMinutes * 60_000)
    const stale = await prisma.chatFlowSession.findMany({
      where: { status: 'waiting', waitingSince: { lt: cutoff } },
      take: 20,
    })
    for (const s of stale) {
      await prisma.chatFlowSession.update({ where: { id: s.id }, data: { status: 'done' } })
      try {
        const { RouletteService } = await import('./roulette.service')
        await RouletteService.distribute({ contactId: s.contactId, source: 'chatbot-timeout', notes: 'Cliente não respondeu ao robô' })
        logger.info(`[Flow] Timeout: ${s.conversationId} encaminhado à roleta`)
      } catch { /* sem agente ativo */ }
    }
  }
}

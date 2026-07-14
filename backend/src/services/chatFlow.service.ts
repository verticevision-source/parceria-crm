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

    const flow = await prisma.chatFlow.findUnique({ where: { id: session.flowId } })
    const nodes = (flow?.nodes as unknown as FlowNode[]) || []
    const edges = (flow?.edges as unknown as FlowEdge[]) || []
    const waitingNode = nodes.find((n) => n.id === session.currentNodeId)

    // Captura a resposta na variável do nó (ex: saveAs='city'), se houver
    const vars: Record<string, any> = { ...((session.vars as any) || {}) }
    if (waitingNode?.data?.saveAs) vars[waitingNode.data.saveAs] = text

    // Avança para o PRÓXIMO nó após a pergunta (não re-pergunta o mesmo nó)
    const nextTarget = edges.find((e) => e.source === session.currentNodeId)?.target || null

    await prisma.chatFlowSession.update({
      where: { id: session.id },
      data: { lastReply: text, vars, status: 'running', currentNodeId: nextTarget },
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
        const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        const reply = norm(session.lastReply || '')
        const outs = outEdges(currentId)
        // tenta casar pela label/keyword da aresta (ignora acentos)
        let chosen = outs.find((e) => e.label && e.label.trim() !== '' && reply.includes(norm(e.label)))
        if (!chosen) chosen = outs.find((e) => (e.label || '').toLowerCase() === 'default' || (e.sourceHandle === 'else'))
        if (!chosen) chosen = outs[0]
        currentId = chosen?.target || null
        continue
      }

      if (t === 'handoff') {
        if (node.data.text) await WhatsAppService.sendMessage(userId, phone, node.data.text).catch(() => {})
        await prisma.chatFlowSession.update({ where: { id: sessionId }, data: { status: 'done', currentNodeId: currentId } })
        // Encaminha para a roleta (time específico se node.data.teamId)
        try {
          const { RouletteService } = await import('./roulette.service')
          await RouletteService.distribute({
            contactId: session.contactId,
            source: 'chatbot',
            notes: 'Qualificado pelo robô',
            teamId: node.data.teamId || undefined,
            requireActive: node.data.teamId ? false : undefined,
          })
        } catch (e: any) {
          logger.warn(`[Flow] Handoff sem agente ativo: ${e.message}`)
        }
        return
      }

      // Encaminha para a roleta da CIDADE (casa a última resposta com um time)
      if (t === 'cityHandoff') {
        if (node.data.text) await WhatsAppService.sendMessage(userId, phone, node.data.text).catch(() => {})
        await prisma.chatFlowSession.update({ where: { id: sessionId }, data: { status: 'done', currentNodeId: currentId } })
        try {
          const { RouletteService } = await import('./roulette.service')
          await RouletteService.distributeToCity({
            contactId: session.contactId,
            cityText: session.lastReply || '',
            source: 'robo-cidade',
          })
        } catch (e: any) {
          logger.warn(`[Flow] cityHandoff sem agente: ${e.message}`)
        }
        return
      }

      // ── Pergunta a modalidade (dia/semana) adaptando ao grupo da cidade ──
      if (t === 'modalityQuestion') {
        const { RouletteService } = await import('./roulette.service')
        const city = (session.vars as any)?.city || ''
        const teams = await RouletteService.findTeamsForCity(city)
        // oferece semanal se a cidade não casa nenhum grupo (padrão) ou se algum
        // grupo que a atende oferece semanal. Só-diário quando TODOS são diário.
        const weeklyOffered = teams.length === 0 ? true : teams.some((t) => t.offersWeekly !== false)

        const d = node.data
        const optDaily = d.optDaily || 'POR DIA'
        const optWeekly = d.optWeekly || 'POR SEMANA'
        const optNone = d.optNone || 'Não tenho interesse'
        const warn = d.warnText || '⚠️ IMPORTANTE: não trabalhamos com empréstimo MENSAL (por mês).'
        const head = d.text || 'Como você prefere pagar o empréstimo?'
        const text = weeklyOffered
          ? `${head}\n\n1️⃣ ${optDaily}\n2️⃣ ${optWeekly}\n3️⃣ ${optNone}\n\n${warn}\n\nResponda com 1, 2 ou 3.`
          : `${head}\n\n1️⃣ ${optDaily}\n2️⃣ ${optNone}\n\n${warn}\n\nResponda com 1 ou 2.`

        await WhatsAppService.sendMessage(userId, phone, text).catch(() => {})
        const vars = { ...((session.vars as any) || {}), weeklyOffered }
        await prisma.chatFlowSession.update({
          where: { id: sessionId },
          data: { status: 'waiting', currentNodeId: currentId, waitingSince: new Date(), vars },
        })
        return
      }

      // ── Roteia conforme cidade + modalidade (nota interna, msg, Kanban) ──
      if (t === 'cityRoute') {
        await prisma.chatFlowSession.update({ where: { id: sessionId }, data: { status: 'done', currentNodeId: currentId } })
        await ChatFlowService.runCityRoute(node, session, userId, phone)
        return
      }

      // tipo desconhecido — segue
      const next = outEdges(currentId)[0]
      currentId = next?.target || null
    }

    // Fim do fluxo sem handoff
    await prisma.chatFlowSession.update({ where: { id: sessionId }, data: { status: 'done', currentNodeId: null } })
  }

  // ── Lógica do nó cityRoute: interpreta modalidade + cidade e roteia ──────────
  private static async runCityRoute(node: FlowNode, session: any, userId: string, phone: string): Promise<void> {
    const { WhatsAppService } = await import('./whatsapp.service')
    const { RouletteService } = await import('./roulette.service')
    const vars = (session.vars as any) || {}
    const city: string = vars.city || ''
    const weeklyOffered = vars.weeklyOffered !== false
    const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    const m = norm(session.lastReply || vars.modality || '')

    // Interpreta a escolha (numeração muda se não oferece semanal)
    let choice: 'dia' | 'semana' | 'nao'
    if (m === '1' || m.includes('dia')) choice = 'dia'
    else if (weeklyOffered && (m === '2' || m.includes('semana'))) choice = 'semana'
    else if (!weeklyOffered && m === '2') choice = 'nao'
    else if (weeklyOffered && m === '3') choice = 'nao'
    else choice = 'nao' // não reconhecido → trata como sem interesse

    const d = node.data
    const modalityLabel = choice === 'dia' ? 'POR DIA' : choice === 'semana' ? 'POR SEMANA' : '-'
    const teams = await RouletteService.findTeamsForCity(city)
    const served = teams.length > 0

    // Não interessado (qualquer cidade) → agradece + Kanban "Não interessados"
    if (choice === 'nao') {
      const msg = d.msgNotInterested || 'Sem problemas! 😊 Agradecemos o contato. Se mudar de ideia, é só chamar aqui. 👋'
      await WhatsAppService.sendMessage(userId, phone, msg).catch(() => {})
      const stageId = await ChatFlowService.ensureStage('Não interessados', '#94a3b8')
      await ChatFlowService.leadToStage(session.contactId, userId, stageId, 'robo-nao-interesse', `Robô: não tem interesse. Cidade informada: ${city || '-'}`)
      return
    }

    // Interessado + cidade atendida → roteia p/ pool + nota interna + msg cliente
    if (served) {
      const custMsg = d.msgServed || 'Ótimo! ✅ Já vou te encaminhar pra um consultor, que já vai te atender. Aguarde um instante. 🙌'
      await WhatsAppService.sendMessage(userId, phone, custMsg).catch(() => {})
      try {
        const result = await RouletteService.distributeToCity({
          contactId: session.contactId,
          cityText: city,
          source: 'robo-qualificado',
          notes: `🤖 Robô — Cidade: ${city} | Modalidade: ${modalityLabel}`,
        })
        if (result?.lead?.id) {
          await prisma.cRMNote.create({
            data: { leadId: result.lead.id, userId, content: `🤖 Lead qualificado pelo robô\nCidade: ${city}\nModalidade: ${modalityLabel}` },
          }).catch(() => {})
        }
      } catch (e: any) {
        logger.warn(`[Flow] cityRoute sem agente disponível: ${e.message}`)
      }
      return
    }

    // Interessado + cidade NÃO atendida → msg fora de área + Kanban "Fora de área"
    const oat = d.msgOutOfArea || 'Obrigado pelo interesse! 🙏 No momento ainda não atendemos a sua região, mas estamos expandindo e em breve devemos chegar aí. Vou guardar seu contato pra te avisar. 💚'
    await WhatsAppService.sendMessage(userId, phone, oat).catch(() => {})
    const stageId = await ChatFlowService.ensureStage('Fora de área', '#f59e0b')
    await ChatFlowService.leadToStage(session.contactId, userId, stageId, 'robo-fora-area', `Robô: fora de área. Cidade: ${city} | ${modalityLabel}`)
  }

  /** Garante uma etapa global do Kanban pelo nome (cria se não existir). */
  private static async ensureStage(name: string, color: string): Promise<string> {
    const existing = await prisma.pipelineStage.findFirst({ where: { boardId: null, name } })
    if (existing) return existing.id
    const agg = await prisma.pipelineStage.aggregate({ where: { boardId: null }, _max: { order: true } })
    const stage = await prisma.pipelineStage.create({ data: { name, color, order: (agg._max.order ?? 0) + 1 } })
    return stage.id
  }

  /** Coloca o lead do contato numa etapa (atualiza o aberto ou cria). */
  private static async leadToStage(contactId: string, ownerUserId: string, stageId: string, source: string, notes: string): Promise<void> {
    const existing = await prisma.lead.findFirst({ where: { contactId, status: 'OPEN' }, orderBy: { createdAt: 'desc' } })
    if (existing) {
      await prisma.lead.update({ where: { id: existing.id }, data: { pipelineStageId: stageId, notes, lastInteractionAt: new Date() } })
    } else {
      await prisma.lead.create({
        data: { contactId, responsibleUserId: ownerUserId, pipelineStageId: stageId, source, notes, status: 'OPEN', lastInteractionAt: new Date() },
      })
    }
  }

  /** Gera o fluxo padrão de qualificação por cidade (pré-montado, editável). */
  static async createQualificationFlow() {
    const nodes = [
      { id: 'start', type: 'flowNode', position: { x: 300, y: 20 }, data: { type: 'start', label: 'Início' } },
      { id: 'q_city', type: 'flowNode', position: { x: 300, y: 150 }, data: { type: 'question', saveAs: 'city', text: 'Olá! 😊 Pra te encaminhar pro consultor certo, me diz: de qual cidade você é?' } },
      { id: 'q_mod', type: 'flowNode', position: { x: 300, y: 290 }, data: { type: 'modalityQuestion', saveAs: 'modality', text: 'Como você prefere pagar o empréstimo?', optDaily: 'POR DIA', optWeekly: 'POR SEMANA', optNone: 'Não tenho interesse', warnText: '⚠️ IMPORTANTE: não trabalhamos com empréstimo MENSAL (por mês).' } },
      { id: 'route', type: 'flowNode', position: { x: 300, y: 430 }, data: { type: 'cityRoute',
          msgServed: 'Ótimo! ✅ Já vou te encaminhar pra um consultor, que já vai te atender. Aguarde um instante. 🙌',
          msgOutOfArea: 'Obrigado pelo interesse! 🙏 No momento ainda não atendemos a sua região, mas estamos expandindo e em breve devemos chegar aí. Vou guardar seu contato pra te avisar. 💚',
          msgNotInterested: 'Sem problemas! 😊 Agradecemos o contato. Se mudar de ideia, é só chamar aqui. 👋' } },
    ]
    const edges = [
      { id: 'e1', source: 'start', target: 'q_city' },
      { id: 'e2', source: 'q_city', target: 'q_mod' },
      { id: 'e3', source: 'q_mod', target: 'route' },
    ]
    return prisma.chatFlow.create({ data: { name: 'Qualificação por Cidade (robô)', nodes: nodes as any, edges: edges as any, isActive: false } })
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

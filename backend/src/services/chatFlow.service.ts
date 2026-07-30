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

const brl = (v: number) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const dataBR = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('pt-BR') } catch { return iso }
}

export class ChatFlowService {
  /**
   * Extrato curto da dívida, para o cliente ler no WhatsApp.
   *
   * Mostra as VENCIDAS separadas e no máximo 5 a vencer: despejar 60 parcelas
   * num WhatsApp não é informação, é ruído — e o que o cliente quer saber é
   * quanto deve e quando vence a próxima.
   */
  static textoDivida(emprestimos: any[]): string {
    const linhas: string[] = []
    let total = 0
    let juros = 0

    for (const e of emprestimos) {
      total += Number(e.saldoDevedor || 0)
      const parcelas = (e.parcelas || []).filter((p: any) => p.status !== 'PAID')
      const vencidas = parcelas.filter((p: any) => p.diasAtraso > 0)
      const aVencer = parcelas.filter((p: any) => p.diasAtraso <= 0)
      juros += parcelas.reduce((soma: number, p: any) => soma + Number(p.juros || 0), 0)

      if (vencidas.length) {
        linhas.push(`*Em atraso (${vencidas.length}):*`)
        vencidas.slice(0, 5).forEach((p: any) =>
          linhas.push(`• Parcela ${p.numero} — ${brl(p.valor)} — venceu ${dataBR(p.vencimento)} (${p.diasAtraso} dias)`)
        )
        if (vencidas.length > 5) linhas.push(`• ...e mais ${vencidas.length - 5} em atraso`)
      }
      if (aVencer.length) {
        linhas.push(`*A vencer:*`)
        aVencer.slice(0, 5).forEach((p: any) =>
          linhas.push(`• Parcela ${p.numero} — ${brl(p.valor)} — vence ${dataBR(p.vencimento)}`)
        )
        if (aVencer.length > 5) linhas.push(`• ...e mais ${aVencer.length - 5} a vencer`)
      }
    }

    return [
      `*Saldo devedor total: ${brl(total)}*`,
      juros > 0.004 ? `Juros por atraso já lançados: ${brl(juros)}` : null,
      '',
      ...linhas,
      '',
      'Qualquer divergência me avise que eu confiro com a equipe.',
    ].filter((l) => l !== null).join('\n')
  }

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
  /**
   * O fluxo ativo pode INICIAR neste número?
   * - Amarrado a número(s) (whatsappSessionId): só roda neles. Aceita VÁRIOS
   *   separados por vírgula — um anúncio apontado pro número errado por engano
   *   fazia o cliente cair direto num vendedor, pulando a qualificação inteira
   *   (sem cidade, sem roleta: Brasília foi parar em quem só atende Piracicaba).
   *   Listar os números que recebem anúncio faz o robô qualificar em todos.
   * - Sem amarração, mantém o comportamento antigo: só em números de ADMIN.
   */
  static async canStartOnSession(sessionId: string, ownerUserId: string): Promise<boolean> {
    return Boolean(await ChatFlowService.flowForSession(sessionId, ownerUserId))
  }

  /**
   * O robô DESTE número. Antes existia um robô ativo só no sistema inteiro
   * (`getActiveFlow`), então ativar o robô de uma carteira DESLIGAVA o de
   * qualificação — o que sustenta as vendas.
   *
   * Ordem: robô amarrado a este número → robô sem amarração (legado, só em
   * número de ADMIN). Sem nada, null.
   */
  static async flowForSession(sessionId: string, ownerUserId?: string) {
    const ativos = await prisma.chatFlow.findMany({ where: { isActive: true } })

    const numerosDe = (f: any) =>
      String(f.whatsappSessionId || '').split(',').map((x: string) => x.trim()).filter(Boolean)

    const amarrado = ativos.find((f) => numerosDe(f).includes(sessionId))
    if (amarrado) return amarrado

    const semAmarra = ativos.find((f) => numerosDe(f).length === 0)
    if (semAmarra && ownerUserId) {
      const owner = await prisma.user.findUnique({ where: { id: ownerUserId }, select: { role: true } })
      if (owner?.role === 'ADMIN') return semAmarra
    }
    return null
  }

  static async update(id: string, data: { name?: string; isActive?: boolean; nodes?: any; edges?: any; whatsappSessionId?: string | null; timeoutMinutes?: number | null; timeoutAction?: string | null }) {
    // Ativar desativa APENAS quem disputa o mesmo número — não todos. Antes era
    // "um robô ativo por sistema": ligar o robô de uma carteira derrubava o de
    // qualificação e a empresa parava de qualificar lead sem ninguém notar.
    if (data.isActive === true) {
      const atual = await prisma.chatFlow.findUnique({ where: { id }, select: { whatsappSessionId: true } })
      const numeros = String(data.whatsappSessionId ?? atual?.whatsappSessionId ?? '')
        .split(',').map((x) => x.trim()).filter(Boolean)

      const outros = await prisma.chatFlow.findMany({
        where: { id: { not: id }, isActive: true },
        select: { id: true, whatsappSessionId: true },
      })
      const conflitantes = outros.filter((o) => {
        const dele = String(o.whatsappSessionId || '').split(',').map((x) => x.trim()).filter(Boolean)
        // Sem amarração dos dois lados = ambos disputam "qualquer número de
        // ADMIN", então continuam se excluindo.
        if (numeros.length === 0 && dele.length === 0) return true
        return dele.some((n) => numeros.includes(n))
      })
      if (conflitantes.length > 0) {
        await prisma.chatFlow.updateMany({
          where: { id: { in: conflitantes.map((c) => c.id) } },
          data: { isActive: false },
        })
        logger.warn(`[Flow] Ativando "${id}": desativados ${conflitantes.length} robô(s) do mesmo número`)
      }
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
  static async startForConversation(conversationId: string, contactId: string, userId: string, phone: string, sessionId?: string): Promise<boolean> {
    // Com sessionId, pega o robô DAQUELE número. Sem (reinício manual pelo
    // painel), mantém o comportamento antigo.
    const flow = sessionId
      ? await ChatFlowService.flowForSession(sessionId, userId)
      : await ChatFlowService.getActiveFlow()
    if (!flow) return false

    // Não inicia se o número que vai atender não está conectado: o fluxo ficaria
    // "mudo" (perguntas que nunca saem) e o cliente sumiria sem atendimento.
    //
    // Confere a SESSÃO, não o dono da conversa. Antes checava o dono, e um
    // contato antigo no nome de um vendedor inativo travava o robô: o cliente
    // escrevia no número do Roberto e nada acontecia, sem erro visível.
    const canSend = sessionId
      ? await prisma.whatsAppSession.findFirst({ where: { id: sessionId, status: 'CONNECTED' }, select: { id: true } })
      : await prisma.whatsAppSession.findFirst({ where: { userId, status: 'CONNECTED' }, select: { id: true } })
    if (!canSend) {
      logger.warn(`[Flow] Não iniciado p/ ${phone}: número de atendimento sem conexão`)
      return false
    }

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

  /**
   * Envia pelo NÚMERO que está atendendo a conversa — nunca pelo "dono" dela.
   *
   * O dono da conversa e o dono do número são coisas diferentes: a roleta
   * reatribui o responsável sem mexer no número, e um contato antigo pode estar
   * no nome de outro vendedor. Enviando por usuário, o robô do Roberto tentou
   * responder pelo número do Vitor (inativo, desconectado) e ficou MUDO — e, se
   * o Vitor estivesse conectado, o cliente receberia o menu de um número
   * aleatório da equipe. Mesmo erro que a IA já teve.
   */
  private static async enviarNaConversa(conversationId: string, userIdFallback: string, phone: string, texto: string): Promise<void> {
    const { WhatsAppService } = await import('./whatsapp.service')
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { whatsappSessionId: true },
    })
    try {
      if (conv?.whatsappSessionId) {
        await WhatsAppService.sendFromSession(conv.whatsappSessionId, phone, texto)
        return
      }
      await WhatsAppService.sendMessage(userIdFallback, phone, texto)
    } catch (e: any) {
      logger.warn(`[Flow] Falha ao enviar p/ ${phone}: ${e?.message}`)
    }
  }

  /** Avança a execução a partir do nó atual até esperar resposta ou encerrar. */
  private static async advance(sessionId: string, userId: string, phone: string): Promise<void> {
    const { WhatsAppService } = await import('./whatsapp.service')

    let session = await prisma.chatFlowSession.findUnique({ where: { id: sessionId } })
    if (!session) return
    const convId = session.conversationId
    const enviar = (texto: string) => ChatFlowService.enviarNaConversa(convId, userId, phone, texto)
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
        if (node.data.text) await enviar(node.data.text)

        // Avisa o DONO do número (ex.: a gerente da carteira) que tem algo
        // esperando ação. Sem isso o cliente manda vídeo de renovação, ou pede
        // pra falar com o gerente, e ninguém fica sabendo — o robô responde
        // "vamos te chamar" e a promessa morre ali.
        if (node.data.notificarDono) {
          const nome = node.data.notificarTexto || 'O robô registrou um pedido do cliente.'
          await WhatsAppService.notifySeller(userId, `${nome}
Cliente: ${phone}`)
            .catch((e: any) => logger.warn('[Flow] Falha ao avisar o dono: ' + e?.message))
        }

        const next = outEdges(currentId)[0]
        currentId = next?.target || null
        continue
      }

      if (t === 'question') {
        if (node.data.text) await enviar(node.data.text)
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

      // ── Consulta ao Parceria Financeiro ─────────────────────────────────────
      // Único nó que busca dado de fora. Existe porque "qual o valor total da
      // minha dívida" não se responde com texto fixo — e mandar valor errado
      // numa cobrança é pior que não responder.
      //
      // NUNCA interrompe o fluxo: se o cliente não está na carteira ou o
      // financeiro está fora, manda o texto de reserva e segue. O cliente não
      // pode ficar num robô travado esperando um dado que não vem.
      if (t === 'consulta') {
        let texto = node.data.textFallback
          || 'Não consegui consultar seus dados agora. Já avisei o gerente da sua conta, ele te chama por aqui.'
        try {
          const { FinanceiroService } = await import('./financeiro.service')
          const ficha = await FinanceiroService.fichaCliente(userId, { phone })
          const emprestimos = (ficha?.emprestimos || []).filter((e: any) => e.status === 'ACTIVE')

          if (emprestimos.length === 0) {
            texto = node.data.textSemDivida || 'Pelo nosso sistema você não tem empréstimo em aberto. 😊'
          } else if (node.data.consulta === 'saldo') {
            // Aviso da renovação: só o essencial, sem despejar o extrato todo.
            const saldo = emprestimos.reduce((soma: number, e: any) => soma + Number(e.saldoDevedor || 0), 0)
            texto = saldo > 0.004
              ? `Pelo nosso sistema ainda constam ${brl(saldo)} em aberto. A renovação exige o empréstimo quitado.`
              : 'Pelo nosso sistema seu empréstimo está quitado. ✅'
          } else {
            texto = ChatFlowService.textoDivida(emprestimos)
          }
        } catch (e: any) {
          const msg = String(e?.message || '')
          // "Não é cliente desta carteira" NÃO é falha de sistema. A mensagem
          // de reserva dizia "não consegui consultar, já avisei o gerente" —
          // mentia duas vezes: não houve erro, e ninguém foi avisado. Quem
          // recebeu isso ficou esperando um contato que nunca viria.
          if (/não encontrado|nao encontrado/i.test(msg)) {
            texto = node.data.textNaoCliente
              || 'Não encontrei seu cadastro nesta carteira. Se você tem empréstimo com a gente, me chama que eu verifico com a equipe.'
          }
          logger.warn(`[Flow] Consulta ao financeiro falhou (${phone}): ${msg}`)
        }
        await enviar(texto)
        const next = outEdges(currentId)[0]
        currentId = next?.target || null
        continue
      }

      if (t === 'handoff') {
        if (node.data.text) await enviar(node.data.text)
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
        if (node.data.text) await enviar(node.data.text)
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

        await enviar(text)
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
    // Mesmo envio por NÚMERO do advance: o dono da conversa pode não ser o dono
    // do número (a roleta reatribui o responsável sem mexer no número).
    const enviar = (texto: string) =>
      ChatFlowService.enviarNaConversa(session.conversationId, userId, phone, texto)
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
    // versão amigável p/ o cliente (evita o "POR DIA" gritado/robótico)
    const modalityFriendly = choice === 'dia' ? 'no plano diário' : choice === 'semana' ? 'no plano semanal' : ''
    const teams = await RouletteService.findTeamsForCity(city)
    const served = teams.length > 0
    // Nome LIMPO da cidade (a keyword que casou), não a resposta crua do cliente
    const cityDisplay = (await RouletteService.matchedCityName(city)) || city.replace(/\s+/g, ' ').trim()

    // Não interessado (qualquer cidade) → agradece + Kanban "Não interessados"
    if (choice === 'nao') {
      const msg = d.msgNotInterested || 'Sem problemas! 😊 Agradecemos o contato. Se mudar de ideia, é só chamar aqui. 👋'
      await enviar(msg)
      const stageId = await ChatFlowService.ensureStage('Não interessados', '#94a3b8')
      await ChatFlowService.leadToStage(session.contactId, userId, stageId, 'robo-nao-interesse', `Robô: não tem interesse. Cidade informada: ${city || '-'}`)
      return
    }

    // Interessado + cidade atendida → distribui PRIMEIRO (pra saber quem pegou),
    // depois avisa o cliente que esse vendedor vai chamar (de outro número).
    if (served) {
      let vendorName: string | null = null
      let vendorUserId: string | null = null
      let vendorEmail: string | null = null
      let leadId: string | null = null
      // true = o lead foi atribuído mas NENHUM vendedor do grupo tem número
      // online agora → ninguém consegue "puxar a conversa". Segura a promessa.
      let noneOnline = false
      try {
        const result = await RouletteService.distributeToCity({
          contactId: session.contactId,
          cityText: city,
          source: 'robo-qualificado',
          notes: `🤖 Robô — Cidade: ${cityDisplay} | Modalidade: ${modalityLabel}`,
        })
        vendorName = result?.assignedUser?.name || null
        vendorUserId = result?.assignedUser?.id || null
        vendorEmail = result?.assignedUser?.email || null
        leadId = result?.lead?.id || null
        noneOnline = result?.noneOnline === true
      } catch (e: any) {
        logger.warn(`[Flow] cityRoute sem agente disponível: ${e.message}`)
        // Sem NENHUM agente no grupo: alerta o admin (não some em silêncio).
        await WhatsAppService.notifyAdmin(
          `⚠️ Lead qualificado SEM vendedor disponível\nCidade: ${cityDisplay} | ${modalityLabel}\nCliente: ${phone}\nNão há agente ativo no grupo — atenda manualmente.`,
        ).catch(() => {})
      }

      // ── Grupo inteiro offline: NÃO prometer contato imediato ────────────────
      // O lead ficou atribuído (aparece no Kanban), mas a 1ª mensagem pelo número
      // do vendedor falharia. Manda um aviso de "em breve", move pra um estágio de
      // espera e alerta o admin, em vez de prometer "vai te chamar agora" e furar.
      if (noneOnline) {
        const holdMsg = d.msgQueued
          || 'Recebido! ✅ Um consultor da sua região vai te chamar aqui no WhatsApp em breve. Obrigado pela paciência! 🙌'
        await enviar(holdMsg)

        if (leadId) {
          const stageId = await ChatFlowService.ensureStage('Aguardando atendimento', '#eab308')
          await prisma.lead.update({ where: { id: leadId }, data: { pipelineStageId: stageId } }).catch(() => {})
          await prisma.cRMNote.create({
            data: { leadId, userId, content: `🤖 Lead qualificado — SEM vendedor online no grupo\nCidade: ${cityDisplay}\nModalidade: ${modalityLabel}\n⚠️ Atribuído a ${vendorName || 'vendedor'}, mas o número dele está offline. Reconectar/atender manual.` },
          }).catch(() => {})
        }

        await WhatsAppService.notifyAdmin(
          `⚠️ Lead qualificado, mas SEM número online no grupo\nCidade: ${cityDisplay} | ${modalityLabel}\nCliente: ${phone}\nAtribuído a: ${vendorName || '—'} (offline)\nReconecte o número ou atenda pelo painel.`,
        ).catch(() => {})
        return
      }

      // ── Atendente de IA ─────────────────────────────────────────────────────
      // Se a roleta caiu no usuário-IA, marca a conversa pra IA assumir. O resto
      // do fluxo segue igual (avisa o cliente + 1ª msg pelo número da IA); a
      // partir da resposta do cliente, a IA conduz o atendimento sozinha.
      if (vendorUserId) {
        const { AIBotService } = await import('./aiBot.service')
        if (await AIBotService.isBotUser(vendorUserId)) {
          // Marca as conversas da IA para ESTE TELEFONE — não por contactId.
          // Contato é por usuário: o contactId daqui é o do número da FRENTE, e
          // a conversa que nasce no número da IA usa outro contato. Filtrar por
          // contactId ligava a IA só na conversa da frente e deixava a dela
          // desligada — o cliente ficava esperando uma resposta que não vinha.
          // Também limpa uma pausa antiga, senão a conversa reaproveitada de um
          // atendimento anterior nasceria muda.
          await prisma.conversation.updateMany({
            where: { userId: vendorUserId, contact: { phone } },
            data: { aiAuto: true, aiPaused: false },
          }).catch(() => {})
          if (leadId) {
            await prisma.cRMNote.create({
              data: { leadId, userId, content: `🤖 Lead qualificado — atendimento automático pela IA (${vendorName || 'IA'})\nCidade: ${cityDisplay}\nModalidade: ${modalityLabel}` },
            }).catch(() => {})
          }
          logger.info(`[IA-bot] Conversa do contato ${session.contactId} marcada p/ atendimento da IA`)
        }
      }

      // ── Vendedor de "chip frágil" (aborda pelo CELULAR) ─────────────────────
      // Alguns chips têm restrição de dispositivo vinculado: a 1ª msg fria pela
      // API não entrega (fica PENDING), mas o que o vendedor digita no celular
      // entrega 100%. Pra esses (marcados na Central de Vendedores), NÃO fazemos
      // a abordagem fria; o robô avisa o CLIENTE que vão chamar e manda o contato
      // do lead pro WhatsApp do VENDEDOR (pela frente, que entrega), pra ele
      // chamar pelo celular.
      if (vendorUserId && await ChatFlowService.isManualOutreach(vendorUserId, vendorEmail)) {
        const tpl = d.msgServed
          || 'Perfeito! ✅ {vendedor} vai te chamar agora aqui no WhatsApp.\n\nPode ser de *outro número* — é da nossa equipe, pode responder normalmente. 🙌'
        const custMsg = tpl.replace(/\{vendedor\}/gi, vendorName || 'Um consultor')
        await enviar(custMsg)

        const leadContact = await prisma.contact.findUnique({ where: { id: session.contactId } }).catch(() => null)
        const leadName = leadContact?.name && leadContact.name !== phone ? leadContact.name : 'Cliente'
        const sellerMsg = `🔔 *Novo lead pra você!*\n\n👤 ${leadName}\n📍 ${cityDisplay} — ${modalityFriendly || modalityLabel}\n\n👉 Chame o cliente: https://wa.me/${phone}\n\n_Chame pelo seu celular (o cliente já está te esperando)._`
        const notified = await WhatsAppService.notifySeller(vendorUserId, sellerMsg).catch(() => false)
        if (!notified) {
          await WhatsAppService.notifyAdmin(
            `⚠️ Lead de chip manual sem aviso entregue\nVendedor: ${vendorName || '—'}\nCidade: ${cityDisplay} | ${modalityLabel}\nCliente: ${phone}\nAvise o vendedor manualmente.`,
          ).catch(() => {})
        }

        if (leadId) {
          await prisma.cRMNote.create({
            data: { leadId, userId, content: `🤖 Lead qualificado (abordagem manual pelo celular)\nCidade: ${cityDisplay}\nModalidade: ${modalityLabel}\nAviso enviado pro WhatsApp de ${vendorName || 'vendedor'}${notified ? '' : ' — FALHOU, avisar manual'}.` },
          }).catch(() => {})
        }
        return
      }

      // {vendedor} = nome de quem pegou o lead. Avisar que virá de OUTRO número
      // faz o cliente esperar a mensagem e não estranhar/denunciar.
      const tpl = d.msgServed
        || 'Perfeito! ✅ {vendedor} vai te chamar agora aqui no WhatsApp.\n\nPode ser de *outro número* — é da nossa equipe, pode responder normalmente. 🙌'
      const custMsg = tpl.replace(/\{vendedor\}/gi, vendorName || 'Um consultor')
      await enviar(custMsg)

      // O vendedor PUXA a conversa pelo número DELE. Sem isso o lead só aparece
      // no painel — no WhatsApp dele não existe conversa (o cliente nunca falou
      // com o número dele). Esta 1ª msg faz a conversa nascer no celular dele.
      if (vendorUserId) {
        const vTpl = d.msgVendorFirst
          || 'Olá! 😊 Aqui é {vendedor}, da Parceria Financeira.\n\nRecebi seu contato sobre o crédito em {cidade} e, a partir de agora, sou eu que vou cuidar do seu atendimento. 🙌\n\nPosso te explicar como funciona?'
        const vMsg = vTpl
          .replace(/\{vendedor\}/gi, vendorName || 'seu consultor')
          .replace(/\{cidade\}/gi, cityDisplay)
          .replace(/\{modalidade\}/gi, modalityFriendly || modalityLabel)
        await WhatsAppService.sendMessage(vendorUserId, phone, vMsg).catch((e: any) =>
          logger.warn(`[Flow] Vendedor ${vendorName} não conseguiu puxar a conversa (sem número conectado?): ${e?.message}`)
        )
      }

      if (leadId) {
        await prisma.cRMNote.create({
          data: { leadId, userId, content: `🤖 Lead qualificado pelo robô\nCidade: ${cityDisplay}\nModalidade: ${modalityLabel}` },
        }).catch(() => {})
      }
      return
    }

    // Interessado + cidade NÃO atendida → msg fora de área + Kanban "Fora de área"
    const oat = d.msgOutOfArea || 'Obrigado pelo interesse! 🙏 No momento ainda não atendemos a sua região, mas estamos expandindo e em breve devemos chegar aí. Vou guardar seu contato pra te avisar. 💚'
    await enviar(oat)
    const stageId = await ChatFlowService.ensureStage('Fora de área', '#f59e0b')
    await ChatFlowService.leadToStage(session.contactId, userId, stageId, 'robo-fora-area', `Robô: fora de área. Cidade: ${cityDisplay} | ${modalityLabel}`)
  }

  /**
   * Vendedor de "chip frágil" que deve abordar o lead pelo CELULAR (o robô só o
   * avisa, sem mandar a 1ª msg fria pela API — que não entrega nesses chips).
   * Fonte principal: RouletteAgent.manualOutreach (editável na Central de
   * Vendedores). Fallback: env MANUAL_OUTREACH_EMAILS — mantido só até o admin
   * confirmar os toggles na UI; remover depois (ver PENDENTE na memória do projeto).
   */
  static async isManualOutreach(userId: string, email?: string | null): Promise<boolean> {
    const agent = await prisma.rouletteAgent.findUnique({ where: { userId } })
    if (agent?.manualOutreach === true) return true

    if (!email) return false
    const list = (process.env.MANUAL_OUTREACH_EMAILS || '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    return list.includes(email.trim().toLowerCase())
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
          msgServed: 'Perfeito! ✅ Já passei seu contato para {vendedor}, da nossa equipe. Em instantes {vendedor} vai falar com você por aqui.\n\nPode chegar de um número diferente — é da Parceria Financeira, pode responder tranquilo. 🙌',
          msgVendorFirst: 'Olá! 😊 Aqui é {vendedor}, da Parceria Financeira.\n\nRecebi seu contato sobre o crédito em {cidade} e, a partir de agora, sou eu que vou cuidar do seu atendimento. 🙌\n\nPosso te explicar como funciona?',
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

  /**
   * Timeout de sessões do robô. Janela LONGA (8h): o cliente pode responder
   * horas depois (leads da madrugada respondem de manhã). Ao estourar, NÃO
   * despeja o lead num vendedor aleatório (era o bug: virava lead sem cidade
   * na mão da Stela). Só marca 'done' e joga no Kanban "Não respondeu", pra
   * follow-up manual — sem qualificação inventada e sem cold outbound.
   */
  static async processTimeouts(timeoutMinutes = 480): Promise<void> {
    // Cada robô pode ter o seu tempo e a sua ação. O de qualificação ENCERRA
    // (manda pro Kanban "Não respondeu"); o de atendimento da carteira
    // REINICIA o menu, porque cliente que voltou depois de horas não quer
    // continuar de onde parou — quer escolher de novo.
    const fluxos = await prisma.chatFlow.findMany({
      select: { id: true, timeoutMinutes: true, timeoutAction: true },
    })
    const cfg = new Map(fluxos.map((f) => [f.id, f]))

    // Busca pela MENOR janela configurada, e filtra por fluxo depois: um robô
    // de 3h não pode esperar a janela de 8h do outro pra ser atendido.
    const menorJanela = Math.min(
      timeoutMinutes,
      ...fluxos.map((f) => f.timeoutMinutes ?? timeoutMinutes)
    )
    const candidatos = await prisma.chatFlowSession.findMany({
      where: { status: 'waiting', waitingSince: { lt: new Date(Date.now() - menorJanela * 60_000) } },
      take: 60,
    })

    for (const s of candidatos) {
      const f = cfg.get(s.flowId)
      const janela = f?.timeoutMinutes ?? timeoutMinutes
      const venceu = s.waitingSince != null && Date.now() - s.waitingSince.getTime() >= janela * 60_000
      if (!venceu) continue

      // ── Reiniciar: apaga a sessão para o robô abrir o menu do zero na próxima
      // mensagem do cliente. Mais simples e previsível que reposicionar o nó.
      // Marca 'done' em vez de APAGAR. Apagar parecia mais limpo, mas o robô só
      // inicia em conversa NOVA — sem a linha aqui, o menu nunca voltaria e o
      // cliente escreveria no vazio.
      if (f?.timeoutAction === 'reiniciar') {
        await prisma.chatFlowSession.update({
          where: { id: s.id },
          data: { status: 'done', currentNodeId: null },
        }).catch(() => {})
        logger.info(`[Flow] Timeout ${janela}min: menu vai reiniciar na próxima msg (conv=${s.conversationId})`)
        continue
      }

      await ChatFlowService.encerrarPorTimeout(s, janela)
    }
  }

  /** Encerra e joga no Kanban — comportamento do robô de qualificação. */
  private static async encerrarPorTimeout(s: { id: string; conversationId: string; contactId: string }, janela: number): Promise<void> {
    {
      await prisma.chatFlowSession.update({ where: { id: s.id }, data: { status: 'done' } })
      try {
        const conv = await prisma.conversation.findUnique({ where: { id: s.conversationId }, select: { userId: true } })
        const stageId = await ChatFlowService.ensureStage('Não respondeu', '#a1a1aa')
        await ChatFlowService.leadToStage(s.contactId, conv?.userId || s.contactId, stageId, 'robo-sem-resposta', 'Robô: cliente não respondeu à qualificação')
        logger.info(`[Flow] Timeout (${janela}min): ${s.conversationId} → Kanban "Não respondeu"`)
      } catch (e: any) { logger.warn(`[Flow] Timeout sem stage: ${e?.message}`) }
    }
  }

  /**
   * Reengata o robô quando o cliente responde DEPOIS do timeout (sessão 'done'
   * que nunca completou). Sem isso, resposta tardia ficava sem qualificação.
   * Retorna true se reiniciou o fluxo.
   */
  static async maybeRestartAfterReply(conversationId: string, contactId: string, userId: string, phone: string, sessionId?: string): Promise<boolean> {
    const session = await prisma.chatFlowSession.findUnique({ where: { conversationId } })
    if (!session || session.status !== 'done') return false

    // Robô de MENU (timeoutAction 'reiniciar'): reinicia sempre, qualquer que
    // seja o nó onde parou — a graça do menu é justamente recomeçar.
    const flow = await prisma.chatFlow.findUnique({
      where: { id: session.flowId },
      select: { timeoutAction: true },
    })
    const ehMenu = flow?.timeoutAction === 'reiniciar'

    // Robô de QUALIFICAÇÃO: só reengata quem estourou numa pergunta.
    if (!ehMenu && session.currentNodeId !== 'q_city' && session.currentNodeId !== 'q_mod') return false

    await prisma.chatFlowSession.delete({ where: { id: session.id } }).catch(() => {})
    return ChatFlowService.startForConversation(conversationId, contactId, userId, phone, sessionId)
  }

  /**
   * Abre o menu numa conversa que JÁ existe e está sem sessão de robô.
   *
   * Sem isso, cliente da carteira que já tinha conversa (de uma cobrança, do
   * wa.me) nunca veria o menu: o robô só inicia em conversa NOVA. Vale só para
   * robô de menu — o de qualificação não deve reabordar quem já foi qualificado.
   */
  static async retomarMenu(conversationId: string, contactId: string, userId: string, phone: string, sessionId: string): Promise<boolean> {
    const flow = await ChatFlowService.flowForSession(sessionId, userId)
    if (!flow || (flow as any).timeoutAction !== 'reiniciar') return false

    const existente = await prisma.chatFlowSession.findUnique({ where: { conversationId } })
    // 'waiting' já foi tratado pelo handleInbound; 'running' está no meio de um passo.
    if (existente && existente.status !== 'done') return false
    if (existente) await prisma.chatFlowSession.delete({ where: { id: existente.id } }).catch(() => {})

    return ChatFlowService.startForConversation(conversationId, contactId, userId, phone, sessionId)
  }
}

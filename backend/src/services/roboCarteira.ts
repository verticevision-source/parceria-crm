import { prisma } from '../config/database'
import { logger } from '../utils/logger'

/**
 * Robô de atendimento da CARTEIRA (sem IA).
 *
 * Menu numérico, texto fixo, e um único ponto que consulta o sistema (a dívida).
 * Diferente do robô de qualificação: aquele captura cidade/modalidade e joga na
 * roleta de vendas; este atende quem JÁ é cliente da carteira.
 *
 * Fica montado como nós/arestas do mesmo motor de fluxo, então herda de graça:
 * espera de resposta, timeout, retomada e o histórico na conversa.
 *
 * Criado SEMPRE desativado. Ligar exige a mudança de "um robô por número", que
 * mexe no robô que sustenta as vendas.
 */

const VOLTAR = '\n\n_Digite *0* para voltar ao menu ou *9* para falar com o Gerente de Conta._'

function no(id: string, tipo: string, data: Record<string, any>, x: number, y: number) {
  return { id, type: 'flowNode', position: { x, y }, data: { type: tipo, ...data } }
}
function aresta(source: string, target: string, label?: string) {
  return { id: `${source}->${target}${label ? `-${label}` : ''}`, source, target, ...(label ? { label } : {}) }
}

export function montarRoboCarteira(pixKey: string | null, linkAmanda: string) {
  const semPix = !pixKey

  const nodes: any[] = [
    no('start', 'start', { label: 'Início' }, 400, 0),

    // ── Menu principal ──────────────────────────────────────────────────────
    no('menu', 'question', {
      label: 'Menu principal',
      saveAs: 'opcao',
      text: [
        'Olá! 😊 Sobre qual assunto você deseja falar?',
        '',
        '*Responda com o número:*',
        semPix ? null : '*1* - Quero a chave PIX',
        '*2* - Falar sobre meu empréstimo',
        '*3* - Quero renovar meu empréstimo',
        '*4* - Quero um novo empréstimo',
        '*5* - Falar com o Gerente de Conta',
      // filter por !== null, NÃO por Boolean: '' é falsy e as linhas em branco
      // são de propósito. Com Boolean o menu saía todo colado no WhatsApp.
      ].filter((l) => l !== null).join('\n'),
    }, 400, 100),

    no('rotaMenu', 'condition', { label: 'Qual opção?' }, 400, 200),

    // ── 1) Chave PIX ────────────────────────────────────────────────────────
    no('pix', 'message', {
      label: 'Chave PIX',
      text: semPix
        ? 'Vou pedir a chave PIX para o gerente da sua conta e te mando por aqui.' + VOLTAR
        : `Segue a chave PIX para pagamento:\n\n*${pixKey}*\n\n` +
          'Depois de pagar, me manda o comprovante aqui por favor.' + VOLTAR,
    }, 60, 320),

    // ── 2) Falar sobre meu empréstimo ───────────────────────────────────────
    no('menuEmprestimo', 'question', {
      label: 'Submenu empréstimo',
      saveAs: 'opcaoEmprestimo',
      text: [
        'Sobre o seu empréstimo, o que você precisa?',
        '',
        '*1* - Quero renegociar minha dívida',
        '*2* - Quero saber o valor total da minha dívida',
        '*3* - Quero falar com o Gerente de Operações',
        '',
        '_Digite *0* para voltar ao menu._',
      ].join('\n'),
    }, 400, 320),
    no('rotaEmprestimo', 'condition', { label: 'Qual opção?' }, 400, 420),

    // 2.1 renegociar — a pergunta da entrada é o ponto do negócio
    no('renegociar', 'question', {
      label: 'Renegociar — entrada',
      saveAs: 'valorEntrada',
      text: [
        'Entendi. Um consultor vai entrar em contato com uma proposta. 🤝',
        '',
        'Para adiantar: *qual valor você consegue enviar hoje de entrada?*',
        'Sem um valor de entrada não conseguimos fazer a renegociação.',
      ].join('\n'),
    }, 260, 540),
    no('renegociarFim', 'message', {
      label: 'Renegociar — confirmação',
      text: 'Obrigado! Já registrei e o consultor vai te chamar com a proposta.' + VOLTAR,
    }, 260, 640),

    // 2.2 valor total da dívida — ÚNICO nó que consulta o sistema
    no('divida', 'consulta', {
      label: 'Dívida (consulta o sistema)',
      consulta: 'divida',
      textFallback: 'Não consegui consultar seus dados agora. Vou pedir pro gerente da sua conta te passar por aqui.',
      textSemDivida: 'Pelo nosso sistema você não tem empréstimo em aberto. 😊',
      textNaoCliente: 'Não encontrei seu cadastro nesta carteira. Se você tem empréstimo com a gente, me chama que eu verifico com a equipe.',
    }, 460, 540),
    no('dividaFim', 'message', { label: 'Após a dívida', text: VOLTAR.trim() }, 460, 640),

    // 2.3 gerente de operações
    no('gerenteOperacoes', 'message', {
      label: 'Gerente de Operações',
      text: 'Combinado! O Gerente de Operações vai te chamar em breve por aqui.' + VOLTAR,
      // Aviso vai pro Roberto (dono do número), por decisão do dono. Sem isso o
      // robô prometia contato e ninguém ficava sabendo.
      notificarDono: true,
      notificarTexto: '🛠️ O cliente pediu para falar com o Gerente de Operações pelo robô.',
    }, 660, 540),

    // ── 3) Renovação ────────────────────────────────────────────────────────
    // Confere o saldo e AVISA, sem bloquear: dado desatualizado não pode
    // impedir um cliente que já pagou de pedir renovação.
    no('renovaSaldo', 'consulta', {
      label: 'Renovação — confere saldo',
      consulta: 'saldo',
      textFallback: 'Não consegui confirmar seu saldo agora, mas podemos seguir e a equipe confere.',
    }, 900, 320),
    no('renovaRequisitos', 'question', {
      label: 'Renovação — pedidos',
      saveAs: 'renovacaoOk',
      text: [
        'Para renovar, preciso que você me mande, aqui mesmo:',
        '',
        '1️⃣ Um *vídeo seu* falando seu nome e CPF, gravado *na sua residência*',
        '2️⃣ Sua *localização em tempo real*',
        '3️⃣ O *valor* que deseja e o *plano* (por dia ou por semana)',
        '4️⃣ Sua *chave PIX* para receber',
        '',
        '⏰ *Importante:* o PIX é feito até as *20h* do mesmo dia da solicitação.',
        '',
        'Pode me mandar? Responda *sim* quando estiver pronto para começar.',
      ].join('\n'),
    }, 900, 420),
    no('renovaAguarda', 'message', {
      label: 'Renovação — confirmação',
      text: [
        'Perfeito! Pode mandar o vídeo, a localização e os dados aqui na conversa.',
        'Assim que chegar, o gerente da sua conta analisa e te retorna.',
      ].join('\n') + VOLTAR,
      // Avisa o gerente: sem isso o cliente manda vídeo e ninguém olha.
      notificarDono: true,
      notificarTexto: '📋 Renovação solicitada pelo robô — o cliente vai mandar vídeo, localização e dados na conversa.',
    }, 900, 520),

    // ── 4) Novo empréstimo → Amanda ─────────────────────────────────────────
    no('novoEmprestimo', 'message', {
      label: 'Novo empréstimo → Amanda',
      text: [
        'Que bom! Para um empréstimo novo, quem te atende é a Amanda. 😊',
        '',
        `Chama ela aqui: ${linkAmanda}`,
        '',
        'Manda uma mensagem que ela já te atende.',
      ].join('\n') + VOLTAR,
    }, 1140, 320),

    // ── 5 / 9) Gerente de Conta ─────────────────────────────────────────────
    no('gerenteConta', 'message', {
      label: 'Gerente de Conta',
      text: 'Combinado! O gerente da sua conta vai te chamar em breve por aqui. 😊',
      notificarDono: true,
      notificarTexto: '🙋 O cliente pediu para falar com o Gerente de Conta pelo robô.',
    }, 1340, 320),

    // Opção inválida: repete o menu em vez de deixar o cliente no vácuo.
    no('invalido', 'message', {
      label: 'Opção inválida',
      text: 'Não entendi essa opção. Vou te mostrar o menu de novo. 😊',
    }, 400, 760),
  ]

  const edges: any[] = [
    aresta('start', 'menu'),
    aresta('menu', 'rotaMenu'),

    // Menu principal. As labels casam por "inclui", então o número basta.
    ...(semPix ? [] : [aresta('rotaMenu', 'pix', '1')]),
    aresta('rotaMenu', 'menuEmprestimo', '2'),
    aresta('rotaMenu', 'renovaSaldo', '3'),
    aresta('rotaMenu', 'novoEmprestimo', '4'),
    aresta('rotaMenu', 'gerenteConta', '5'),
    aresta('rotaMenu', 'gerenteConta', '9'),
    aresta('rotaMenu', 'menu', '0'),
    aresta('rotaMenu', 'invalido', 'default'),
    aresta('invalido', 'menu'),

    // Submenu do empréstimo
    aresta('menuEmprestimo', 'rotaEmprestimo'),
    aresta('rotaEmprestimo', 'renegociar', '1'),
    aresta('rotaEmprestimo', 'divida', '2'),
    aresta('rotaEmprestimo', 'gerenteOperacoes', '3'),
    aresta('rotaEmprestimo', 'menu', '0'),
    aresta('rotaEmprestimo', 'gerenteConta', '9'),
    aresta('rotaEmprestimo', 'invalido', 'default'),

    aresta('renegociar', 'renegociarFim'),
    aresta('divida', 'dividaFim'),

    // Renovação
    aresta('renovaSaldo', 'renovaRequisitos'),
    aresta('renovaRequisitos', 'renovaAguarda'),
  ]

  return { nodes, edges }
}

/**
 * Cria (ou atualiza) o robô da carteira, sempre DESATIVADO.
 * Idempotente pelo nome: rodar de novo não duplica.
 */
export async function criarRoboCarteira(opts: {
  nome: string
  sessionId: string
  pixKey: string | null
  linkAmanda: string
  timeoutMinutes?: number
}) {
  const { nodes, edges } = montarRoboCarteira(opts.pixKey, opts.linkAmanda)
  const existente = await prisma.chatFlow.findFirst({ where: { name: opts.nome } })

  const dados = {
    name: opts.nome,
    nodes: nodes as any,
    edges: edges as any,
    whatsappSessionId: opts.sessionId,
    timeoutMinutes: opts.timeoutMinutes ?? 180,
    timeoutAction: 'reiniciar',
    isActive: false,
  }

  const flow = existente
    ? await prisma.chatFlow.update({ where: { id: existente.id }, data: dados })
    : await prisma.chatFlow.create({ data: dados })

  logger.info(`[RoboCarteira] ${existente ? 'Atualizado' : 'Criado'} "${opts.nome}" (desativado, ${dados.timeoutMinutes}min → reiniciar)`)
  return flow
}

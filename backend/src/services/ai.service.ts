import { prisma } from '../config/database'
import { logger } from '../utils/logger'

const DEFAULT_PROMPT = `Você é um assistente de atendimento ao cliente via WhatsApp para uma empresa.
Responda de forma cordial, objetiva e em português do Brasil.
Seja breve (2-4 frases), simpático e profissional. Nunca invente informações que não foram fornecidas.`

export interface AIConfigPublic {
  provider: string
  model: string | null
  systemPrompt: string | null
  enabled: boolean
  hasApiKey: boolean
  botEnabled: boolean
  botUserId: string | null
  botPrompt: string | null
  botRequiredQuestions: string | null
}

export class AIService {
  static async getConfig(): Promise<any> {
    let cfg = await prisma.aIConfig.findUnique({ where: { id: 'singleton' } })
    if (!cfg) {
      cfg = await prisma.aIConfig.create({ data: { id: 'singleton' } })
    }
    return cfg
  }

  /** Versão pública (sem expor a apiKey) */
  static async getConfigPublic(): Promise<AIConfigPublic> {
    const cfg = await AIService.getConfig()
    return {
      provider: cfg.provider,
      model: cfg.model,
      systemPrompt: cfg.systemPrompt,
      enabled: cfg.enabled,
      hasApiKey: !!cfg.apiKey,
      botEnabled: cfg.botEnabled,
      botUserId: cfg.botUserId,
      botPrompt: cfg.botPrompt,
      botRequiredQuestions: cfg.botRequiredQuestions,
    }
  }

  static async updateConfig(data: {
    provider?: string; apiKey?: string; model?: string; systemPrompt?: string; enabled?: boolean
    botEnabled?: boolean; botUserId?: string | null; botPrompt?: string; botRequiredQuestions?: string
  }) {
    const update: any = {}
    if (data.provider) update.provider = data.provider
    if (data.model !== undefined) update.model = data.model
    if (data.systemPrompt !== undefined) update.systemPrompt = data.systemPrompt
    if (data.enabled !== undefined) update.enabled = data.enabled
    if (data.botEnabled !== undefined) update.botEnabled = data.botEnabled
    // botUserId aceita null explicitamente ("nenhum atendente de IA")
    if (data.botUserId !== undefined) update.botUserId = data.botUserId || null
    if (data.botPrompt !== undefined) update.botPrompt = data.botPrompt
    if (data.botRequiredQuestions !== undefined) update.botRequiredQuestions = data.botRequiredQuestions
    // Só atualiza a key se vier preenchida (evita apagar ao salvar form sem key)
    if (data.apiKey) update.apiKey = data.apiKey

    await prisma.aIConfig.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...update },
      update,
    })
    return AIService.getConfigPublic()
  }

  /**
   * Gera uma resposta da IA com base no histórico da conversa.
   * `history`: lista de { role: 'customer' | 'agent', text } em ordem cronológica.
   */
  static async generateReply(
    history: { role: 'customer' | 'agent'; text: string }[],
    promptOverride?: string
  ): Promise<string> {
    const cfg = await AIService.getConfig()
    if (!cfg.enabled) throw new Error('Assistente de IA está desativado. Ative nas Configurações.')
    if (!cfg.apiKey) throw new Error('Configure a chave de API da IA nas Configurações.')

    const systemPrompt = promptOverride?.trim() || cfg.systemPrompt?.trim() || DEFAULT_PROMPT

    if (cfg.provider === 'openai') {
      return AIService.callOpenAI(cfg.apiKey, cfg.model || 'gpt-4o-mini', systemPrompt, history)
    }
    // gemini-1.5-flash foi aposentado pelo Google (chave nova recebe 404).
    return AIService.callGemini(cfg.apiKey, cfg.model || 'gemini-flash-latest', systemPrompt, history)
  }

  /** Monta o histórico de uma conversa e gera uma sugestão de resposta */
  static async suggestForConversation(
    conversationId: string,
    opts?: { limit?: number; promptOverride?: string }
  ): Promise<string> {
    // IMPORTANTE: busca as mensagens MAIS RECENTES (desc) e reordena.
    // Antes era `asc + take`, que pegava as 20 mensagens mais ANTIGAS — numa
    // conversa longa a IA respondia com o contexto congelado no início.
    const msgs = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: opts?.limit ?? 20,
    })
    const history = msgs
      .reverse()
      .filter((m) => m.textBody?.trim())
      .map((m) => ({ role: (m.direction === 'IN' ? 'customer' : 'agent') as 'customer' | 'agent', text: m.textBody! }))
    if (history.length === 0) throw new Error('Sem mensagens de texto para gerar sugestão')
    return AIService.generateReply(history, opts?.promptOverride)
  }

  // ── OpenAI ────────────────────────────────────────────────────────────────
  private static async callOpenAI(
    apiKey: string, model: string, systemPrompt: string,
    history: { role: 'customer' | 'agent'; text: string }[]
  ): Promise<string> {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((h) => ({
        role: h.role === 'customer' ? 'user' : 'assistant',
        content: h.text,
      })),
    ]

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 300 }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      logger.error('[AI/OpenAI] erro:', err)
      throw new Error('Falha ao gerar resposta (OpenAI). Verifique a chave/créditos.')
    }
    const data = await res.json() as any
    return data?.choices?.[0]?.message?.content?.trim() || ''
  }

  // ── Google Gemini ───────────────────────────────────────────────────────────
  private static async callGemini(
    apiKey: string, model: string, systemPrompt: string,
    history: { role: 'customer' | 'agent'; text: string }[]
  ): Promise<string> {
    const contents = history.map((h) => ({
      role: h.role === 'customer' ? 'user' : 'model',
      parts: [{ text: h.text }],
    }))

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

    // Os modelos novos (2.5+) "pensam" antes de responder e esse raciocínio
    // CONSOME a cota de saída: com pouco teto a resposta vinha cortada no meio e
    // às vezes vazava o raciocínio em inglês ("Let's review the prompt's...").
    // Duas defesas: (1) teto FOLGADO, que sozinho já resolve; (2) desligar o
    // thinking quando o modelo aceitar — nem todos aceitam, e quem não aceita
    // devolve 400 "invalid argument", então esse é opcional e tem fallback.
    const base: any = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
    }
    const post = (body: any) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    let res = await post({
      ...base,
      generationConfig: { ...base.generationConfig, thinkingConfig: { thinkingBudget: 0 } },
    })
    if (res.status === 400) {
      // Modelo não suporta thinkingConfig — refaz sem ele (o teto folgado cobre).
      res = await post(base)
    }

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      // Loga o corpo do erro no texto da mensagem: como 2º argumento o winston
      // costuma engolir, e sem ele não dá pra saber se é chave, cota ou modelo.
      logger.error(`[AI/Gemini] erro ${res.status}: ${err.slice(0, 400)}`)
      throw new Error('Falha ao gerar resposta (Gemini). Verifique a chave de API.')
    }
    const data = await res.json() as any
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  }
}

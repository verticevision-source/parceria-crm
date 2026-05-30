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
    }
  }

  static async updateConfig(data: {
    provider?: string; apiKey?: string; model?: string; systemPrompt?: string; enabled?: boolean
  }) {
    const update: any = {}
    if (data.provider) update.provider = data.provider
    if (data.model !== undefined) update.model = data.model
    if (data.systemPrompt !== undefined) update.systemPrompt = data.systemPrompt
    if (data.enabled !== undefined) update.enabled = data.enabled
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
  static async generateReply(history: { role: 'customer' | 'agent'; text: string }[]): Promise<string> {
    const cfg = await AIService.getConfig()
    if (!cfg.enabled) throw new Error('Assistente de IA está desativado. Ative nas Configurações.')
    if (!cfg.apiKey) throw new Error('Configure a chave de API da IA nas Configurações.')

    const systemPrompt = cfg.systemPrompt?.trim() || DEFAULT_PROMPT

    if (cfg.provider === 'openai') {
      return AIService.callOpenAI(cfg.apiKey, cfg.model || 'gpt-4o-mini', systemPrompt, history)
    }
    return AIService.callGemini(cfg.apiKey, cfg.model || 'gemini-1.5-flash', systemPrompt, history)
  }

  /** Monta o histórico de uma conversa e gera uma sugestão de resposta */
  static async suggestForConversation(conversationId: string): Promise<string> {
    const msgs = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })
    const history = msgs
      .filter((m) => m.textBody?.trim())
      .map((m) => ({ role: (m.direction === 'IN' ? 'customer' : 'agent') as 'customer' | 'agent', text: m.textBody! }))
    if (history.length === 0) throw new Error('Sem mensagens de texto para gerar sugestão')
    return AIService.generateReply(history)
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
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
      }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      logger.error('[AI/Gemini] erro:', err)
      throw new Error('Falha ao gerar resposta (Gemini). Verifique a chave de API.')
    }
    const data = await res.json() as any
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  }
}

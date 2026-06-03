import { prisma } from '../config/database'
import { logger } from '../utils/logger'

const GRAPH = 'https://graph.facebook.com/v19.0'

async function defaultCreds() {
  const num = await prisma.whatsAppNumber.findFirst({
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
  if (!num) throw new Error('Nenhum número configurado na Central de Números')
  if (!num.wabaId) throw new Error('O número padrão não tem WABA ID configurado (necessário para modelos)')
  return { token: num.token, wabaId: num.wabaId, phoneNumberId: num.phoneNumberId }
}

export class WhatsAppTemplateService {
  /** Lista os modelos da conta com status de aprovação */
  static async list() {
    const { token, wabaId } = await defaultCreds()
    const res = await fetch(
      `${GRAPH}/${wabaId}/message_templates?fields=name,status,category,language,components&limit=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`Erro ao listar modelos: ${t.substring(0, 150)}`)
    }
    const data = await res.json() as any
    return (data.data || []).map((t: any) => {
      const body = (t.components || []).find((c: any) => c.type === 'BODY')
      return {
        id: t.id, name: t.name, status: t.status,
        category: t.category, language: t.language,
        body: body?.text || '',
      }
    })
  }

  /**
   * Cria um modelo. body usa {{1}}, {{2}}... para variáveis.
   * category: MARKETING | UTILITY
   */
  static async create(data: {
    name: string; category: string; language: string; body: string; exampleVars?: string[]
  }) {
    const { token, wabaId } = await defaultCreds()

    // Nome só aceita minúsculas, números e underscore
    const name = data.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60)

    const bodyComponent: any = { type: 'BODY', text: data.body }
    // Se há variáveis {{n}}, a Meta exige exemplos
    const varCount = (data.body.match(/\{\{\d+\}\}/g) || []).length
    if (varCount > 0) {
      const examples = data.exampleVars && data.exampleVars.length >= varCount
        ? data.exampleVars.slice(0, varCount)
        : Array.from({ length: varCount }, (_, i) => `Exemplo${i + 1}`)
      bodyComponent.example = { body_text: [examples] }
    }

    const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category: data.category || 'MARKETING',
        language: data.language || 'pt_BR',
        components: [bodyComponent],
      }),
    })
    const json = await res.json() as any
    if (!res.ok) {
      logger.error('[Template] erro criar:', JSON.stringify(json))
      throw new Error(json?.error?.error_user_msg || json?.error?.message || 'Erro ao criar modelo')
    }
    logger.info(`[Template] Modelo criado: ${name} (aguardando aprovação da Meta)`)
    return { id: json.id, name, status: json.status || 'PENDING' }
  }

  static async remove(name: string) {
    const { token, wabaId } = await defaultCreds()
    const res = await fetch(`${GRAPH}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`Erro ao remover modelo: ${t.substring(0, 150)}`)
    }
    return { name }
  }
}

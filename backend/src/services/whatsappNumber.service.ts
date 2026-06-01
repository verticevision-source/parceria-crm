import { prisma } from '../config/database'
import { logger } from '../utils/logger'

const GRAPH = 'https://graph.facebook.com/v19.0'

export class WhatsAppNumberService {
  static async list() {
    const nums = await prisma.whatsAppNumber.findMany({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] })
    // Nunca expõe o token completo
    return nums.map((n) => ({
      id: n.id, label: n.label, phoneNumberId: n.phoneNumberId,
      displayNumber: n.displayNumber, verifiedName: n.verifiedName,
      wabaId: n.wabaId, isActive: n.isActive, isDefault: n.isDefault,
      tokenMasked: n.token ? '••••' + n.token.slice(-4) : null,
      createdAt: n.createdAt,
    }))
  }

  /**
   * Adiciona um número: valida na Meta, busca dados e tenta assinar o webhook.
   */
  static async add(data: { label: string; phoneNumberId: string; token: string; wabaId?: string }) {
    const { label, phoneNumberId, token } = data

    // 1. Valida o número na Graph API
    let displayNumber: string | undefined
    let verifiedName: string | undefined
    try {
      const res = await fetch(`${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(`Número/token inválido: ${t.substring(0, 120)}`)
      }
      const info = await res.json() as any
      displayNumber = info.display_phone_number
      verifiedName = info.verified_name
    } catch (e: any) {
      throw new Error(e.message || 'Falha ao validar o número na Meta')
    }

    // 2. Tenta assinar o app à WABA (para receber webhooks) — best-effort
    if (data.wabaId) {
      try {
        await fetch(`${GRAPH}/${data.wabaId}/subscribed_apps`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` },
        })
      } catch { /* ignora — admin pode assinar manualmente */ }
    }

    // 3. Primeiro número vira padrão automaticamente
    const count = await prisma.whatsAppNumber.count()
    const isDefault = count === 0

    const created = await prisma.whatsAppNumber.upsert({
      where: { phoneNumberId },
      create: { label, phoneNumberId, token, wabaId: data.wabaId, displayNumber, verifiedName, isDefault },
      update: { label, token, wabaId: data.wabaId, displayNumber, verifiedName },
    })

    logger.info(`[Números] Número adicionado: ${displayNumber} (${verifiedName})`)
    return { id: created.id, displayNumber, verifiedName, isDefault: created.isDefault }
  }

  static async update(id: string, data: { label?: string; isActive?: boolean }) {
    return prisma.whatsAppNumber.update({ where: { id }, data })
  }

  static async setDefault(id: string) {
    await prisma.whatsAppNumber.updateMany({ data: { isDefault: false } })
    return prisma.whatsAppNumber.update({ where: { id }, data: { isDefault: true, isActive: true } })
  }

  static async remove(id: string) {
    const num = await prisma.whatsAppNumber.findUnique({ where: { id } })
    await prisma.whatsAppNumber.delete({ where: { id } })
    // Se era o padrão, promove outro
    if (num?.isDefault) {
      const next = await prisma.whatsAppNumber.findFirst({ orderBy: { createdAt: 'asc' } })
      if (next) await prisma.whatsAppNumber.update({ where: { id: next.id }, data: { isDefault: true } })
    }
    return { id }
  }
}

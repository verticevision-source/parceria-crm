import { prisma } from '../config/database'

/**
 * Auto-tag: ao receber uma mensagem, aplica automaticamente as tags
 * cujas palavras-chave aparecem no texto (case-insensitive).
 * Retorna as tags aplicadas (novas) para emissão via socket, se desejado.
 */
export async function applyAutoTags(conversationId: string, text: string | null | undefined) {
  if (!text || !text.trim()) return []

  const rules = await prisma.autoTagRule.findMany({
    where: { enabled: true },
    include: { tag: true },
  })
  if (rules.length === 0) return []

  const haystack = text.toLowerCase()
  const matchedTagIds = new Set<string>()
  for (const rule of rules) {
    const kw = rule.keyword.trim().toLowerCase()
    if (kw && haystack.includes(kw)) matchedTagIds.add(rule.tagId)
  }
  if (matchedTagIds.size === 0) return []

  const applied: { id: string; name: string; color: string }[] = []
  for (const tagId of matchedTagIds) {
    try {
      await prisma.conversationTag.upsert({
        where: { conversationId_tagId: { conversationId, tagId } },
        update: {},
        create: { conversationId, tagId },
      })
      const rule = rules.find((r) => r.tagId === tagId)
      if (rule) applied.push({ id: rule.tag.id, name: rule.tag.name, color: rule.tag.color })
    } catch {
      // ignora falhas individuais (ex.: tag removida)
    }
  }
  return applied
}

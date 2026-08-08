import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { prisma } from '../config/database'
import { authConfig } from '../config/auth'
import { logger } from '../utils/logger'

export class UserService {
  /** Sincroniza os links de ficha dos vendedores a partir do Parceria Financeira (por e-mail). */
  static async syncFichaLinks() {
    const url = process.env.FINANCEIRO_API_URL
    const key = process.env.INTEGRATION_KEY
    if (!url || !key) throw new Error('Integração com o financeiro não configurada (FINANCEIRO_API_URL / INTEGRATION_KEY)')

    const res = await fetch(`${url.replace(/\/$/, '')}/api/integration/sellers`, {
      headers: { 'x-integration-key': key },
    })
    if (!res.ok) throw new Error(`Falha ao buscar vendedores do financeiro (HTTP ${res.status})`)

    const data = await res.json() as { sellers?: Array<{ email: string; fichaLink: string | null }>; warning?: string }
    if (data.warning) logger.warn(`[Sync fichas] ${data.warning}`)
    let updated = 0, semFicha = 0, semCadastro = 0
    for (const s of data.sellers || []) {
      if (!s.email) continue
      if (!s.fichaLink) { semFicha++; continue }
      const r = await prisma.user.updateMany({
        where: { email: { equals: s.email, mode: 'insensitive' } },
        data: { fichaLink: s.fichaLink },
      })
      if (r.count > 0) updated += r.count
      else semCadastro++
    }
    return { total: data.sellers?.length || 0, updated, semFicha, semCadastro }
  }

  /**
   * Sincroniza os GERENTES DE CARTEIRA a partir do Parceria Financeiro.
   *
   * Cria o usuário no CRM quando ele ainda não existe (senha aleatória — o
   * admin define depois), promove a GERENTE quem foi cadastrado à mão como
   * USER, e regrava os vínculos de carteira. Carteira que saiu do gerente lá
   * é DESATIVADA aqui, nunca apagada: perder o vínculo apagaria em silêncio o
   * número de WhatsApp já amarrado à carteira (Fase D).
   *
   * Não mexe em quem é ADMIN — ninguém perde acesso por um sync.
   */
  static async syncManagers() {
    const url = process.env.FINANCEIRO_API_URL
    const key = process.env.INTEGRATION_KEY
    if (!url || !key) throw new Error('Integração com o financeiro não configurada (FINANCEIRO_API_URL / INTEGRATION_KEY)')

    const res = await fetch(`${url.replace(/\/$/, '')}/api/integration/managers`, {
      headers: { 'x-integration-key': key },
    })
    if (!res.ok) throw new Error(`Falha ao buscar gerentes do financeiro (HTTP ${res.status})`)

    const data = (await res.json()) as {
      managers?: Array<{ name: string; email: string; wallets: Array<{ id: string; name: string }> }>
    }
    const managers = data.managers || []

    let criados = 0, promovidos = 0, carteiras = 0, ignoradosAdmin = 0, mantidosVendedor = 0
    for (const m of managers) {
      if (!m.email) continue

      let user = await prisma.user.findFirst({
        where: { email: { equals: m.email, mode: 'insensitive' } },
        select: { id: true, role: true, manterComoVendedor: true },
      })

      if (!user) {
        const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), authConfig.bcryptRounds)
        user = await prisma.user.create({
          data: { name: m.name, email: m.email.toLowerCase(), passwordHash, role: 'GERENTE' },
          select: { id: true, role: true, manterComoVendedor: true },
        })
        criados++
      } else if (user.role === 'USER' && user.manterComoVendedor) {
        // Gerencia carteira no financeiro E vende aqui. Promover tiraria ela da
        // roleta (gerente não recebe lead) e ninguém ligaria uma coisa na outra.
        // As carteiras continuam sendo vinculadas logo abaixo — o que muda é só
        // o papel na tela.
        mantidosVendedor++
      } else if (user.role === 'USER') {
        await prisma.user.update({ where: { id: user.id }, data: { role: 'GERENTE' } })
        promovidos++
      } else if (user.role === 'ADMIN') {
        ignoradosAdmin++
      }

      const ids = m.wallets.map((w) => w.id)
      for (const w of m.wallets) {
        await prisma.walletLink.upsert({
          where: { userId_walletId: { userId: user.id, walletId: w.id } },
          create: { userId: user.id, walletId: w.id, walletName: w.name },
          update: { walletName: w.name, isActive: true },
        })
        carteiras++
      }
      await prisma.walletLink.updateMany({
        where: { userId: user.id, walletId: { notIn: ids.length ? ids : ['-'] } },
        data: { isActive: false },
      })
    }

    return { total: managers.length, criados, promovidos, carteiras, ignoradosAdmin, mantidosVendedor }
  }

  static async findAll() {
    return prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        aiEnabled: true,
        avatarUrl: true,
        fichaLink: true,
        createdAt: true,
        updatedAt: true,
        whatsappSessions: {
          where: { status: 'CONNECTED' },
          select: { id: true, phoneNumber: true, status: true },
          take: 1,
        },
        _count: { select: { conversations: true, leads: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  static async findById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        whatsappSessions: {
          select: { id: true, phoneNumber: true, status: true },
        },
        _count: { select: { conversations: true, leads: true, contacts: true } },
      },
    })
    if (!user) throw new Error('Usuário não encontrado')
    return user
  }

  static async create(data: {
    name: string
    email: string
    password: string
    role: 'ADMIN' | 'USER' | 'GERENTE'
  }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) throw new Error('E-mail já cadastrado')

    const passwordHash = await bcrypt.hash(data.password, authConfig.bcryptRounds)

    return prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    })
  }

  static async update(
    id: string,
    data: { name?: string; email?: string; password?: string; avatarUrl?: string; fichaLink?: string }
  ) {
    const updateData: Record<string, unknown> = {}
    if (data.name) updateData.name = data.name
    if (data.email) updateData.email = data.email
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl || null
    if (data.fichaLink !== undefined) updateData.fichaLink = data.fichaLink || null
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, authConfig.bcryptRounds)
    }

    return prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, isActive: true, avatarUrl: true, fichaLink: true },
    })
  }

  static async setActive(id: string, isActive: boolean) {
    return prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })
  }

  static async setAiEnabled(id: string, aiEnabled: boolean) {
    return prisma.user.update({
      where: { id },
      data: { aiEnabled },
      select: { id: true, name: true, aiEnabled: true },
    })
  }

  /**
   * Troca o papel do usuário.
   *
   * `manterComoVendedor` é a trava contra o sync com o financeiro: quem
   * gerencia carteira LÁ é promovido a GERENTE aqui, e gerente não entra na
   * roleta. Quem faz as duas coisas (o caso da Rosi: 2 carteiras no financeiro
   * e vendendo aqui) precisa da trava, senão cada "Sincronizar equipe" tira a
   * pessoa da roleta de novo e o sintoma só aparece dias depois.
   */
  static async setRole(id: string, role: 'ADMIN' | 'USER' | 'GERENTE', manterComoVendedor?: boolean) {
    const user = await prisma.user.findUnique({ where: { id }, select: { role: true } })
    if (!user) throw new Error('Usuário não encontrado')

    // Rebaixar o último admin trancaria todo mundo pra fora da administração.
    if (user.role === 'ADMIN' && role !== 'ADMIN') {
      const activeAdmins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } })
      if (activeAdmins <= 1) throw new Error('Não é possível rebaixar o último administrador')
    }

    return prisma.user.update({
      where: { id },
      data: { role, ...(manterComoVendedor === undefined ? {} : { manterComoVendedor }) },
      select: { id: true, name: true, email: true, role: true, manterComoVendedor: true },
    })
  }

  /**
   * "Exclui" um usuário via SOFT-DELETE (desativa). NUNCA apaga o registro,
   * pois isso cascatearia e apagaria conversas, mensagens, contatos e sessões
   * do banco — política: nenhuma conversa pode sumir. O usuário desativado não
   * loga (auth.service checa isActive) e sai da roleta para não receber leads.
   */
  static async delete(id: string, requesterId: string) {
    if (id === requesterId) {
      throw new Error('Você não pode desativar a si mesmo')
    }

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) throw new Error('Usuário não encontrado')

    // Não permite desativar o último admin ativo
    if (user.role === 'ADMIN') {
      const activeAdmins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } })
      if (activeAdmins <= 1) throw new Error('Não é possível desativar o último administrador')
    }

    // Tira da roleta para parar de receber leads (preserva o histórico).
    await prisma.rouletteAgent.updateMany({ where: { userId: id }, data: { isActive: false } }).catch(() => {})

    await prisma.user.update({ where: { id }, data: { isActive: false } })
    return { id, deactivated: true }
  }
}

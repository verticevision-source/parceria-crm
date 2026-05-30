import { Response } from 'express'
import { RouletteService } from '../services/roulette.service'
import { AuthRequest } from '../types'

export class RouletteController {

  // ── Agente ────────────────────────────────────────────────────────────────

  /** PATCH /api/roulette/toggle — agente entra/sai da roleta */
  static async toggle(req: AuthRequest, res: Response): Promise<void> {
    const result = await RouletteService.toggleActive(req.user!.userId)
    res.json({ success: true, data: result })
  }

  /** GET /api/roulette/my-status — status atual do agente logado */
  static async myStatus(req: AuthRequest, res: Response): Promise<void> {
    const data = await RouletteService.getAgentStatus(req.user!.userId)
    res.json({ success: true, data })
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  /** GET /api/roulette/status — lista todos agentes com status (admin) */
  static async status(_req: AuthRequest, res: Response): Promise<void> {
    const data = await RouletteService.getStatus()
    res.json({ success: true, data })
  }

  /** PATCH /api/roulette/agents/:userId/weight — configura peso (admin) */
  static async setWeight(req: AuthRequest, res: Response): Promise<void> {
    const { userId } = req.params
    const { weight } = req.body
    if (!weight || typeof weight !== 'number') {
      res.status(400).json({ success: false, message: 'weight (número) é obrigatório' })
      return
    }
    await RouletteService.setWeight(userId, weight)
    res.json({ success: true, message: 'Peso atualizado' })
  }

  /** POST /api/roulette/distribute — distribui um lead manualmente (admin) */
  static async distribute(req: AuthRequest, res: Response): Promise<void> {
    const { contactId, campaignId, source, notes, pipelineStageId } = req.body
    if (!contactId) {
      res.status(400).json({ success: false, message: 'contactId é obrigatório' })
      return
    }
    const result = await RouletteService.distribute({
      contactId, campaignId, source, notes, pipelineStageId,
    })
    res.json({ success: true, data: result })
  }

  /** GET /api/roulette/logs — histórico de distribuições (admin) */
  static async logs(_req: AuthRequest, res: Response): Promise<void> {
    const data = await RouletteService.getLogs(100)
    res.json({ success: true, data })
  }

  /** POST /api/roulette/reset-daily — reseta contadores diários (admin) */
  static async resetDaily(_req: AuthRequest, res: Response): Promise<void> {
    await RouletteService.resetDailyCounters()
    res.json({ success: true, message: 'Contadores diários resetados' })
  }

  // ── Campanhas ─────────────────────────────────────────────────────────────

  /** GET /api/roulette/campaigns */
  static async listCampaigns(_req: AuthRequest, res: Response): Promise<void> {
    const data = await RouletteService.listCampaigns()
    res.json({ success: true, data })
  }

  /** POST /api/roulette/campaigns */
  static async createCampaign(req: AuthRequest, res: Response): Promise<void> {
    const { name, description, source } = req.body
    if (!name) {
      res.status(400).json({ success: false, message: 'name é obrigatório' })
      return
    }
    const campaign = await RouletteService.createCampaign({ name, description, source })
    res.status(201).json({ success: true, data: campaign })
  }

  /** PATCH /api/roulette/campaigns/:id/toggle */
  static async toggleCampaign(req: AuthRequest, res: Response): Promise<void> {
    const campaign = await RouletteService.toggleCampaign(req.params.id)
    res.json({ success: true, data: campaign })
  }

  /** PUT /api/roulette/campaigns/:id */
  static async updateCampaign(req: AuthRequest, res: Response): Promise<void> {
    const { name, description, source, teamId } = req.body
    const campaign = await RouletteService.updateCampaign(req.params.id, {
      name, description, source, teamId: teamId ?? null,
    })
    res.json({ success: true, data: campaign })
  }

  /** DELETE /api/roulette/campaigns/:id */
  static async deleteCampaign(req: AuthRequest, res: Response): Promise<void> {
    await RouletteService.deleteCampaign(req.params.id)
    res.json({ success: true, message: 'Campanha removida' })
  }

  // ── Times ─────────────────────────────────────────────────────────────────

  /** GET /api/roulette/teams */
  static async listTeams(_req: AuthRequest, res: Response): Promise<void> {
    const data = await RouletteService.listTeams()
    res.json({ success: true, data })
  }

  /** POST /api/roulette/teams */
  static async createTeam(req: AuthRequest, res: Response): Promise<void> {
    const { name, description, color } = req.body
    if (!name) { res.status(400).json({ success: false, message: 'name é obrigatório' }); return }
    const team = await RouletteService.createTeam({ name, description, color })
    res.status(201).json({ success: true, data: team })
  }

  /** PUT /api/roulette/teams/:id */
  static async updateTeam(req: AuthRequest, res: Response): Promise<void> {
    const team = await RouletteService.updateTeam(req.params.id, req.body)
    res.json({ success: true, data: team })
  }

  /** DELETE /api/roulette/teams/:id */
  static async deleteTeam(req: AuthRequest, res: Response): Promise<void> {
    await RouletteService.deleteTeam(req.params.id)
    res.json({ success: true, message: 'Time removido' })
  }

  /** PATCH /api/roulette/agents/:userId/teams/:teamId — toggle time do agente */
  static async toggleAgentTeam(req: AuthRequest, res: Response): Promise<void> {
    const { userId, teamId } = req.params
    const result = await RouletteService.toggleAgentTeam(userId, teamId)
    res.json({ success: true, data: result, message: result.added ? 'Time adicionado' : 'Time removido' })
  }
}

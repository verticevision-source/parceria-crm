import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../services/api'
import toast from 'react-hot-toast'
import {
  Shuffle, Users, TrendingUp, Plus, Trash2, ToggleLeft,
  ToggleRight, Award, Clock, BarChart2, Target, RefreshCw
} from 'lucide-react'

interface AgentStatus {
  userId: string
  name: string
  email: string
  isActive: boolean
  weight: number
  leadsToday: number
  leadsTotal: number
  lastLeadAt: string | null
}

interface Campaign {
  id: string
  name: string
  description?: string
  source?: string
  isActive: boolean
  leadsCount: number
  createdAt: string
}

interface RouletteLog {
  id: string
  createdAt: string
  user: { id: string; name: string }
  lead?: { id: string; contact?: { name: string; phone: string } }
  campaign?: { name: string }
}

export default function Roulette() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [myStatus, setMyStatus] = useState<{ isActive: boolean; leadsToday: number; leadsTotal: number } | null>(null)
  const [agents, setAgents] = useState<AgentStatus[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [logs, setLogs] = useState<RouletteLog[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  // Modal nova campanha
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [newCampaign, setNewCampaign] = useState({ name: '', description: '', source: '' })

  // Modal distribuir lead manual
  const [showDistribute, setShowDistribute] = useState(false)
  const [distributeData, setDistributeData] = useState({ contactId: '', campaignId: '', notes: '' })

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 15000) // refresh a cada 15s
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      const [statusRes, campaignsRes] = await Promise.all([
        api.get('/roulette/my-status'),
        api.get('/roulette/campaigns'),
      ])
      setMyStatus(statusRes.data.data)
      setCampaigns(campaignsRes.data.data)

      if (isAdmin) {
        const [agentsRes, logsRes] = await Promise.all([
          api.get('/roulette/status'),
          api.get('/roulette/logs'),
        ])
        setAgents(agentsRes.data.data)
        setLogs(logsRes.data.data)
      }
    } catch {
      // silencioso no refresh automático
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle() {
    setToggling(true)
    try {
      const res = await api.patch('/roulette/toggle')
      const { isActive } = res.data.data
      setMyStatus(prev => prev ? { ...prev, isActive } : null)
      toast.success(isActive ? '🟢 Você está na roleta!' : '🔴 Você saiu da roleta')
      loadData()
    } catch {
      toast.error('Erro ao alterar status')
    } finally {
      setToggling(false)
    }
  }

  async function handleSetWeight(userId: string, weight: number) {
    try {
      await api.patch(`/roulette/agents/${userId}/weight`, { weight })
      toast.success('Peso atualizado!')
      loadData()
    } catch {
      toast.error('Erro ao atualizar peso')
    }
  }

  async function handleCreateCampaign() {
    if (!newCampaign.name.trim()) { toast.error('Nome obrigatório'); return }
    try {
      await api.post('/roulette/campaigns', newCampaign)
      toast.success('Campanha criada!')
      setShowNewCampaign(false)
      setNewCampaign({ name: '', description: '', source: '' })
      loadData()
    } catch {
      toast.error('Erro ao criar campanha')
    }
  }

  async function handleToggleCampaign(id: string) {
    try {
      await api.patch(`/roulette/campaigns/${id}/toggle`)
      loadData()
    } catch {
      toast.error('Erro ao alterar campanha')
    }
  }

  async function handleDeleteCampaign(id: string) {
    if (!confirm('Deletar campanha?')) return
    try {
      await api.delete(`/roulette/campaigns/${id}`)
      toast.success('Campanha removida')
      loadData()
    } catch {
      toast.error('Erro ao deletar campanha')
    }
  }

  async function handleDistribute() {
    if (!distributeData.contactId.trim()) { toast.error('ID do contato obrigatório'); return }
    try {
      const res = await api.post('/roulette/distribute', distributeData)
      const { assignedUser, lead } = res.data.data
      toast.success(`Lead distribuído para ${assignedUser.name}!`)
      setShowDistribute(false)
      setDistributeData({ contactId: '', campaignId: '', notes: '' })
      loadData()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao distribuir lead')
    }
  }

  async function handleResetDaily() {
    if (!confirm('Resetar contadores do dia para todos os agentes?')) return
    try {
      await api.post('/roulette/reset-daily')
      toast.success('Contadores resetados!')
      loadData()
    } catch {
      toast.error('Erro ao resetar')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
    </div>
  )

  const activeCount = isAdmin ? agents.filter(a => a.isActive).length : 0

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl">
            <Shuffle size={24} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Roleta de Leads</h1>
            <p className="text-sm text-text-muted">Distribuição automática de leads por campanha</p>
          </div>
        </div>
        <button onClick={loadData} className="btn-ghost p-2 rounded-lg" title="Atualizar">
          <RefreshCw size={16} className="text-text-muted" />
        </button>
      </div>

      {/* ── Card do Agente (toggle) ─────────────────────────────────────────── */}
      <div className={`rounded-2xl p-6 border-2 transition-all ${
        myStatus?.isActive
          ? 'bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700'
          : 'bg-card border-border'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-text-primary text-lg">Meu Status na Roleta</h2>
            <p className="text-sm text-text-muted mt-1">
              {myStatus?.isActive
                ? '🟢 Você está ativo — recebendo leads automaticamente'
                : '🔴 Você está inativo — não receberá novos leads'}
            </p>
            <div className="flex gap-4 mt-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{myStatus?.leadsToday ?? 0}</p>
                <p className="text-xs text-text-muted">Hoje</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-text-primary">{myStatus?.leadsTotal ?? 0}</p>
                <p className="text-xs text-text-muted">Total</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
              myStatus?.isActive
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200'
            }`}
          >
            {myStatus?.isActive
              ? <><ToggleRight size={20} /> Sair da Roleta</>
              : <><ToggleLeft size={20} /> Entrar na Roleta</>
            }
          </button>
        </div>
      </div>

      {/* ── Painel Admin ─────────────────────────────────────────────────────── */}
      {isAdmin && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4 text-center">
              <Users size={20} className="mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold text-primary">{activeCount}</p>
              <p className="text-xs text-text-muted">Ativos agora</p>
            </div>
            <div className="card p-4 text-center">
              <TrendingUp size={20} className="mx-auto text-green-500 mb-1" />
              <p className="text-2xl font-bold text-green-500">
                {agents.reduce((s, a) => s + a.leadsToday, 0)}
              </p>
              <p className="text-xs text-text-muted">Leads hoje</p>
            </div>
            <div className="card p-4 text-center">
              <Target size={20} className="mx-auto text-blue-500 mb-1" />
              <p className="text-2xl font-bold text-blue-500">
                {campaigns.filter(c => c.isActive).length}
              </p>
              <p className="text-xs text-text-muted">Campanhas ativas</p>
            </div>
            <div className="card p-4 text-center">
              <BarChart2 size={20} className="mx-auto text-purple-500 mb-1" />
              <p className="text-2xl font-bold text-purple-500">
                {agents.reduce((s, a) => s + a.leadsTotal, 0)}
              </p>
              <p className="text-xs text-text-muted">Total distribuídos</p>
            </div>
          </div>

          {/* Agentes */}
          <div className="card">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-text-primary flex items-center gap-2">
                <Users size={16} /> Agentes ({agents.length})
              </h3>
              <div className="flex gap-2">
                <button onClick={handleResetDaily} className="btn-ghost text-xs px-3 py-1 rounded-lg flex items-center gap-1">
                  <RefreshCw size={12} /> Reset Diário
                </button>
                <button
                  onClick={() => setShowDistribute(true)}
                  className="btn-primary text-xs px-3 py-1 rounded-lg flex items-center gap-1"
                >
                  <Shuffle size={12} /> Distribuir Lead
                </button>
              </div>
            </div>

            <div className="divide-y divide-border">
              {agents.length === 0 ? (
                <p className="p-4 text-sm text-text-muted text-center">Nenhum agente cadastrado</p>
              ) : agents.map((agent) => (
                <div key={agent.userId} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${agent.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <p className="font-medium text-text-primary text-sm">{agent.name}</p>
                      <p className="text-xs text-text-muted">{agent.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-sm font-semibold text-primary">{agent.leadsToday}</p>
                      <p className="text-xs text-text-muted">hoje</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold">{agent.leadsTotal}</p>
                      <p className="text-xs text-text-muted">total</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Award size={14} className="text-yellow-500" />
                      <select
                        value={agent.weight}
                        onChange={(e) => handleSetWeight(agent.userId, Number(e.target.value))}
                        className="text-xs border border-border rounded px-1 py-0.5 bg-background"
                      >
                        {[1,2,3,4,5,6,7,8,9,10].map(w => (
                          <option key={w} value={w}>{w}x</option>
                        ))}
                      </select>
                    </div>
                    {agent.lastLeadAt && (
                      <div className="flex items-center gap-1 text-xs text-text-muted">
                        <Clock size={12} />
                        {new Date(agent.lastLeadAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Campanhas ──────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <Target size={16} /> Campanhas
          </h3>
          {isAdmin && (
            <button
              onClick={() => setShowNewCampaign(true)}
              className="btn-primary text-xs px-3 py-1 rounded-lg flex items-center gap-1"
            >
              <Plus size={12} /> Nova Campanha
            </button>
          )}
        </div>

        <div className="divide-y divide-border">
          {campaigns.length === 0 ? (
            <p className="p-4 text-sm text-text-muted text-center">Nenhuma campanha criada ainda</p>
          ) : campaigns.map((camp) => (
            <div key={camp.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${camp.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                <div>
                  <p className="font-medium text-text-primary text-sm">{camp.name}</p>
                  <p className="text-xs text-text-muted">
                    {camp.source && <span className="mr-2 capitalize">📍 {camp.source}</span>}
                    {camp.leadsCount} leads
                  </p>
                </div>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleCampaign(camp.id)}
                    className={`text-xs px-2 py-1 rounded ${camp.isActive ? 'text-green-600 hover:bg-green-50' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    {camp.isActive ? 'Ativa' : 'Inativa'}
                  </button>
                  <button
                    onClick={() => handleDeleteCampaign(camp.id)}
                    className="text-red-400 hover:text-red-600 p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Histórico (admin) ───────────────────────────────────────────────── */}
      {isAdmin && logs.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-text-primary p-4 border-b border-border flex items-center gap-2">
            <BarChart2 size={16} /> Histórico de Distribuições
          </h3>
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center justify-between p-3">
                <div>
                  <p className="text-sm text-text-primary">
                    <span className="font-medium">{log.user.name}</span>
                    {log.lead?.contact && (
                      <span className="text-text-muted"> ← {log.lead.contact.name || log.lead.contact.phone}</span>
                    )}
                  </p>
                  {log.campaign && (
                    <p className="text-xs text-text-muted">📣 {log.campaign.name}</p>
                  )}
                </div>
                <p className="text-xs text-text-muted">
                  {new Date(log.createdAt).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal Nova Campanha ─────────────────────────────────────────────── */}
      {showNewCampaign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-bold text-text-primary mb-4">Nova Campanha</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-text-muted">Nome *</label>
                <input
                  className="input w-full mt-1"
                  placeholder="Ex: Black Friday 2024"
                  value={newCampaign.name}
                  onChange={e => setNewCampaign(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm text-text-muted">Origem</label>
                <select
                  className="input w-full mt-1"
                  value={newCampaign.source}
                  onChange={e => setNewCampaign(p => ({ ...p, source: e.target.value }))}
                >
                  <option value="">Selecione...</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="landing_page">Landing Page</option>
                  <option value="google">Google Ads</option>
                  <option value="indicacao">Indicação</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-text-muted">Descrição</label>
                <textarea
                  className="input w-full mt-1 h-20 resize-none"
                  placeholder="Descrição opcional..."
                  value={newCampaign.description}
                  onChange={e => setNewCampaign(p => ({ ...p, description: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn-primary flex-1" onClick={handleCreateCampaign}>Criar Campanha</button>
              <button className="btn-ghost flex-1" onClick={() => setShowNewCampaign(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Distribuir Lead ───────────────────────────────────────────── */}
      {showDistribute && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-bold text-text-primary mb-4">Distribuir Lead pela Roleta</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-text-muted">ID do Contato *</label>
                <input
                  className="input w-full mt-1"
                  placeholder="UUID do contato"
                  value={distributeData.contactId}
                  onChange={e => setDistributeData(p => ({ ...p, contactId: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm text-text-muted">Campanha (opcional)</label>
                <select
                  className="input w-full mt-1"
                  value={distributeData.campaignId}
                  onChange={e => setDistributeData(p => ({ ...p, campaignId: e.target.value }))}
                >
                  <option value="">Sem campanha</option>
                  {campaigns.filter(c => c.isActive).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-text-muted">Observação</label>
                <input
                  className="input w-full mt-1"
                  placeholder="Notas sobre o lead..."
                  value={distributeData.notes}
                  onChange={e => setDistributeData(p => ({ ...p, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={handleDistribute}>
                <Shuffle size={16} /> Distribuir
              </button>
              <button className="btn-ghost flex-1" onClick={() => setShowDistribute(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../services/api'
import toast from 'react-hot-toast'
import {
  Shuffle, Users, TrendingUp, Plus, Trash2, ToggleLeft,
  ToggleRight, Award, Clock, BarChart2, Target, RefreshCw, MapPin, Edit2
} from 'lucide-react'

interface Team {
  id: string
  name: string
  description?: string
  color: string
  isActive: boolean
  _count: { agents: number; campaigns: number }
}

interface AgentTeam {
  teamId: string
  teamName: string
  teamColor: string
}

interface AgentStatus {
  userId: string
  name: string
  email: string
  isActive: boolean
  weight: number
  leadsToday: number
  leadsTotal: number
  lastLeadAt: string | null
  teams: AgentTeam[]
}

interface Campaign {
  id: string
  name: string
  description?: string
  source?: string
  teamId?: string | null
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
  const [teams, setTeams] = useState<Team[]>([])
  const [logs, setLogs] = useState<RouletteLog[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [activeTab, setActiveTab] = useState<'agents' | 'campaigns' | 'teams'>('agents')

  // Modal nova campanha
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [newCampaign, setNewCampaign] = useState({ name: '', description: '', source: '', teamId: '' })

  // Modal novo time
  const [showNewTeam, setShowNewTeam] = useState(false)
  const [newTeam, setNewTeam] = useState({ name: '', description: '', color: '#6366f1' })

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
        const [agentsRes, logsRes, teamsRes] = await Promise.all([
          api.get('/roulette/status'),
          api.get('/roulette/logs'),
          api.get('/roulette/teams'),
        ])
        setAgents(agentsRes.data.data)
        setLogs(logsRes.data.data)
        setTeams(teamsRes.data.data)
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
      await api.post('/roulette/campaigns', { ...newCampaign, teamId: newCampaign.teamId || null })
      toast.success('Campanha criada!')
      setShowNewCampaign(false)
      setNewCampaign({ name: '', description: '', source: '', teamId: '' })
      loadData()
    } catch {
      toast.error('Erro ao criar campanha')
    }
  }

  async function handleCreateTeam() {
    if (!newTeam.name.trim()) { toast.error('Nome obrigatório'); return }
    try {
      await api.post('/roulette/teams', newTeam)
      toast.success('Time criado!')
      setShowNewTeam(false)
      setNewTeam({ name: '', description: '', color: '#6366f1' })
      loadData()
    } catch {
      toast.error('Erro ao criar time')
    }
  }

  async function handleDeleteTeam(id: string) {
    if (!confirm('Deletar time? Os agentes ficarão sem time.')) return
    try {
      await api.delete(`/roulette/teams/${id}`)
      toast.success('Time removido')
      loadData()
    } catch {
      toast.error('Erro ao deletar time')
    }
  }

  async function handleToggleAgentTeam(userId: string, teamId: string) {
    try {
      const res = await api.patch(`/roulette/agents/${userId}/teams/${teamId}`)
      toast.success(res.data.data.added ? 'Time adicionado!' : 'Time removido')
      loadData()
    } catch {
      toast.error('Erro ao alterar time')
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

          {/* Tabs */}
          <div className="flex gap-1 bg-bg-secondary p-1 rounded-xl">
            {(['agents', 'campaigns', 'teams'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                  activeTab === tab ? 'bg-card shadow text-text-primary' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {tab === 'agents' ? `👥 Agentes (${agents.length})` : tab === 'campaigns' ? `📣 Campanhas (${campaigns.length})` : `🗺️ Times (${teams.length})`}
              </button>
            ))}
          </div>

          {/* ── Aba Agentes ── */}
          {activeTab === 'agents' && (
          <div className="card">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-text-primary flex items-center gap-2">
                <Users size={16} /> Agentes
              </h3>
              <div className="flex gap-2">
                <button onClick={handleResetDaily} className="btn-ghost text-xs px-3 py-1 rounded-lg flex items-center gap-1">
                  <RefreshCw size={12} /> Reset Diário
                </button>
                <button onClick={() => setShowDistribute(true)} className="btn-primary text-xs px-3 py-1 rounded-lg flex items-center gap-1">
                  <Shuffle size={12} /> Distribuir Lead
                </button>
              </div>
            </div>

            <div className="divide-y divide-border">
              {agents.length === 0 ? (
                <p className="p-4 text-sm text-text-muted text-center">Nenhum agente cadastrado</p>
              ) : agents.map((agent) => {
                const agentTeamIds = new Set(agent.teams.map(t => t.teamId))
                return (
                <div key={agent.userId} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${agent.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <div>
                        <p className="font-medium text-text-primary text-sm">{agent.name}</p>
                        <p className="text-xs text-text-muted">{agent.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <p className="text-sm font-semibold text-primary">{agent.leadsToday}</p>
                        <p className="text-xs text-text-muted">hoje</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold">{agent.leadsTotal}</p>
                        <p className="text-xs text-text-muted">total</p>
                      </div>
                      <div className="flex items-center gap-1" title="Peso na distribuição">
                        <Award size={14} className="text-yellow-500" />
                        <select
                          value={agent.weight}
                          onChange={(e) => handleSetWeight(agent.userId, Number(e.target.value))}
                          className="text-xs border border-border rounded px-1 py-0.5 bg-background"
                        >
                          {[1,2,3,4,5,6,7,8,9,10].map(w => <option key={w} value={w}>{w}x</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Times — clique para adicionar/remover (multi-seleção) */}
                  <div className="flex items-center gap-1.5 flex-wrap mt-2 pl-6">
                    <MapPin size={12} className="text-text-muted" />
                    {teams.length === 0 ? (
                      <span className="text-xs text-text-muted">Crie times na aba "Times"</span>
                    ) : teams.map(t => {
                      const active = agentTeamIds.has(t.id)
                      return (
                        <button
                          key={t.id}
                          onClick={() => handleToggleAgentTeam(agent.userId, t.id)}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium transition-all border ${
                            active ? 'text-white border-transparent' : 'text-text-muted border-border hover:border-text-muted'
                          }`}
                          style={active ? { backgroundColor: t.color } : {}}
                          title={active ? `Remover de ${t.name}` : `Adicionar a ${t.name}`}
                        >
                          {active ? '✓ ' : '+ '}{t.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )})}
            </div>
          </div>
          )}

          {/* ── Aba Times ── */}
          {activeTab === 'teams' && (
          <div className="card">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-text-primary flex items-center gap-2">
                <MapPin size={16} /> Times Regionais
              </h3>
              <button onClick={() => setShowNewTeam(true)} className="btn-primary text-xs px-3 py-1 rounded-lg flex items-center gap-1">
                <Plus size={12} /> Novo Time
              </button>
            </div>
            <div className="divide-y divide-border">
              {teams.length === 0 ? (
                <p className="p-4 text-sm text-text-muted text-center">Nenhum time criado ainda</p>
              ) : teams.map(team => (
                <div key={team.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
                    <div>
                      <p className="font-medium text-text-primary text-sm">{team.name}</p>
                      <p className="text-xs text-text-muted">
                        {team._count.agents} agente{team._count.agents !== 1 ? 's' : ''} · {team._count.campaigns} campanha{team._count.campaigns !== 1 ? 's' : ''}
                        {team.description && ` · ${team.description}`}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteTeam(team.id)} className="text-red-400 hover:text-red-600 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          )}
        </>
      )}

      {/* ── Aba Campanhas (apenas se não admin ou dentro das tabs) ── */}
      {(!isAdmin || activeTab === 'campaigns') && (
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <Target size={16} /> Campanhas
          </h3>
          {isAdmin && (
            <button onClick={() => setShowNewCampaign(true)} className="btn-primary text-xs px-3 py-1 rounded-lg flex items-center gap-1">
              <Plus size={12} /> Nova Campanha
            </button>
          )}
        </div>
        <div className="divide-y divide-border">
          {campaigns.length === 0 ? (
            <p className="p-4 text-sm text-text-muted text-center">Nenhuma campanha criada ainda</p>
          ) : campaigns.map((camp) => {
            const team = teams.find(t => t.id === camp.teamId)
            return (
              <div key={camp.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${camp.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <p className="font-medium text-text-primary text-sm">{camp.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {camp.source && <span className="text-xs text-text-muted capitalize">📍 {camp.source}</span>}
                      {team && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: team.color }}>
                          {team.name}
                        </span>
                      )}
                      <span className="text-xs text-text-muted">{camp.leadsCount} leads</span>
                    </div>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button onClick={() => handleToggleCampaign(camp.id)}
                      className={`text-xs px-2 py-1 rounded ${camp.isActive ? 'text-green-600 hover:bg-green-50' : 'text-gray-500 hover:bg-gray-50'}`}>
                      {camp.isActive ? 'Ativa' : 'Inativa'}
                    </button>
                    <button onClick={() => handleDeleteCampaign(camp.id)} className="text-red-400 hover:text-red-600 p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      )}

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
                <label className="text-sm text-text-muted">Time Regional</label>
                <select
                  className="input w-full mt-1"
                  value={newCampaign.teamId}
                  onChange={e => setNewCampaign(p => ({ ...p, teamId: e.target.value }))}
                >
                  <option value="">Sem time (pool global)</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {teams.length === 0 && (
                  <p className="text-xs text-text-muted mt-1">💡 Crie times na aba "Times" primeiro</p>
                )}
              </div>
              <div>
                <label className="text-sm text-text-muted">Descrição</label>
                <textarea
                  className="input w-full mt-1 h-16 resize-none"
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

      {/* ── Modal Novo Time ────────────────────────────────────────────────── */}
      {showNewTeam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
              <MapPin size={16} /> Novo Time Regional
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-text-muted">Nome *</label>
                <input className="input w-full mt-1" placeholder="Ex: Sorocaba, Rio Preto..."
                  value={newTeam.name} onChange={e => setNewTeam(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm text-text-muted">Descrição</label>
                <input className="input w-full mt-1" placeholder="Opcional..."
                  value={newTeam.description} onChange={e => setNewTeam(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm text-text-muted">Cor</label>
                <div className="flex items-center gap-3 mt-1">
                  <input type="color" value={newTeam.color}
                    onChange={e => setNewTeam(p => ({ ...p, color: e.target.value }))}
                    className="w-10 h-10 rounded cursor-pointer border border-border" />
                  <div className="flex gap-2">
                    {['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899'].map(c => (
                      <button key={c} onClick={() => setNewTeam(p => ({ ...p, color: c }))}
                        className="w-6 h-6 rounded-full border-2 transition-all"
                        style={{ backgroundColor: c, borderColor: newTeam.color === c ? '#fff' : 'transparent' }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn-primary flex-1" onClick={handleCreateTeam}>Criar Time</button>
              <button className="btn-ghost flex-1" onClick={() => setShowNewTeam(false)}>Cancelar</button>
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

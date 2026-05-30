import { useState, useEffect } from 'react'
import { api } from '../services/api'
import toast from 'react-hot-toast'
import {
  BarChart3, TrendingUp, TrendingDown, Users, Target, Award,
  MessageSquare, MapPin, Percent, RefreshCw, Trophy
} from 'lucide-react'

interface ReportData {
  period: { days: number; since: string }
  kpis: {
    totalLeads: number; wonLeads: number; lostLeads: number; openLeads: number
    conversionRate: number; messagesIn: number; messagesOut: number
  }
  perAgent: { userId: string; name: string; total: number; won: number; lost: number; open: number; conversion: number }[]
  perCampaign: { campaignId: string; name: string; total: number; won: number; conversion: number }[]
  perTeam: { teamId: string; name: string; color: string; agents: number; total: number; won: number; conversion: number }[]
  funnel: { name: string; color: string; count: number }[]
  messageSeries: { day: string; in: number; out: number }[]
  leadsSeries: { day: string; won: number; lost: number }[]
}

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
]

function KpiCard({ icon, label, value, accent, sub }: {
  icon: React.ReactNode; label: string; value: string | number; accent: string; sub?: string
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-lg" style={{ background: accent + '22', color: accent }}>{icon}</div>
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

// Mini bar chart (puro CSS)
function MiniBars({ data, keys }: { data: any[]; keys: { key: string; color: string; label: string }[] }) {
  const max = Math.max(1, ...data.flatMap(d => keys.map(k => d[k.key] || 0)))
  return (
    <div>
      <div className="flex items-end gap-1 h-32">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end gap-0.5 group relative" title={d.day}>
            {keys.map(k => (
              <div key={k.key} className="w-full rounded-t transition-all"
                style={{ height: `${((d[k.key] || 0) / max) * 100}%`, backgroundColor: k.color, minHeight: d[k.key] ? 2 : 0 }} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-3 justify-center">
        {keys.map(k => (
          <span key={k.key} className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: k.color }} /> {k.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function Reports() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => { load(days) }, [days])

  async function load(d: number) {
    setLoading(true)
    try {
      const res = await api.get(`/reports?days=${d}`)
      setData(res.data.data)
    } catch { toast.error('Erro ao carregar relatórios') }
    finally { setLoading(false) }
  }

  if (loading && !data) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
    </div>
  )
  if (!data) return null

  const k = data.kpis
  const maxFunnel = Math.max(1, ...data.funnel.map(f => f.count))

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <BarChart3 size={22} className="text-primary" /> Relatórios
          </h1>
          <p className="text-sm text-text-muted mt-0.5">Desempenho de vendas e atendimento</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-bg-secondary p-1 rounded-xl">
            {PERIODS.map(p => (
              <button key={p.days} onClick={() => setDays(p.days)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  days === p.days ? 'bg-card shadow text-text-primary' : 'text-text-muted hover:text-text-primary'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={() => load(days)} className="btn-ghost p-2 rounded-lg"><RefreshCw size={16} /></button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<Target size={16} />} label="Leads no período" value={k.totalLeads} accent="#6366f1" />
        <KpiCard icon={<Trophy size={16} />} label="Ganhos" value={k.wonLeads} accent="#10b981"
          sub={`${k.lostLeads} perdidos`} />
        <KpiCard icon={<Percent size={16} />} label="Taxa de conversão" value={`${k.conversionRate}%`} accent="#f59e0b" />
        <KpiCard icon={<MessageSquare size={16} />} label="Mensagens" value={k.messagesIn + k.messagesOut} accent="#3b82f6"
          sub={`${k.messagesIn} recebidas · ${k.messagesOut} enviadas`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance por vendedor */}
        <div className="card">
          <h3 className="font-semibold text-text-primary p-4 border-b border-border flex items-center gap-2">
            <Award size={16} className="text-yellow-500" /> Ranking de Vendedores
          </h3>
          <div className="divide-y divide-border">
            {data.perAgent.length === 0 ? (
              <p className="p-4 text-sm text-text-muted text-center">Sem dados no período</p>
            ) : data.perAgent.map((a, i) => (
              <div key={a.userId} className="flex items-center gap-3 p-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  i === 0 ? 'bg-yellow-500/20 text-yellow-500' : i === 1 ? 'bg-gray-400/20 text-gray-400' :
                  i === 2 ? 'bg-orange-600/20 text-orange-500' : 'bg-bg-tertiary text-text-muted'
                }`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{a.name}</p>
                  <p className="text-xs text-text-muted">{a.total} leads · {a.open} em aberto</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-green-500">{a.won} <span className="text-xs font-normal text-text-muted">ganhos</span></p>
                  <p className="text-xs text-text-muted">{a.conversion}% conversão</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Funil */}
        <div className="card">
          <h3 className="font-semibold text-text-primary p-4 border-b border-border flex items-center gap-2">
            <TrendingDown size={16} className="text-primary" /> Funil de Vendas (leads abertos)
          </h3>
          <div className="p-4 space-y-2">
            {data.funnel.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">Nenhuma etapa configurada</p>
            ) : data.funnel.map((f, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-secondary">{f.name}</span>
                  <span className="text-text-muted font-medium">{f.count}</span>
                </div>
                <div className="h-6 rounded-lg bg-bg-tertiary overflow-hidden">
                  <div className="h-full rounded-lg transition-all flex items-center justify-end pr-2"
                    style={{ width: `${Math.max((f.count / maxFunnel) * 100, f.count ? 8 : 0)}%`, backgroundColor: f.color }}>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Conversão por campanha */}
        <div className="card">
          <h3 className="font-semibold text-text-primary p-4 border-b border-border flex items-center gap-2">
            <Target size={16} className="text-blue-500" /> Desempenho por Campanha
          </h3>
          <div className="divide-y divide-border">
            {data.perCampaign.length === 0 ? (
              <p className="p-4 text-sm text-text-muted text-center">Sem leads de campanha no período</p>
            ) : data.perCampaign.map((c) => (
              <div key={c.campaignId} className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{c.name}</p>
                  <p className="text-xs text-text-muted">{c.total} leads</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-green-500">{c.won} ganhos</p>
                  <p className="text-xs text-text-muted">{c.conversion}% conversão</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Desempenho por time */}
        <div className="card">
          <h3 className="font-semibold text-text-primary p-4 border-b border-border flex items-center gap-2">
            <MapPin size={16} className="text-purple-500" /> Desempenho por Time
          </h3>
          <div className="divide-y divide-border">
            {data.perTeam.length === 0 ? (
              <p className="p-4 text-sm text-text-muted text-center">Nenhum time com leads no período</p>
            ) : data.perTeam.map((t) => (
              <div key={t.teamId} className="flex items-center gap-3 p-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{t.name}</p>
                  <p className="text-xs text-text-muted">{t.agents} agentes · {t.total} leads</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-green-500">{t.won} ganhos</p>
                  <p className="text-xs text-text-muted">{t.conversion}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Séries temporais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-4">
          <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
            <MessageSquare size={16} className="text-blue-500" /> Volume de Mensagens
          </h3>
          {data.messageSeries.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Sem mensagens no período</p>
          ) : (
            <MiniBars data={data.messageSeries} keys={[
              { key: 'in', color: '#3b82f6', label: 'Recebidas' },
              { key: 'out', color: '#6366f1', label: 'Enviadas' },
            ]} />
          )}
        </div>

        <div className="card p-4">
          <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-green-500" /> Ganhos vs Perdidos
          </h3>
          {data.leadsSeries.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Sem fechamentos no período</p>
          ) : (
            <MiniBars data={data.leadsSeries} keys={[
              { key: 'won', color: '#10b981', label: 'Ganhos' },
              { key: 'lost', color: '#ef4444', label: 'Perdidos' },
            ]} />
          )}
        </div>
      </div>
    </div>
  )
}

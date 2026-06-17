import { useEffect, useState } from 'react'
import {
  MessageSquare, Users, Briefcase, Wifi, WifiOff,
  TrendingUp, Clock, CheckCircle, AlertCircle,
  MessageCircle, ArrowUpRight, type LucideIcon
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { dashboardApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { DashboardUser, DashboardAdmin } from '../types'
import { PageLoader } from '../components/UI/LoadingSpinner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/* ── tipos ── */
interface StatCardProps {
  title: string
  value: number | string
  icon: LucideIcon
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'gold'
  subtitle?: string
  trend?: number
}

/* ── paleta de ícones ── */
const iconMeta: Record<string, { bg: string; text: string; glow: string }> = {
  primary: {
    bg:   'rgba(99,102,241,0.12)',
    text: '#818cf8',
    glow: '0 0 16px rgba(99,102,241,0.25)',
  },
  success: {
    bg:   'rgba(16,185,129,0.12)',
    text: '#34d399',
    glow: '0 0 16px rgba(16,185,129,0.2)',
  },
  warning: {
    bg:   'rgba(245,158,11,0.12)',
    text: '#fbbf24',
    glow: '0 0 16px rgba(245,158,11,0.2)',
  },
  danger: {
    bg:   'rgba(239,68,68,0.12)',
    text: '#f87171',
    glow: '0 0 16px rgba(239,68,68,0.2)',
  },
  info: {
    bg:   'rgba(59,130,246,0.12)',
    text: '#60a5fa',
    glow: '0 0 16px rgba(59,130,246,0.2)',
  },
  gold: {
    bg:   'rgba(201,149,42,0.12)',
    text: '#F5D06B',
    glow: '0 0 16px rgba(201,149,42,0.3)',
  },
}

function StatCard({ title, value, icon: Icon, color = 'primary', subtitle, trend }: StatCardProps) {
  const meta = iconMeta[color]
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: meta.bg, boxShadow: meta.glow }}
        >
          <Icon size={22} style={{ color: meta.text }} />
        </div>
        {trend !== undefined && (
          <div className="flex items-center gap-1 text-xs font-medium" style={{ color: trend >= 0 ? '#34d399' : '#f87171' }}>
            <ArrowUpRight size={13} style={{ transform: trend < 0 ? 'rotate(90deg)' : undefined }} />
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-text-muted text-xs font-medium uppercase tracking-wide">{title}</p>
        <p className="stat-number mt-1">{value}</p>
        {subtitle && <p className="text-text-muted text-xs mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}

/* ── Custom tooltip dos gráficos ── */
const ChartTooltip = ({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0f1622', border: '1px solid #1e2d4a',
      borderRadius: '12px', padding: '10px 14px',
    }}>
      {label && <p style={{ color: '#8fa3c8', fontSize: 12, marginBottom: 4 }}>{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.fill || '#f0f4ff', fontSize: 13, fontWeight: 600 }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { isAdmin } = useAuth()
  const [userData,  setUserData]  = useState<DashboardUser | null>(null)
  const [adminData, setAdminData] = useState<DashboardAdmin | null>(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        if (isAdmin) {
          const [uRes, aRes] = await Promise.all([dashboardApi.user(), dashboardApi.admin()])
          setUserData(uRes.data.data)
          setAdminData(aRes.data.data)
        } else {
          const res = await dashboardApi.user()
          setUserData(res.data.data)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [isAdmin])

  if (loading) return <PageLoader />

  /* ── filtrar estágios com 0 leads para o gráfico ── */
  const pieData = (adminData?.leadsPerStage ?? []).filter((s) => s.count > 0)

  return (
    <div className="p-8 space-y-8 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">Dashboard</h1>
          <p className="text-text-muted text-sm mt-1">
            {format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
      </div>

      {/* ── Banner status WhatsApp ── */}
      {userData?.whatsapp && (
        <div
          className="flex items-center gap-3 px-5 py-4 rounded-2xl border"
          style={
            userData.whatsapp.status === 'CONNECTED'
              ? { background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)' }
              : { background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.25)' }
          }
        >
          {userData.whatsapp.status === 'CONNECTED'
            ? <Wifi size={18} style={{ color: '#34d399' }} />
            : <WifiOff size={18} style={{ color: '#fbbf24' }} />}
          <span className="font-semibold text-sm" style={{
            color: userData.whatsapp.status === 'CONNECTED' ? '#34d399' : '#fbbf24',
          }}>
            WhatsApp {userData.whatsapp.status === 'CONNECTED'
              ? `conectado — ${userData.whatsapp.phoneNumber}`
              : 'desconectado'}
          </span>
        </div>
      )}

      {/* ── Cards do usuário ── */}
      {userData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard title="Total Conversas"  value={userData.conversations.total}   icon={MessageSquare} color="primary" />
          <StatCard title="Em Aberto"         value={userData.conversations.open}    icon={MessageCircle} color="info"    />
          <StatCard title="Pendentes"         value={userData.conversations.pending} icon={Clock}         color="warning" />
          <StatCard title="Finalizadas"       value={userData.conversations.closed}  icon={CheckCircle}   color="success" />
          <StatCard title="Não Lidas"         value={userData.messages.unread}       icon={AlertCircle}   color="danger"  />
          <StatCard title="Total Leads"       value={userData.leads.total}           icon={Briefcase}     color="primary" />
          <StatCard title="Leads Abertos"     value={userData.leads.open}            icon={TrendingUp}    color="info"    />
          <StatCard title="Leads Ganhos"      value={userData.leads.won}             icon={CheckCircle}   color="gold"    />
        </div>
      )}

      {/* ── Seção Admin ── */}
      {isAdmin && adminData && (
        <>
          {/* Linha divisória dourada */}
          <div className="glow-divider-gold" />

          <div>
            <h2 className="text-xl font-extrabold text-text-primary mb-5">
              Visão Geral — Admin
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard title="Usuários Ativos"   value={adminData.users.active}           icon={Users}         color="gold"    />
              <StatCard title="WhatsApp Online"   value={adminData.users.connectedSessions} icon={Wifi}         color="info"    />
              <StatCard title="Taxa de Conversão" value={`${adminData.leads.conversionRate ?? 0}%`} icon={TrendingUp} color="success" subtitle={`${adminData.leads.won ?? 0} ganhos · ${adminData.leads.lost ?? 0} perdidos`} />
              <StatCard title="Total Leads"       value={adminData.leads.total}            icon={Briefcase}     color="primary" />
              <StatCard title="Conversas Hoje"    value={adminData.conversations.today ?? 0} icon={MessageCircle} color="info"  />
              <StatCard title="Mensagens Hoje"    value={adminData.messages.today ?? 0}    icon={MessageSquare} color="primary" />
              <StatCard title="Total Conversas"   value={adminData.conversations.total}    icon={MessageSquare} color="gold"    />
              <StatCard title="Total Mensagens"   value={adminData.messages.total}         icon={MessageSquare} color="warning" />
            </div>
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Pie — Leads por Etapa (sem estágios com 0) */}
            <div className="card">
              <h3 className="text-text-primary font-bold mb-1">Leads por Etapa</h3>
              <p className="text-text-muted text-xs mb-5">
                {pieData.length === 0
                  ? 'Nenhum lead cadastrado ainda'
                  : `${pieData.reduce((a, d) => a + d.count, 0)} leads distribuídos em ${pieData.length} etapa(s)`}
              </p>

              {pieData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-text-muted">
                  <Briefcase size={40} className="mb-3 opacity-20" />
                  <p className="text-sm">Crie leads no CRM para ver o gráfico</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={entry.color || `hsl(${index * 45}, 70%, 55%)`}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      formatter={(value) => (
                        <span style={{ color: '#8fa3c8', fontSize: 12 }}>{value}</span>
                      )}
                      iconType="circle"
                      iconSize={8}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Bar — Conversas por atendente */}
            <div className="card">
              <h3 className="text-text-primary font-bold mb-1">Conversas por Atendente</h3>
              <p className="text-text-muted text-xs mb-5">Total acumulado</p>

              {adminData.conversationsPerUser.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-text-muted">
                  <Users size={40} className="mb-3 opacity-20" />
                  <p className="text-sm">Sem dados ainda</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={adminData.conversationsPerUser} barSize={28}>
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#4a6080', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#4a6080', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                    <Bar
                      dataKey="count"
                      name="Conversas"
                      radius={[8, 8, 0, 0]}
                      fill="url(#barGradient)"
                    />
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#818cf8" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.7} />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Bar — Leads por usuário */}
          {adminData.leadsPerUser.length > 0 && (
            <div className="card">
              <h3 className="text-text-primary font-bold mb-1">Leads por Atendente</h3>
              <p className="text-text-muted text-xs mb-5">Total de leads criados</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={adminData.leadsPerUser} barSize={32}>
                  <XAxis dataKey="name" tick={{ fill: '#4a6080', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#4a6080', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(201,149,42,0.06)' }} />
                  <Bar dataKey="count" name="Leads" radius={[8, 8, 0, 0]} fill="url(#barGold)">
                  </Bar>
                  <defs>
                    <linearGradient id="barGold" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F5D06B" />
                      <stop offset="100%" stopColor="#C9952A" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* ── Mensagens recentes ── */}
      {userData && userData.recentMessages.length > 0 && (
        <div className="card">
          <h3 className="text-text-primary font-bold mb-5">Últimas Mensagens Recebidas</h3>
          <div className="space-y-3">
            {userData.recentMessages.map((msg) => (
              <div key={msg.id} className="flex items-start gap-4 p-4 rounded-xl"
                style={{ background: 'rgba(8,13,23,0.6)', border: '1px solid #1e2d4a' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(99,102,241,0.15)' }}>
                  <span className="text-primary-light text-sm font-bold">
                    {msg.contact?.name?.charAt(0).toUpperCase() || '?'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-text-primary text-sm font-semibold truncate">
                      {msg.contact?.name || msg.contact?.phone || 'Desconhecido'}
                    </p>
                    <span className="text-text-muted text-xs flex-shrink-0">
                      {format(new Date(msg.createdAt), 'HH:mm')}
                    </span>
                  </div>
                  <p className="text-text-muted text-sm truncate mt-0.5">{msg.textBody}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

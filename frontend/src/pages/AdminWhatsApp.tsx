import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Smartphone, Wifi, WifiOff, RefreshCw, QrCode,
  AlertCircle, CheckCircle, Clock, Users, Shield,
  Activity, UserCircle, Phone
} from 'lucide-react'
import { whatsappApi, usersApi } from '../services/api'
import { User, WhatsAppSession, SessionStatus } from '../types'
import { StatusBadge } from '../components/UI/Badge'
import { PageLoader } from '../components/UI/LoadingSpinner'
import toast from 'react-hot-toast'

interface UserWithSession extends User {
  activeSession?: WhatsAppSession | null
}

function StatusIcon({ status }: { status: SessionStatus }) {
  switch (status) {
    case 'CONNECTED':  return <CheckCircle size={16} className="text-success" />
    case 'WAITING_QR': return <Clock       size={16} className="text-warning" />
    case 'ERROR':      return <AlertCircle size={16} className="text-danger" />
    default:           return <WifiOff     size={16} className="text-text-muted" />
  }
}

export default function AdminWhatsApp() {
  const [users, setUsers] = useState<UserWithSession[]>([])
  const [sessions, setSessions] = useState<(WhatsAppSession & { user?: { id: string; name: string; email: string } })[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<Record<string, boolean>>({})
  const [disconnecting, setDisconnecting] = useState<Record<string, boolean>>({})
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Carrega todos os usuários + sessões ──────────────────────────────────
  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const [usersRes, sessionsRes] = await Promise.all([
        usersApi.findAll(),
        whatsappApi.getAllSessions(),
      ])

      const allUsers: User[] = usersRes.data.data || []
      const allSessions: (WhatsAppSession & { user?: { id: string; name: string; email: string } })[] =
        sessionsRes.data.data || []

      setSessions(allSessions)

      const merged: UserWithSession[] = allUsers.map((u) => {
        const active = allSessions
          .filter((s) => s.userId === u.id && s.status !== 'DISCONNECTED')
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null
        return { ...u, activeSession: active }
      })
      setUsers(merged)
    } catch {
      if (!silent) toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Polling automático quando há sessões aguardando QR ───────────────────
  useEffect(() => {
    const hasWaiting = users.some((u) => u.activeSession?.status === 'WAITING_QR')

    if (hasWaiting) {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => loadData(true), 4000)
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [users, loadData])

  // ── Ações ─────────────────────────────────────────────────────────────────
  const connectUser = async (userId: string) => {
    setConnecting((p) => ({ ...p, [userId]: true }))
    try {
      await whatsappApi.adminConnect(userId)
      toast.success('Iniciando conexão — aguardando QR Code...')
      // Poll imediato após conectar
      setTimeout(() => loadData(true), 2000)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erro ao conectar')
    } finally {
      setConnecting((p) => ({ ...p, [userId]: false }))
    }
  }

  const disconnectSession = async (userId: string, sessionId: string) => {
    setDisconnecting((p) => ({ ...p, [userId]: true }))
    try {
      await whatsappApi.adminDisconnect(sessionId)
      toast.success('Desconectado com sucesso')
      await loadData(true)
    } catch {
      toast.error('Erro ao desconectar')
    } finally {
      setDisconnecting((p) => ({ ...p, [userId]: false }))
    }
  }

  if (loading) return <PageLoader />

  const connectedCount = users.filter((u) => u.activeSession?.status === 'CONNECTED').length
  const waitingCount   = users.filter((u) => u.activeSession?.status === 'WAITING_QR').length

  return (
    <div className="p-8 max-w-5xl animate-fade-in">
      {/* ── Header ── */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">Gerenciar WhatsApp</h1>
        <p className="text-text-muted text-sm mt-1">
          Conecte e gerencie números WhatsApp para cada atendente · Evolution API
        </p>
      </div>

      {/* ── Cards de resumo ── */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { icon: Users,  color: 'rgba(16,185,129,.12)', border: 'rgba(16,185,129,.25)', iconColor: 'text-success', value: users.length,     label: 'Atendentes'  },
          { icon: Wifi,   color: 'rgba(16,185,129,.12)', border: 'rgba(16,185,129,.25)', iconColor: 'text-success', value: connectedCount,  label: 'Conectados'  },
          { icon: QrCode, color: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.25)', iconColor: 'text-warning', value: waitingCount,    label: 'Aguard. QR'  },
        ].map(({ icon: Icon, color, border, iconColor, value, label }) => (
          <div key={label} className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: color, border: `1px solid ${border}` }}>
              <Icon size={18} className={iconColor} />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{value}</p>
              <p className="text-text-muted text-xs">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Info Evolution API ── */}
      <div className="mb-6 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
        style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
        <Shield size={14} className="text-primary-light flex-shrink-0" />
        <p className="text-text-secondary">
          <strong className="text-primary-light">Evolution API v2</strong> — multi-sessão ilimitada. Cada atendente tem seu próprio número de WhatsApp.
        </p>
      </div>

      {/* ── Cards de usuário ── */}
      <div className="space-y-4">
        {users.map((u) => {
          const session   = u.activeSession
          const isConnected = session?.status === 'CONNECTED'
          const isWaiting   = session?.status === 'WAITING_QR'
          const hasSession  = session && session.status !== 'DISCONNECTED'
          const qr = session?.qrCode

          return (
            <div key={u.id} className="rounded-2xl border overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #0f1622 0%, #111827 100%)',
                borderColor: isConnected ? 'rgba(16,185,129,0.25)' : isWaiting ? 'rgba(245,158,11,0.25)' : '#1e2d4a',
              }}>

              {/* Info + botões */}
              <div className="flex items-center gap-4 p-5">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)' }}>
                  <span className="text-white text-lg font-bold">{u.name.charAt(0).toUpperCase()}</span>
                </div>

                {/* Nome + status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-text-primary font-semibold truncate">{u.name}</p>
                    {u.role === 'ADMIN' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold"
                        style={{ background: 'rgba(245,208,107,0.12)', color: '#F5D06B', border: '1px solid rgba(245,208,107,0.25)' }}>
                        <Shield size={9} /> ADMIN
                      </span>
                    )}
                  </div>
                  <p className="text-text-muted text-xs">{u.email}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <StatusIcon status={session?.status || 'DISCONNECTED'} />
                    {!session || session.status === 'DISCONNECTED'
                      ? <span className="text-text-muted text-xs">Desconectado</span>
                      : <StatusBadge status={session.status} />}
                    {isConnected && session?.phoneNumber && (
                      <span className="flex items-center gap-1 text-text-muted text-xs">
                        <Phone size={11} /> {session.phoneNumber}
                      </span>
                    )}
                    {isWaiting && (
                      <span className="text-warning text-xs flex items-center gap-1 animate-pulse">
                        <Activity size={11} /> Aguardando QR...
                      </span>
                    )}
                  </div>
                </div>

                {/* Botões */}
                <div className="flex gap-2 flex-shrink-0">
                  {!hasSession && (
                    <button onClick={() => connectUser(u.id)} disabled={connecting[u.id]}
                      className="btn-primary flex items-center gap-2 text-sm">
                      {connecting[u.id]
                        ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <Wifi size={15} />}
                      Conectar
                    </button>
                  )}
                  {isWaiting && (
                    <button onClick={() => connectUser(u.id)} disabled={connecting[u.id]}
                      className="btn-primary flex items-center gap-2 text-sm">
                      <RefreshCw size={15} /> Novo QR
                    </button>
                  )}
                  {hasSession && (
                    <button onClick={() => disconnectSession(u.id, session!.id)} disabled={disconnecting[u.id]}
                      className="btn-danger flex items-center gap-2 text-sm">
                      {disconnecting[u.id]
                        ? <div className="w-4 h-4 border-2 border-danger/30 border-t-danger rounded-full animate-spin" />
                        : <WifiOff size={15} />}
                      Desconectar
                    </button>
                  )}
                </div>
              </div>

              {/* QR Code */}
              {isWaiting && qr && (
                <div className="border-t px-5 pb-5 pt-4 flex gap-6 items-start"
                  style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.04)' }}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <QrCode size={16} className="text-warning" />
                      <p className="text-warning font-semibold text-sm">Escanear QR Code</p>
                    </div>
                    <p className="text-text-muted text-xs leading-relaxed">
                      Abra o <strong className="text-text-secondary">WhatsApp</strong> no celular de{' '}
                      <strong className="text-text-secondary">{u.name}</strong>, acesse{' '}
                      <em>Menu → Aparelhos conectados → Conectar</em> e escaneie o código ao lado.
                    </p>
                    <div className="flex items-center gap-1.5 mt-3 px-3 py-2 rounded-lg"
                      style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <Activity size={12} className="text-warning" />
                      <span className="text-warning text-xs">QR expira em ~20s — atualizando automaticamente</span>
                    </div>
                  </div>
                  <div className="inline-block p-3 bg-white rounded-2xl shadow-glow-gold flex-shrink-0">
                    <img src={qr} alt="QR Code" className="w-44 h-44" />
                  </div>
                </div>
              )}

              {/* Aguardando QR mas ainda sem imagem */}
              {isWaiting && !qr && (
                <div className="border-t px-5 py-4 flex items-center gap-3"
                  style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.04)' }}>
                  <div className="w-6 h-6 border-2 border-warning/30 border-t-warning rounded-full animate-spin flex-shrink-0" />
                  <p className="text-warning text-sm">Gerando QR Code... aguarde alguns segundos</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Histórico de sessões ── */}
      {sessions.length > 0 && (
        <div className="mt-8">
          <h2 className="text-text-primary font-bold mb-4 flex items-center gap-2">
            <Smartphone size={16} className="text-text-muted" />
            Histórico de Sessões
          </h2>
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Atendente', 'Número', 'Status', 'Criada em'].map((h) => (
                    <th key={h} className="text-left text-text-muted text-xs font-medium p-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 20).map((s) => (
                  <tr key={s.id} className="border-b border-border/50 last:border-0 hover:bg-bg-hover transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <UserCircle size={14} className="text-text-muted" />
                        <span className="text-text-secondary">{s.user?.name || '—'}</span>
                      </div>
                    </td>
                    <td className="p-4 text-text-secondary">
                      {s.phoneNumber || <span className="text-text-muted">—</span>}
                    </td>
                    <td className="p-4"><StatusBadge status={s.status} /></td>
                    <td className="p-4 text-text-muted text-xs">
                      {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

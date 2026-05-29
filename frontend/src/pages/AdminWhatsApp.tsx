import { useState, useEffect, useCallback } from 'react'
import {
  Smartphone, Wifi, WifiOff, RefreshCw, QrCode,
  AlertCircle, CheckCircle, Clock, Users, Shield,
  Activity, UserCircle, Phone
} from 'lucide-react'
import { whatsappApi, usersApi } from '../services/api'
import { getSocket } from '../services/socket'
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

function SessionStatusLabel({ status }: { status?: SessionStatus }) {
  if (!status || status === 'DISCONNECTED') return <span className="text-text-muted text-xs">Desconectado</span>
  return <StatusBadge status={status} />
}

export default function AdminWhatsApp() {
  const [users, setUsers] = useState<UserWithSession[]>([])
  const [sessions, setSessions] = useState<(WhatsAppSession & { user?: { id: string; name: string; email: string } })[]>([])
  const [loading, setLoading] = useState(true)

  // QR display per user
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({})
  const [connecting, setConnecting] = useState<Record<string, boolean>>({})
  const [disconnecting, setDisconnecting] = useState<Record<string, boolean>>({})
  const [pollingUsers, setPollingUsers] = useState<Set<string>>(new Set())

  const loadData = useCallback(async () => {
    try {
      const [usersRes, sessionsRes] = await Promise.all([
        usersApi.findAll(),
        whatsappApi.getAllSessions(),
      ])

      const allUsers: User[] = usersRes.data.data || []
      const allSessions: (WhatsAppSession & { user?: { id: string; name: string; email: string } })[] =
        sessionsRes.data.data || []

      setSessions(allSessions)

      // Match active sessions to users
      const merged: UserWithSession[] = allUsers.map((u) => {
        const activeSessions = allSessions.filter(
          (s) => s.userId === u.id && s.status !== 'DISCONNECTED'
        )
        // Pick the most recent active session
        const activeSession = activeSessions.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0] || null
        return { ...u, activeSession }
      })

      setUsers(merged)
    } catch {
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Listen for status changes via socket
  useEffect(() => {
    const socket = getSocket()
    socket.on('whatsapp-status', (data: {
      sessionId: string; status: SessionStatus; phoneNumber?: string; qrCode?: string
    }) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === data.sessionId
            ? { ...s, status: data.status, phoneNumber: data.phoneNumber, qrCode: data.qrCode }
            : s
        )
      )
      setUsers((prev) =>
        prev.map((u) => {
          if (u.activeSession?.id === data.sessionId) {
            return {
              ...u,
              activeSession: {
                ...u.activeSession!,
                status: data.status,
                phoneNumber: data.phoneNumber,
                qrCode: data.qrCode,
              },
            }
          }
          return u
        })
      )
      if (data.qrCode) {
        setQrCodes((prev) => {
          // find userId for this session
          const userId = sessions.find((s) => s.id === data.sessionId)?.userId
          if (userId) return { ...prev, [userId]: data.qrCode! }
          return prev
        })
      }
      if (data.status === 'CONNECTED') {
        toast.success('WhatsApp conectado com sucesso!')
        // Reload to get updated phone number
        loadData()
      }
    })
    return () => { socket.off('whatsapp-status') }
  }, [sessions, loadData])

  // Poll QR codes for users in WAITING_QR
  useEffect(() => {
    const waitingUsers = users.filter((u) => u.activeSession?.status === 'WAITING_QR')
    if (waitingUsers.length === 0) return

    const fetchQR = async (userId: string, sessionId: string) => {
      try {
        const res = await whatsappApi.getQRCode()
        if (res.data.data?.qrCode) {
          setQrCodes((prev) => ({ ...prev, [userId]: res.data.data.qrCode }))
        }
        void sessionId
      } catch { /* ignore */ }
    }

    const intervals = waitingUsers.map((u) => {
      fetchQR(u.id, u.activeSession!.id)
      return setInterval(() => fetchQR(u.id, u.activeSession!.id), 8000)
    })

    return () => intervals.forEach(clearInterval)
  }, [users])

  const connectUser = async (userId: string) => {
    setConnecting((p) => ({ ...p, [userId]: true }))
    try {
      const res = await whatsappApi.adminConnect(userId)
      const newSession = res.data.data?.session
      if (newSession) {
        setUsers((prev) =>
          prev.map((u) => u.id === userId ? { ...u, activeSession: newSession } : u)
        )
      }
      toast.success('Iniciando conexão...')
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
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, activeSession: u.activeSession ? { ...u.activeSession, status: 'DISCONNECTED' as SessionStatus } : null }
            : u
        )
      )
      setQrCodes((p) => { const n = { ...p }; delete n[userId]; return n })
      toast.success('Desconectado com sucesso')
    } catch {
      toast.error('Erro ao desconectar')
    } finally {
      setDisconnecting((p) => ({ ...p, [userId]: false }))
    }
  }

  void pollingUsers
  void setPollingUsers

  if (loading) return <PageLoader />

  const connectedCount = users.filter((u) => u.activeSession?.status === 'CONNECTED').length
  const waitingCount = users.filter((u) => u.activeSession?.status === 'WAITING_QR').length

  return (
    <div className="p-8 max-w-5xl animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">
          Gerenciar WhatsApp
        </h1>
        <p className="text-text-muted text-sm mt-1">
          Conecte e gerencie números WhatsApp para cada atendente
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <Users size={18} className="text-success" />
          </div>
          <div>
            <p className="text-2xl font-bold text-text-primary">{users.length}</p>
            <p className="text-text-muted text-xs">Atendentes</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <Wifi size={18} className="text-success" />
          </div>
          <div>
            <p className="text-2xl font-bold text-text-primary">{connectedCount}</p>
            <p className="text-text-muted text-xs">Conectados</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <QrCode size={18} className="text-warning" />
          </div>
          <div>
            <p className="text-2xl font-bold text-text-primary">{waitingCount}</p>
            <p className="text-text-muted text-xs">Aguardando QR</p>
          </div>
        </div>
      </div>

      {/* Note: WAHA free tier */}
      <div className="mb-6 px-4 py-3 rounded-xl text-sm flex items-center gap-2"
        style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
        <Shield size={14} className="text-primary-light flex-shrink-0" />
        <p className="text-text-secondary">
          <strong className="text-primary-light">WAHA Free Tier:</strong> suporta apenas 1 sessão simultânea (compartilhada entre todos os atendentes). Para múltiplos números simultâneos, faça upgrade para WAHA Plus.
        </p>
      </div>

      {/* User cards */}
      <div className="space-y-4">
        {users.map((u) => {
          const session = u.activeSession
          const isConnected = session?.status === 'CONNECTED'
          const isWaiting = session?.status === 'WAITING_QR'
          const hasSession = session && session.status !== 'DISCONNECTED'
          const qr = qrCodes[u.id] || session?.qrCode

          return (
            <div
              key={u.id}
              className="rounded-2xl border overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #0f1622 0%, #111827 100%)',
                borderColor: isConnected
                  ? 'rgba(16,185,129,0.25)'
                  : isWaiting
                  ? 'rgba(245,158,11,0.25)'
                  : '#1e2d4a',
              }}
            >
              <div className="flex items-center gap-4 p-5">
                {/* Avatar */}
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)' }}>
                  <span className="text-white text-lg font-bold">
                    {u.name.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* User info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-text-primary font-semibold truncate">{u.name}</p>
                    {u.role === 'ADMIN' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold"
                        style={{ background: 'rgba(245,208,107,0.12)', color: '#F5D06B', border: '1px solid rgba(245,208,107,0.25)' }}>
                        <Shield size={9} />
                        ADMIN
                      </span>
                    )}
                  </div>
                  <p className="text-text-muted text-xs">{u.email}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <StatusIcon status={session?.status || 'DISCONNECTED'} />
                    <SessionStatusLabel status={session?.status} />
                    {isConnected && session?.phoneNumber && (
                      <span className="flex items-center gap-1 text-text-muted text-xs">
                        <Phone size={11} />
                        {session.phoneNumber}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                  {!hasSession && (
                    <button
                      onClick={() => connectUser(u.id)}
                      disabled={connecting[u.id]}
                      className="btn-primary flex items-center gap-2 text-sm"
                    >
                      {connecting[u.id]
                        ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <Wifi size={15} />}
                      Conectar
                    </button>
                  )}
                  {isWaiting && (
                    <button
                      onClick={() => connectUser(u.id)}
                      disabled={connecting[u.id]}
                      className="btn-primary flex items-center gap-2 text-sm"
                    >
                      <RefreshCw size={15} />
                      Novo QR
                    </button>
                  )}
                  {hasSession && (
                    <button
                      onClick={() => disconnectSession(u.id, session!.id)}
                      disabled={disconnecting[u.id]}
                      className="btn-danger flex items-center gap-2 text-sm"
                    >
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
                      Abra o <strong className="text-text-secondary">WhatsApp</strong> no celular de <strong className="text-text-secondary">{u.name}</strong>, acesse <em>Menu → Aparelhos conectados → Conectar</em> e escaneie o código ao lado.
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
            </div>
          )
        })}
      </div>

      {/* All sessions table (collapsed view) */}
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
                  <th className="text-left text-text-muted text-xs font-medium p-4">Atendente</th>
                  <th className="text-left text-text-muted text-xs font-medium p-4">Número</th>
                  <th className="text-left text-text-muted text-xs font-medium p-4">Status</th>
                  <th className="text-left text-text-muted text-xs font-medium p-4">Criada em</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 10).map((s) => (
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
                    <td className="p-4">
                      <StatusBadge status={s.status} />
                    </td>
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

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { rouletteApi, usersApi, whatsappApi } from '../services/api'
import { getSocket } from '../services/socket'
import { User } from '../types'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import Modal from '../components/UI/Modal'
import { StatusBadge } from '../components/UI/Badge'
import {
  Users as UsersIcon, AlertTriangle, Phone, Smartphone, Loader2,
  ToggleLeft, ToggleRight, ArrowRightLeft, ExternalLink, Award,
} from 'lucide-react'

interface SessionInfo {
  id: string
  status: 'CONNECTED' | 'DISCONNECTED' | 'WAITING_QR' | 'ERROR'
  phoneNumber?: string
  disconnectedAt?: string
}

interface SellerOverview {
  userId: string
  name: string
  email: string
  isActive: boolean
  weight: number
  leadsToday: number
  leadsTotal: number
  lastLeadAt: string | null
  manualOutreach: boolean
  teams: { teamId: string; teamName: string; teamColor: string }[]
  sessions: SessionInfo[]
  hasConnected: boolean
  disconnectedSince: string | null
  atRisk: boolean
}

export default function AdminSellers() {
  const navigate = useNavigate()
  const [sellers, setSellers] = useState<SellerOverview[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  // Modal: reatribuir número
  const [reassignSession, setReassignSession] = useState<{ sessionId: string; sellerName: string } | null>(null)
  const [reassignTarget, setReassignTarget] = useState('')
  const [reassigning, setReassigning] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await rouletteApi.getOverview()
      setSellers(res.data.data)
    } catch {
      toast.error('Erro ao carregar vendedores')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    usersApi.findAll().then((res) => setUsers(res.data.data.filter((u: User) => u.isActive))).catch(() => {})
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    const socket = getSocket()
    const refresh = () => load()
    socket.on('whatsapp-status', refresh)
    socket.on('roulette-status-update', refresh)
    return () => {
      socket.off('whatsapp-status', refresh)
      socket.off('roulette-status-update', refresh)
    }
  }, [load])

  async function toggleActive(seller: SellerOverview) {
    setBusyUserId(seller.userId)
    try {
      await rouletteApi.setActive(seller.userId, !seller.isActive)
      toast.success(!seller.isActive ? 'Vendedor ativado na roleta' : 'Vendedor desativado da roleta')
      load()
    } catch {
      toast.error('Erro ao atualizar status')
    } finally {
      setBusyUserId(null)
    }
  }

  async function toggleManualOutreach(seller: SellerOverview) {
    setBusyUserId(seller.userId)
    try {
      await rouletteApi.setManualOutreach(seller.userId, !seller.manualOutreach)
      toast.success(!seller.manualOutreach
        ? 'Abordagem manual ativada — robô só avisa, vendedor chama pelo celular'
        : 'Abordagem manual desativada — volta ao envio automático')
      load()
    } catch {
      toast.error('Erro ao atualizar abordagem manual')
    } finally {
      setBusyUserId(null)
    }
  }

  function openReassign(sessionId: string, sellerName: string) {
    setReassignSession({ sessionId, sellerName })
    setReassignTarget('')
  }

  async function confirmReassign() {
    if (!reassignSession || !reassignTarget) { toast.error('Escolha o vendedor de destino'); return }
    setReassigning(true)
    try {
      await whatsappApi.adminAssignSession(reassignSession.sessionId, reassignTarget)
      toast.success('Número reatribuído!')
      setReassignSession(null)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao reatribuir número')
    } finally {
      setReassigning(false)
    }
  }

  const atRiskSellers = sellers.filter((s) => s.atRisk)

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <UsersIcon size={22} className="text-primary" /> Central de Vendedores
        </h1>
        <p className="text-sm text-text-muted mt-0.5">
          Roleta + conexão WhatsApp num só lugar — quem está ativo, quem está sem número, e reatribua rápido.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={28} /></div>
      ) : (
        <>
          {atRiskSellers.length > 0 && (
            <div className="card p-4" style={{ borderColor: 'rgba(239,68,68,.4)', background: 'rgba(239,68,68,.06)' }}>
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-bold text-danger text-sm">
                    {atRiskSellers.length} vendedor{atRiskSellers.length > 1 ? 'es' : ''} ativo{atRiskSellers.length > 1 ? 's' : ''} na roleta SEM número conectado
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    {atRiskSellers.map((s) => s.name).join(', ')} — vão continuar recebendo leads que não vão conseguir entregar até reconectar ou serem desativados.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {sellers.map((seller) => {
              const primarySession = seller.sessions.find((s) => s.status === 'CONNECTED') || seller.sessions[0]
              return (
                <div key={seller.userId} className={`card p-4 ${seller.atRisk ? 'border-danger/40' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    {/* Identidade + status */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-text-primary">{seller.name}</p>
                        {seller.atRisk && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-danger/15 text-danger flex items-center gap-1">
                            <AlertTriangle size={10} /> Risco
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted">{seller.email}</p>

                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {primarySession ? (
                          <>
                            <StatusBadge status={primarySession.status} />
                            {primarySession.phoneNumber && (
                              <span className="text-xs text-text-muted flex items-center gap-1">
                                <Phone size={11} /> +{primarySession.phoneNumber}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-bg-hover text-text-muted">
                            Nenhum número conectado
                          </span>
                        )}
                        {!seller.hasConnected && seller.disconnectedSince && (
                          <span className="text-xs text-danger">
                            offline há {formatDistanceToNow(new Date(seller.disconnectedSince), { locale: ptBR })}
                          </span>
                        )}
                      </div>

                      {seller.teams.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {seller.teams.map((t) => (
                            <span key={t.teamId} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ background: `${t.teamColor}22`, color: t.teamColor }}>
                              {t.teamName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Leads */}
                    <div className="text-center flex-shrink-0">
                      <p className="text-lg font-bold text-text-primary">{seller.leadsToday}</p>
                      <p className="text-[10px] text-text-muted">hoje</p>
                      <p className="text-xs text-text-muted mt-1 flex items-center gap-1 justify-center">
                        <Award size={10} /> {seller.leadsTotal} total
                      </p>
                    </div>

                    {/* Ações */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleActive(seller)}
                        disabled={busyUserId === seller.userId}
                        className="flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
                        title="Ativo na roleta"
                      >
                        {seller.isActive
                          ? <ToggleRight size={22} className="text-success" />
                          : <ToggleLeft size={22} className="text-text-muted" />}
                        <span className={seller.isActive ? 'text-success' : 'text-text-muted'}>
                          {seller.isActive ? 'Na roleta' : 'Fora da roleta'}
                        </span>
                      </button>

                      <button
                        onClick={() => toggleManualOutreach(seller)}
                        disabled={busyUserId === seller.userId}
                        className="flex items-center gap-1.5 text-xs disabled:opacity-50"
                        title="Chip frágil: robô só avisa, vendedor chama pelo celular"
                      >
                        {seller.manualOutreach
                          ? <ToggleRight size={18} className="text-warning" />
                          : <ToggleLeft size={18} className="text-text-muted" />}
                        <span className={seller.manualOutreach ? 'text-warning' : 'text-text-muted'}>
                          Abordagem manual
                        </span>
                      </button>

                      <div className="flex items-center gap-1 mt-1">
                        {primarySession && (
                          <button
                            onClick={() => openReassign(primarySession.id, seller.name)}
                            className="text-xs px-2 py-1 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 flex items-center gap-1"
                          >
                            <ArrowRightLeft size={12} /> Reatribuir
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/admin/whatsapp?userId=${seller.userId}`)}
                          className="text-xs px-2 py-1 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 flex items-center gap-1"
                        >
                          <Smartphone size={12} /> Conectar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <button
            onClick={() => navigate('/roulette?tab=teams')}
            className="btn-ghost border border-border flex items-center gap-2 text-sm"
          >
            <ExternalLink size={14} /> Editar times e cidades →
          </button>
        </>
      )}

      {/* Modal: reatribuir número */}
      <Modal
        isOpen={!!reassignSession}
        onClose={() => setReassignSession(null)}
        title="Reatribuir número"
        size="sm"
      >
        <p className="text-xs text-text-muted mb-4">
          O número de <b className="text-text-secondary">{reassignSession?.sellerName}</b> passa a
          pertencer a outro vendedor. As conversas em andamento continuam vinculadas à mesma sessão.
        </p>
        <label className="text-sm text-text-muted">Reatribuir para *</label>
        <select className="input w-full mt-1" value={reassignTarget} onChange={(e) => setReassignTarget(e.target.value)}>
          <option value="">Selecione...</option>
          {users.filter((u) => u.name !== reassignSession?.sellerName).map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <div className="flex gap-2 mt-5">
          <button className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={confirmReassign} disabled={reassigning}>
            {reassigning ? <><Loader2 size={16} className="animate-spin" /> Reatribuindo...</> : 'Confirmar'}
          </button>
          <button className="btn-ghost flex-1 border border-border" onClick={() => setReassignSession(null)}>Cancelar</button>
        </div>
      </Modal>
    </div>
  )
}

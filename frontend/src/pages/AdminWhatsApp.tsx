import { useState, useEffect, useRef, useCallback } from 'react'
import { whatsappApi, usersApi } from '../services/api'
import { getSocket } from '../services/socket'
import { WhatsAppSession, User, SessionStatus } from '../types'
import toast from 'react-hot-toast'
import {
  Smartphone, Plus, Trash2, CheckCircle, X, Phone, Loader2, QrCode, RefreshCw,
  User as UserIcon, Link as LinkIcon, Copy
} from 'lucide-react'

type SessionWithUser = WhatsAppSession & { user?: { id: string; name: string; email: string } }

const STATUS_LABEL: Record<SessionStatus, string> = {
  CONNECTED: 'Conectado',
  WAITING_QR: 'Aguardando QR',
  DISCONNECTED: 'Desconectado',
  ERROR: 'Erro',
}

export default function AdminWhatsApp() {
  const [sessions, setSessions] = useState<SessionWithUser[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  // Fluxo de conexão (QR)
  const [showPicker, setShowPicker] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [qrSession, setQrSession] = useState<{ id: string; userName: string; qrCode?: string } | null>(null)

  // Link público de conexão (mandar pro atendente conectar sozinho)
  const [linking, setLinking] = useState(false)
  const [cleanLink, setCleanLink] = useState(false)  // link sem marca (só o QR)
  const [linkResult, setLinkResult] = useState<{ url: string; userName: string } | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadSessions = useCallback(async () => {
    try {
      const res = await whatsappApi.getAllSessions()
      setSessions(res.data.data)
      return res.data.data as SessionWithUser[]
    } catch {
      toast.error('Erro ao carregar conexões')
      return [] as SessionWithUser[]
    }
  }, [])

  async function loadUsers() {
    try {
      const res = await usersApi.findAll()
      setUsers(res.data.data.filter((u: User) => u.isActive))
    } catch { /* silencioso */ }
  }

  useEffect(() => {
    Promise.all([loadSessions(), loadUsers()]).finally(() => setLoading(false))
  }, [loadSessions])

  // Socket: conexão concluída
  useEffect(() => {
    const socket = getSocket()
    const onStatus = (data: { sessionId: string; status: SessionStatus }) => {
      if (data.status === 'CONNECTED') {
        loadSessions()
        setQrSession((cur) => {
          if (cur && cur.id === data.sessionId) {
            toast.success('Número conectado com sucesso! 🎉')
            return null
          }
          return cur
        })
      }
    }
    socket.on('whatsapp-status', onStatus)
    return () => { socket.off('whatsapp-status', onStatus) }
  }, [loadSessions])

  // Polling enquanto o QR está aberto: atualiza QR e detecta conexão
  useEffect(() => {
    if (!qrSession) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    pollRef.current = setInterval(async () => {
      const list = await loadSessions()
      const s = list.find((x) => x.id === qrSession.id)
      if (!s) return
      if (s.status === 'CONNECTED') {
        toast.success('Número conectado com sucesso! 🎉')
        setQrSession(null)
        return
      }
      if (s.qrCode && s.qrCode !== qrSession.qrCode) {
        setQrSession((cur) => cur ? { ...cur, qrCode: s.qrCode } : cur)
      }
    }, 4000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [qrSession, loadSessions])

  async function startConnect() {
    if (!selectedUserId) { toast.error('Escolha um atendente para vincular o número'); return }
    setConnecting(true)
    try {
      const res = await whatsappApi.adminConnect(selectedUserId)
      const data = res.data.data as { session: WhatsAppSession; status: { qrCode?: string } }
      const userName = users.find((u) => u.id === selectedUserId)?.name || 'Atendente'
      setShowPicker(false)
      setSelectedUserId('')
      setQrSession({ id: data.session.id, userName, qrCode: data.status?.qrCode })
      loadSessions()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao iniciar conexão')
    } finally { setConnecting(false) }
  }

  async function remove(s: SessionWithUser) {
    if (!confirm(`Desconectar/remover o número de ${s.user?.name || 'usuário'}?`)) return
    try {
      await whatsappApi.adminDisconnect(s.id)
      toast.success('Número desconectado')
      loadSessions()
    } catch { toast.error('Erro ao remover') }
  }

  async function genConnectLink() {
    if (!selectedUserId) { toast.error('Escolha um atendente'); return }
    setLinking(true)
    try {
      const res = await whatsappApi.createConnectLink(selectedUserId)
      const { url, userName } = res.data.data
      setShowPicker(false)
      setSelectedUserId('')
      // ?s=1 = página sem marca, só o QR
      setLinkResult({ url: cleanLink ? `${url}?s=1` : url, userName })
      loadSessions()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao gerar link')
    } finally {
      setLinking(false)
    }
  }

  async function copyLink() {
    if (!linkResult) return
    try {
      await navigator.clipboard.writeText(linkResult.url)
      toast.success('Link copiado!')
    } catch {
      toast.error('Não consegui copiar — selecione e copie manualmente')
    }
  }

  async function reconnect(s: SessionWithUser) {
    // Reabre o QR de uma sessão existente que está aguardando
    setQrSession({ id: s.id, userName: s.user?.name || 'Atendente', qrCode: s.qrCode })
    loadSessions()
  }

  const activeSessions = sessions.filter((s) => s.status !== 'DISCONNECTED')

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Smartphone size={22} className="text-primary" /> Central de Números
          </h1>
          <p className="text-sm text-text-muted mt-0.5">Conecte números de WhatsApp via QR Code (Evolution)</p>
        </div>
        <button onClick={() => { setShowPicker(true); loadUsers() }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Conectar número
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={28} /></div>
      ) : activeSessions.length === 0 ? (
        <div className="card p-12 text-center text-text-muted">
          <QrCode size={40} className="mx-auto mb-3 opacity-30" />
          <p className="mb-1">Nenhum número conectado ainda</p>
          <p className="text-xs">Clique em "Conectar número", escolha o atendente e escaneie o QR Code</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeSessions.map((s) => {
            const connected = s.status === 'CONNECTED'
            const waiting = s.status === 'WAITING_QR'
            return (
              <div key={s.id} className="card p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${connected ? 'bg-success/15' : 'bg-warning/15'}`}>
                    <Phone size={18} className={connected ? 'text-success' : 'text-warning'} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-text-primary truncate flex items-center gap-1.5">
                        <UserIcon size={13} className="text-text-muted" />
                        {s.user?.name || 'Sem usuário'}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${connected ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
                        {STATUS_LABEL[s.status]}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted">
                      {s.phoneNumber ? `+${s.phoneNumber}` : (waiting ? 'Escaneie o QR para conectar' : '—')}
                      {s.provider ? ` · ${s.provider}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {waiting && (
                    <button onClick={() => reconnect(s)} className="text-xs px-2 py-1 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 flex items-center gap-1" title="Mostrar QR">
                      <QrCode size={14} /> Ver QR
                    </button>
                  )}
                  <button onClick={() => remove(s)} className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10" title="Desconectar">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: link público gerado */}
      {linkResult && (
        <div className="modal-overlay" onClick={() => setLinkResult(null)}>
          <div className="modal-panel max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <LinkIcon size={18} className="text-primary" /> Link para {linkResult.userName}
              </h3>
              <button onClick={() => setLinkResult(null)} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
            </div>
            <p className="text-xs text-text-muted mb-4">
              Mande este link para <b>{linkResult.userName}</b>. Ela abre, escaneia o QR e o WhatsApp
              conecta — <b>sem precisar de login</b>. Válido por 24h.
            </p>

            <div className="flex gap-2">
              <input readOnly value={linkResult.url} onFocus={(e) => e.currentTarget.select()}
                className="input flex-1 text-xs font-mono" />
              <button onClick={copyLink} className="btn-primary px-3 flex items-center gap-1.5">
                <Copy size={14} /> Copiar
              </button>
            </div>

            <div className="flex items-start gap-2 rounded-xl p-3 mt-4"
              style={{ background: 'rgba(234,179,8,.08)', border: '1px solid rgba(234,179,8,.25)' }}>
              <Smartphone size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Avise que o link deve ser aberto <b>no computador</b> — não dá pra escanear o QR
                pelo mesmo celular que está com a tela aberta.
              </p>
            </div>

            <button className="btn-ghost w-full border border-border mt-4" onClick={() => setLinkResult(null)}>Fechar</button>
          </div>
        </div>
      )}

      {/* Modal: escolher atendente */}
      {showPicker && (
        <div className="modal-overlay" onClick={() => setShowPicker(false)}>
          <div className="modal-panel max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <Plus size={18} className="text-primary" /> Conectar número
              </h3>
              <button onClick={() => setShowPicker(false)} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
            </div>
            <p className="text-xs text-text-muted mb-4">
              Escolha o atendente dono do número. Depois: <b>Gerar QR</b> pra escanear aqui,
              ou <b>Gerar link</b> pra mandar pro atendente conectar sozinho.
            </p>
            <div>
              <label className="text-sm text-text-muted">Atendente / dono do número *</label>
              <select className="input w-full mt-1" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                <option value="">Selecione...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role === 'ADMIN' ? 'Admin' : 'Atendente'})</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none mt-3">
              <input type="checkbox" checked={cleanLink} onChange={(e) => setCleanLink(e.target.checked)}
                className="w-4 h-4 rounded accent-primary" />
              <span className="text-xs text-text-primary">
                Link <b>sem marca</b> <span className="text-text-muted">(só o QR, não identifica a empresa)</span>
              </span>
            </label>

            <div className="flex gap-2 mt-5">
              <button className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={startConnect} disabled={connecting || linking}>
                {connecting ? <><Loader2 size={16} className="animate-spin" /> Gerando QR...</> : <><QrCode size={16} /> Gerar QR aqui</>}
              </button>
              <button className="btn-ghost flex-1 border border-border flex items-center justify-center gap-2" onClick={genConnectLink} disabled={connecting || linking}>
                {linking ? <><Loader2 size={16} className="animate-spin" /> Gerando...</> : <><LinkIcon size={16} /> Gerar link</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: QR Code */}
      {qrSession && (
        <div className="modal-overlay" onClick={() => setQrSession(null)}>
          <div className="modal-panel max-w-md p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <QrCode size={18} className="text-primary" /> Escaneie o QR Code
              </h3>
              <button onClick={() => setQrSession(null)} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
            </div>
            <p className="text-xs text-text-muted mb-4">
              Número de <b className="text-text-secondary">{qrSession.userName}</b> · No celular: WhatsApp → <b>Dispositivos conectados</b> → <b>Conectar dispositivo</b>
            </p>

            <div className="bg-white rounded-2xl p-4 inline-block mx-auto">
              {qrSession.qrCode ? (
                <img src={qrSession.qrCode} alt="QR Code WhatsApp" className="w-60 h-60 object-contain" />
              ) : (
                <div className="w-60 h-60 flex flex-col items-center justify-center text-gray-400">
                  <Loader2 size={32} className="animate-spin mb-2" />
                  <span className="text-xs">Gerando QR...</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-text-muted">
              <RefreshCw size={12} className="animate-spin" style={{ animationDuration: '3s' }} />
              O QR renova sozinho. Aguardando você escanear...
            </div>

            <button className="btn-ghost w-full mt-4 border border-border" onClick={() => setQrSession(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

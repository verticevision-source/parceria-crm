import { useState, useEffect, useCallback } from 'react'
import {
  Smartphone, Wifi, WifiOff, RefreshCw, QrCode,
  AlertCircle, CheckCircle, Clock, Zap, Activity
} from 'lucide-react'
import { whatsappApi } from '../services/api'
import { getSocket } from '../services/socket'
import { WhatsAppSession, SessionStatus } from '../types'
import { StatusBadge } from '../components/UI/Badge'
import { PageLoader } from '../components/UI/LoadingSpinner'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

function StatusIcon({ status }: { status: SessionStatus }) {
  switch (status) {
    case 'CONNECTED':  return <CheckCircle size={20} className="text-success" />
    case 'WAITING_QR': return <Clock       size={20} className="text-warning" />
    case 'ERROR':      return <AlertCircle size={20} className="text-danger" />
    default:           return <WifiOff     size={20} className="text-text-muted" />
  }
}

export default function WhatsAppConfig() {
  const { user } = useAuth()
  const [session,        setSession]        = useState<WhatsAppSession | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [connecting,     setConnecting]     = useState(false)
  const [disconnecting,  setDisconnecting]  = useState(false)
  const [simulateForm,   setSimulateForm]   = useState({ from: '', body: '' })
  const [simulating,     setSimulating]     = useState(false)

  const loadSession = useCallback(async () => {
    try {
      const res = await whatsappApi.getSession()
      setSession(res.data.data)
    } catch { setSession(null) }
    finally  { setLoading(false) }
  }, [])

  useEffect(() => { loadSession() }, [loadSession])

  // Poll for QR code while waiting (WAHA generates it dynamically)
  useEffect(() => {
    if (session?.status !== 'WAITING_QR') return
    const fetchQR = async () => {
      try {
        const res = await whatsappApi.getQRCode()
        if (res.data.data?.qrCode) {
          setSession(prev => prev ? { ...prev, qrCode: res.data.data.qrCode } : prev)
        }
      } catch { /* ignore */ }
    }
    fetchQR()
    const interval = setInterval(fetchQR, 8000)
    return () => clearInterval(interval)
  }, [session?.status])

  useEffect(() => {
    const socket = getSocket()
    socket.on('whatsapp-status', (data: {
      sessionId: string; status: SessionStatus; phoneNumber?: string; qrCode?: string
    }) => {
      setSession((prev) => prev
        ? { ...prev, status: data.status, phoneNumber: data.phoneNumber, qrCode: data.qrCode }
        : null
      )
      if (data.status === 'CONNECTED') toast.success('WhatsApp conectado com sucesso!')
    })
    return () => { socket.off('whatsapp-status') }
  }, [])

  const connect = async () => {
    setConnecting(true)
    try {
      const res = await whatsappApi.connect()
      setSession(res.data.data.session)
      toast.success('Aguardando leitura do QR Code...')
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao conectar')
    } finally { setConnecting(false) }
  }

  const disconnect = async () => {
    setDisconnecting(true)
    try {
      await whatsappApi.disconnect()
      setSession((prev) => prev ? { ...prev, status: 'DISCONNECTED', qrCode: undefined } : null)
      toast.success('WhatsApp desconectado')
    } catch { toast.error('Erro ao desconectar') }
    finally { setDisconnecting(false) }
  }

  const simulate = async () => {
    if (!session || !simulateForm.from || !simulateForm.body) { toast.error('Preencha todos os campos'); return }
    setSimulating(true)
    try {
      await whatsappApi.simulate(session.id, simulateForm.from, simulateForm.body)
      toast.success('Mensagem simulada enviada!')
      setSimulateForm({ from: '', body: '' })
    } catch { toast.error('Erro ao simular mensagem') }
    finally { setSimulating(false) }
  }

  if (loading) return <PageLoader />

  const isConnected  = session?.status === 'CONNECTED'
  const isWaitingQR  = session?.status === 'WAITING_QR'
  const hasSession   = session && session.status !== 'DISCONNECTED'

  return (
    <div className="p-8 max-w-2xl animate-fade-in">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">WhatsApp</h1>
        <p className="text-text-muted text-sm mt-1">
          {user?.name} — conecte seu número para atendimento
        </p>
      </div>

      {/* Status Card */}
      <div
        className="rounded-2xl p-6 mb-6 border"
        style={{
          background: 'linear-gradient(135deg, #0f1622 0%, #111827 100%)',
          borderColor: isConnected ? 'rgba(16,185,129,0.3)' : isWaitingQR ? 'rgba(245,158,11,0.3)' : '#1e2d4a',
          boxShadow: isConnected
            ? '0 4px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(16,185,129,0.1)'
            : '0 4px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: isConnected
                  ? 'rgba(16,185,129,0.1)'
                  : isWaitingQR
                  ? 'rgba(245,158,11,0.1)'
                  : 'rgba(15,22,34,0.8)',
                border: '1px solid',
                borderColor: isConnected
                  ? 'rgba(16,185,129,0.25)'
                  : isWaitingQR
                  ? 'rgba(245,158,11,0.25)'
                  : '#1e2d4a',
              }}
            >
              <Smartphone size={28} style={{
                color: isConnected ? '#34d399' : isWaitingQR ? '#fbbf24' : '#4a6080',
              }} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <StatusIcon status={session?.status || 'DISCONNECTED'} />
                <h2 className="text-text-primary font-bold text-lg">
                  {isConnected ? 'Conectado' : isWaitingQR ? 'Aguardando QR Code' : 'Desconectado'}
                </h2>
              </div>
              {isConnected && session?.phoneNumber && (
                <p className="text-text-muted text-sm">Número: {session.phoneNumber}</p>
              )}
              {session && <div className="mt-1"><StatusBadge status={session.status} /></div>}
            </div>
          </div>

          <div className="flex gap-2">
            {!hasSession && (
              <button onClick={connect} disabled={connecting} className="btn-primary flex items-center gap-2 text-sm">
                {connecting
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Wifi size={16} />}
                Conectar
              </button>
            )}
            {isWaitingQR && (
              <button onClick={connect} disabled={connecting} className="btn-primary flex items-center gap-2 text-sm">
                <RefreshCw size={16} />
                Novo QR
              </button>
            )}
            {hasSession && (
              <button onClick={disconnect} disabled={disconnecting} className="btn-danger flex items-center gap-2 text-sm">
                {disconnecting
                  ? <div className="w-4 h-4 border-2 border-danger/30 border-t-danger rounded-full animate-spin" />
                  : <WifiOff size={16} />}
                Desconectar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* QR Code */}
      {isWaitingQR && session?.qrCode && (
        <div className="card mb-6 text-center">
          <div className="flex items-center gap-2 justify-center mb-3">
            <QrCode size={20} className="text-warning" />
            <h3 className="text-text-primary font-bold">Escaneie o QR Code</h3>
          </div>
          <p className="text-text-muted text-sm mb-6">
            WhatsApp → Menu → Aparelhos conectados → Conectar aparelho
          </p>
          <div className="inline-block p-4 bg-white rounded-2xl shadow-glow-gold">
            <img src={session.qrCode} alt="QR Code WhatsApp" className="w-56 h-56" />
          </div>
          <div className="mt-5 px-4 py-3 rounded-xl text-left"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p className="text-warning text-sm font-semibold flex items-center gap-2">
              <Activity size={14} /> O QR Code expira em ~20 segundos
            </p>
            <p className="text-text-muted text-xs mt-1">
              Se expirar, clique em "Novo QR" para gerar um novo código.
            </p>
          </div>
        </div>
      )}

      {/* Simulador */}
      {isConnected && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-gold" />
              <h3 className="text-text-primary font-bold">Simular Mensagem Recebida</h3>
            </div>
            <span className="badge bg-warning-muted text-warning border border-warning/20 text-xs">DEV</span>
          </div>
          <p className="text-text-muted text-sm mb-5">
            Testa o fluxo completo: recebimento → banco → Socket.IO → interface.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">De (número)</label>
              <input
                value={simulateForm.from}
                onChange={(e) => setSimulateForm({ ...simulateForm, from: e.target.value })}
                placeholder="5511999999999"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Mensagem</label>
              <input
                value={simulateForm.body}
                onChange={(e) => setSimulateForm({ ...simulateForm, body: e.target.value })}
                placeholder="Olá, gostaria de mais informações!"
                className="input-field"
              />
            </div>
            <button onClick={simulate} disabled={simulating} className="btn-gold w-full flex items-center justify-center gap-2 text-sm font-bold">
              {simulating
                ? <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                : <Zap size={15} />}
              Simular Mensagem
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

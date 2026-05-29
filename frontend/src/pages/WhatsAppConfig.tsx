import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Smartphone, CheckCircle, Clock, WifiOff, AlertCircle, Phone
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { StatusBadge } from '../components/UI/Badge'
import { PageLoader } from '../components/UI/LoadingSpinner'
import { useState } from 'react'
import { whatsappApi } from '../services/api'
import { getSocket } from '../services/socket'
import { WhatsAppSession, SessionStatus } from '../types'
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
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()

  // Redirect admins to the full admin management page
  useEffect(() => {
    if (isAdmin) navigate('/admin/whatsapp', { replace: true })
  }, [isAdmin, navigate])

  const [session, setSession] = useState<WhatsAppSession | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    whatsappApi.getSession()
      .then((r) => setSession(r.data.data || null))
      .catch(() => setSession(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const socket = getSocket()
    socket.on('whatsapp-status', (data: {
      sessionId: string; status: SessionStatus; phoneNumber?: string
    }) => {
      setSession((prev) =>
        prev ? { ...prev, status: data.status, phoneNumber: data.phoneNumber } : prev
      )
      if (data.status === 'CONNECTED') toast.success('WhatsApp conectado!')
    })
    return () => { socket.off('whatsapp-status') }
  }, [])

  if (loading || isAdmin) return <PageLoader />

  const status = session?.status || 'DISCONNECTED'
  const isConnected = status === 'CONNECTED'
  const isWaiting = status === 'WAITING_QR'

  return (
    <div className="p-8 max-w-lg animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">WhatsApp</h1>
        <p className="text-text-muted text-sm mt-1">
          Status da sua conexão — número gerenciado pelo administrador
        </p>
      </div>

      <div
        className="rounded-2xl p-6 border"
        style={{
          background: 'linear-gradient(135deg, #0f1622 0%, #111827 100%)',
          borderColor: isConnected
            ? 'rgba(16,185,129,0.3)'
            : isWaiting
            ? 'rgba(245,158,11,0.3)'
            : '#1e2d4a',
          boxShadow: isConnected ? '0 4px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(16,185,129,0.1)' : '0 4px 32px rgba(0,0,0,0.5)',
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{
              background: isConnected ? 'rgba(16,185,129,0.1)' : isWaiting ? 'rgba(245,158,11,0.1)' : 'rgba(15,22,34,0.8)',
              border: '1px solid',
              borderColor: isConnected ? 'rgba(16,185,129,0.25)' : isWaiting ? 'rgba(245,158,11,0.25)' : '#1e2d4a',
            }}
          >
            <Smartphone size={28} style={{ color: isConnected ? '#34d399' : isWaiting ? '#fbbf24' : '#4a6080' }} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <StatusIcon status={status} />
              <h2 className="text-text-primary font-bold text-lg">
                {isConnected ? 'Conectado' : isWaiting ? 'Aguardando QR Code' : 'Desconectado'}
              </h2>
            </div>
            {isConnected && session?.phoneNumber && (
              <div className="flex items-center gap-1.5 text-text-muted text-sm">
                <Phone size={13} />
                <span>{session.phoneNumber}</span>
              </div>
            )}
            <div className="mt-1.5">
              <StatusBadge status={status} />
            </div>
          </div>
        </div>

        {!isConnected && (
          <div className="mt-5 px-4 py-3 rounded-xl"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <p className="text-primary-light text-sm font-medium">Número não conectado</p>
            <p className="text-text-muted text-xs mt-1">
              Solicite ao administrador que conecte um número de WhatsApp para você poder atender.
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 card">
        <p className="text-text-muted text-xs font-medium mb-1">Atendente</p>
        <p className="text-text-primary font-semibold">{user?.name}</p>
        <p className="text-text-muted text-xs mt-0.5">{user?.email}</p>
      </div>
    </div>
  )
}

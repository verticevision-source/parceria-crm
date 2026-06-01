import { useState, useEffect, useRef, useCallback } from 'react'
import { monitorApi, usersApi } from '../services/api'
import { getSocket } from '../services/socket'
import toast from 'react-hot-toast'
import { Eye, MessageSquare, Circle, RefreshCw, ChevronRight } from 'lucide-react'
import { format, isToday } from 'date-fns'

interface Agent { id: string; name: string; email: string; role: string; _count?: { conversations: number } }
interface Conv { id: string; lastMessage?: string; lastMessageAt?: string; contact?: { name?: string; phone?: string } }
interface Msg { id: string; direction: string; textBody?: string; type?: string; sentAt?: string; createdAt: string; conversationId: string }

export default function Monitor() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [agent, setAgent] = useState<Agent | null>(null)
  const [convs, setConvs] = useState<Conv[]>([])
  const [convId, setConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  const loadAgents = useCallback(async () => {
    try {
      const res = await usersApi.findAll()
      setAgents(res.data.data.filter((u: Agent) => u.role !== 'ADMIN'))
    } catch { toast.error('Erro ao carregar agentes') }
  }, [])

  useEffect(() => { loadAgents() }, [loadAgents])

  const openAgent = async (a: Agent) => {
    setAgent(a); setConvs([]); setConvId(null); setMessages([])
    try {
      const res = await monitorApi.agentConversations(a.id)
      setConvs(res.data.data)
    } catch { toast.error('Erro ao carregar conversas') }
  }

  const openConv = async (id: string) => {
    setConvId(id); setMessages([])
    try {
      const res = await monitorApi.conversationMessages(id)
      setMessages(res.data.data)
    } catch { toast.error('Erro ao carregar mensagens') }
  }

  // Live updates
  useEffect(() => {
    const socket = getSocket()
    const onNew = (payload: any) => {
      const m = payload?.message
      if (!m) return
      // Atualiza mensagens da conversa aberta
      if (convId && m.conversationId === convId) {
        setMessages((prev) => [...prev, m])
      }
      // Atualiza preview da lista de conversas do agente
      if (agent && payload?.conversation?.userId === agent.id) {
        setConvs((prev) => {
          const exists = prev.find((c) => c.id === m.conversationId)
          if (exists) {
            return prev.map((c) => c.id === m.conversationId
              ? { ...c, lastMessage: m.textBody || '[mídia]', lastMessageAt: m.createdAt } : c)
          }
          return prev
        })
      }
    }
    socket.on('new-message', onNew)
    return () => { socket.off('new-message', onNew) }
  }, [convId, agent])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const fmt = (d: string) => isToday(new Date(d)) ? format(new Date(d), 'HH:mm') : format(new Date(d), 'dd/MM HH:mm')

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-border bg-bg-secondary flex-shrink-0">
        <h1 className="text-lg font-bold text-text-primary flex items-center gap-2">
          <Eye size={20} className="text-primary" /> Monitor ao Vivo
        </h1>
        <span className="flex items-center gap-1 text-xs text-green-500">
          <Circle size={8} className="fill-green-500" /> tempo real
        </span>
        <button onClick={loadAgents} className="ml-auto btn-ghost p-2 rounded-lg"><RefreshCw size={16} /></button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Agentes */}
        <div className="w-56 border-r border-border flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-border text-xs font-semibold text-text-muted uppercase tracking-wider">
            Atendentes ({agents.length})
          </div>
          <div className="flex-1 overflow-y-auto">
            {agents.map((a) => (
              <button key={a.id} onClick={() => openAgent(a)}
                className={`w-full flex items-center gap-2 p-3 border-b border-border/50 hover:bg-bg-hover text-left ${agent?.id === a.id ? 'bg-bg-hover' : ''}`}>
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                  {a.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-text-primary truncate">{a.name}</p>
                  <p className="text-[10px] text-text-muted">{a._count?.conversations ?? 0} conversas</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Conversas do agente */}
        <div className="w-64 border-r border-border flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-border text-xs font-semibold text-text-muted uppercase tracking-wider truncate">
            {agent ? agent.name : 'Selecione um atendente'}
          </div>
          <div className="flex-1 overflow-y-auto">
            {convs.map((c) => (
              <button key={c.id} onClick={() => openConv(c.id)}
                className={`w-full p-3 border-b border-border/50 hover:bg-bg-hover text-left ${convId === c.id ? 'bg-bg-hover' : ''}`}>
                <p className="text-sm text-text-primary truncate">{c.contact?.name || c.contact?.phone || 'Contato'}</p>
                <p className="text-xs text-text-muted truncate">{c.lastMessage || ''}</p>
              </button>
            ))}
            {agent && convs.length === 0 && <p className="text-text-muted text-xs text-center p-4">Sem conversas</p>}
          </div>
        </div>

        {/* Mensagens ao vivo */}
        <div className="flex-1 flex flex-col bg-bg-primary min-w-0">
          {!convId ? (
            <div className="flex flex-col items-center justify-center h-full text-text-muted">
              <MessageSquare size={40} className="mb-3 opacity-20" />
              <p>Acompanhe a conversa em tempo real</p>
              <p className="text-xs mt-1">Escolha um atendente e uma conversa</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                  <div className={m.direction === 'OUT' ? 'message-bubble-out' : 'message-bubble-in'}>
                    <p className="text-sm whitespace-pre-wrap">{m.textBody || `[${(m.type || 'mídia').toLowerCase()}]`}</p>
                    <p className={`text-xs mt-1 ${m.direction === 'OUT' ? 'text-white/60' : 'text-text-muted'}`}>{fmt(m.sentAt || m.createdAt)}</p>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

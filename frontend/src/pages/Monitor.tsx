import { useState, useEffect, useRef, useCallback } from 'react'
import { monitorApi, usersApi } from '../services/api'
import { getSocket } from '../services/socket'
import toast from 'react-hot-toast'
import { Eye, MessageSquare, Circle, RefreshCw, Send, Mic, Paperclip, MapPin, Volume2, Square, Trash2 } from 'lucide-react'
import { format, isToday } from 'date-fns'

interface Agent { id: string; name: string; email: string; role: string; _count?: { conversations: number } }
interface Conv { id: string; lastMessage?: string; lastMessageAt?: string; contact?: { name?: string; phone?: string } }
interface Msg {
  id: string; direction: string; textBody?: string; type?: string; sentAt?: string; createdAt: string
  conversationId: string; mediaUrl?: string | null; latitude?: number | null; longitude?: number | null
}

// base64/data URL renderiza direto; URL externa passa pelo proxy
function mediaSrc(url?: string | null): string {
  if (!url) return ''
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  if (/^[A-Za-z0-9+/]{100,}={0,2}$/.test(url.slice(0, 200))) return `data:application/octet-stream;base64,${url}`
  return `/api/media/proxy?url=${encodeURIComponent(url)}`
}

export default function Monitor() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [agent, setAgent] = useState<Agent | null>(null)
  const [convs, setConvs] = useState<Conv[]>([])
  const [convId, setConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

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
      if (convId && m.conversationId === convId) {
        setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m])
      }
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

  const appendMsg = (m: Msg) => setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m])

  const sendText = async () => {
    if (!convId || !input.trim()) return
    setSending(true)
    try {
      const res = await monitorApi.send(convId, input.trim())
      appendMsg(res.data.data)
      setInput('')
    } catch { toast.error('Erro ao enviar') } finally { setSending(false) }
  }

  const sendMediaFile = async (file: File) => {
    if (!convId) return
    setSending(true)
    try {
      const res = await monitorApi.sendMedia(convId, file)
      appendMsg(res.data.data)
      toast.success('Enviado!')
    } catch { toast.error('Erro ao enviar arquivo') }
    finally { setSending(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg;codecs=opus'
      const mr = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mr
      audioChunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        const reader = new FileReader()
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1]
          setSending(true)
          try {
            const res = await monitorApi.sendAudio(convId!, base64, mimeType)
            appendMsg(res.data.data)
          } catch { toast.error('Erro ao enviar áudio') } finally { setSending(false) }
        }
        reader.readAsDataURL(blob)
      }
      mr.start(200)
      setRecording(true)
    } catch { toast.error('Microfone não disponível') }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    setRecording(false)
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = () => {
        const s = (mediaRecorderRef.current as any)?.stream as MediaStream | undefined
        s?.getTracks().forEach((t) => t.stop())
      }
      if (mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop()
    }
    setRecording(false)
  }

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

        {/* Mensagens ao vivo + composer */}
        <div className="flex-1 flex flex-col bg-bg-primary min-w-0">
          {!convId ? (
            <div className="flex flex-col items-center justify-center h-full text-text-muted">
              <MessageSquare size={40} className="mb-3 opacity-20" />
              <p>Acompanhe a conversa em tempo real</p>
              <p className="text-xs mt-1">Escolha um atendente e uma conversa</p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                    <div className={m.direction === 'OUT' ? 'message-bubble-out' : 'message-bubble-in'}>
                      {m.type === 'IMAGE' && m.mediaUrl && (
                        <img src={mediaSrc(m.mediaUrl)} alt="imagem" className="max-w-[240px] rounded-lg mb-1 cursor-pointer"
                          onClick={() => window.open(mediaSrc(m.mediaUrl), '_blank')} />
                      )}
                      {(m.type === 'AUDIO') && m.mediaUrl && (
                        <div className="flex items-center gap-2 min-w-[200px]">
                          <Volume2 size={16} className="flex-shrink-0 opacity-70" />
                          <audio controls preload="metadata" src={mediaSrc(m.mediaUrl)} className="h-8 max-w-[220px]"
                            style={{ filter: m.direction === 'OUT' ? 'invert(1)' : 'none', opacity: 0.9 }} />
                        </div>
                      )}
                      {m.type === 'VIDEO' && m.mediaUrl && (
                        <video controls preload="metadata" className="max-w-[240px] rounded-lg mb-1" style={{ maxHeight: 260 }}>
                          <source src={mediaSrc(m.mediaUrl)} />
                        </video>
                      )}
                      {m.type === 'DOCUMENT' && m.mediaUrl && (
                        <a href={mediaSrc(m.mediaUrl)} target="_blank" rel="noopener noreferrer" download
                          className="flex items-center gap-2 text-sm underline"><Paperclip size={14} /> Baixar documento</a>
                      )}
                      {m.type === 'LOCATION' && m.latitude != null && m.longitude != null && (
                        <a href={`https://www.google.com/maps?q=${m.latitude},${m.longitude}`} target="_blank" rel="noopener noreferrer"
                          className="block w-52 rounded-lg overflow-hidden border border-white/10">
                          <div className="h-20 flex items-center justify-center bg-bg-tertiary"><MapPin size={26} className="text-red-400" /></div>
                          <div className="px-3 py-1.5 bg-black/20"><p className="text-xs">{m.textBody || 'Localização'}</p><p className="text-[10px] opacity-70">Ver no Maps →</p></div>
                        </a>
                      )}
                      {(m.textBody || (!m.mediaUrl && m.type !== 'LOCATION')) && (
                        <p className="text-sm whitespace-pre-wrap">{m.textBody || `[${(m.type || 'mídia').toLowerCase()}]`}</p>
                      )}
                      <p className={`text-xs mt-1 ${m.direction === 'OUT' ? 'text-white/60' : 'text-text-muted'}`}>{fmt(m.sentAt || m.createdAt)}</p>
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>

              {/* Composer do supervisor */}
              <div className="border-t border-border p-3 bg-bg-secondary flex-shrink-0">
                <p className="text-[10px] text-text-muted mb-2 flex items-center gap-1">
                  <Eye size={11} /> Você está intervindo como supervisor — a mensagem sai pelo número de {agent?.name}
                </p>
                <input ref={fileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) sendMediaFile(f) }} />
                {recording ? (
                  <div className="flex items-center gap-3 px-2">
                    <span className="flex items-center gap-2 text-danger text-sm flex-1">
                      <Circle size={10} className="fill-danger animate-pulse" /> Gravando áudio...
                    </span>
                    <button onClick={cancelRecording} className="p-2 rounded-lg text-text-muted hover:text-danger" title="Cancelar"><Trash2 size={18} /></button>
                    <button onClick={stopRecording} className="btn-primary !p-0 rounded-full w-11 h-11 flex items-center justify-center" title="Enviar áudio"><Send size={20} /></button>
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <button onClick={() => fileRef.current?.click()} disabled={sending}
                      className="p-2.5 rounded-xl text-text-muted hover:text-text-secondary hover:bg-bg-hover" title="Enviar foto/arquivo">
                      <Paperclip size={22} />
                    </button>
                    <input value={input} onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') sendText() }}
                      placeholder="Mensagem como supervisor..." disabled={sending}
                      className="input-field flex-1 py-3 px-4 text-base" />
                    {input.trim() ? (
                      <button onClick={sendText} disabled={sending} className="btn-primary !p-0 rounded-full w-12 h-12 flex items-center justify-center" title="Enviar"><Send size={24} /></button>
                    ) : (
                      <button onClick={startRecording} disabled={sending} className="btn-primary !p-0 rounded-full w-12 h-12 flex items-center justify-center" title="Gravar áudio"><Mic size={28} strokeWidth={2.4} /></button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

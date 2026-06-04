import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, Send, CheckCircle, Clock, X, User,
  Phone, MapPin, Briefcase, ChevronRight, MessageSquare,
  Smile, Paperclip, Mic, MicOff, Zap, Tag, Volume2, Shuffle, Sparkles
} from 'lucide-react'
import { conversationsApi, leadsApi, whatsappApi, quickRepliesApi, aiApi, api } from '../services/api'
import { getSocket } from '../services/socket'
import { useAuth } from '../contexts/AuthContext'
import { Conversation, Message, QuickReply } from '../types'
import Avatar from '../components/UI/Avatar'
import { StatusBadge } from '../components/UI/Badge'
import { format, isToday, isYesterday } from 'date-fns'
import toast from 'react-hot-toast'

// ─────────────────────────────────────────────
// Emoji data
// ─────────────────────────────────────────────
const EMOJIS = [
  '😀','😁','😂','🤣','😃','😊','😎','😍','🥰','😘','🙂','😉','😋','🤩','😇',
  '😭','😢','😤','😠','😡','🤬','😱','😨','😰','😥','😓','🫢','🤔','😐','🙄',
  '👍','👎','👌','✌️','🤞','🤟','👋','🙏','💪','🤝','👏','🙌','🫶','🤜','🤛',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💕','💞','💓','💗','💖','💘','💔',
  '🎉','🎊','🎁','🎈','🎂','🍰','🥳','🎵','🎶','🚀','⭐','🌟','💫','🔥','✨',
  '🍕','🍔','🍟','🌮','☕','🍺','🥂','🎮','💻','📱','🏠','🚗','✈️','🌈','🌸',
]

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function displayPhone(phone: string | undefined | null): string {
  if (!phone) return ''
  return phone.replace(/@lid$/, '').replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '')
}

function formatMessageTime(date: string) {
  const d = new Date(date)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Ontem'
  return format(d, 'dd/MM/yy')
}

function formatRecordingTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ─────────────────────────────────────────────
// ConversationItem
// ─────────────────────────────────────────────
function ConversationItem({
  conversation,
  isSelected,
  onClick,
}: {
  conversation: Conversation
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 flex items-start gap-3 transition-all duration-200 border-b border-border/50 ${
        isSelected ? 'bg-primary/10' : 'hover:bg-bg-hover'
      }`}
    >
      <div className="relative flex-shrink-0">
        <Avatar src={conversation.contact?.avatarUrl} name={conversation.contact?.name} size={44} />
        {conversation.unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-xs rounded-full flex items-center justify-center font-bold">
            {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className="text-text-primary text-sm font-medium truncate">
            {displayPhone(conversation.contact?.name) || displayPhone(conversation.contact?.phone) || 'Desconhecido'}
          </p>
          <span className="text-text-muted text-xs flex-shrink-0">
            {conversation.lastMessageAt ? formatMessageTime(conversation.lastMessageAt) : ''}
          </span>
        </div>
        <p className="text-text-muted text-xs truncate mt-0.5">
          {conversation.lastMessage || 'Sem mensagens'}
        </p>
        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
          <StatusBadge status={conversation.status} />
          {conversation.tags?.slice(0, 2).map((ct) => (
            <span
              key={ct.id}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{ background: ct.tag.color + '33', color: ct.tag.color, border: `1px solid ${ct.tag.color}55` }}
            >
              {ct.tag.name}
            </span>
          ))}
        </div>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
export default function Attendance() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('')
  const [sending, setSending] = useState(false)
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)

  // Roleta
  const [rouletteActive, setRouletteActive] = useState(false)
  const [rouletteToggling, setRouletteToggling] = useState(false)

  // IA
  const aiAllowed = !!user?.aiEnabled || user?.role === 'ADMIN'
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const [aiAuto, setAiAuto] = useState(false)

  // Chat extras
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
  const [qrSearch, setQrSearch] = useState('')

  // Audio recording
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<Conversation | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Keep selectedRef in sync
  useEffect(() => { selectedRef.current = selected }, [selected])

  // Request notification permission once
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Load quick replies
  const loadQuickReplies = useCallback(async () => {
    try {
      const res = await quickRepliesApi.getAll()
      setQuickReplies(res.data.data || [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadQuickReplies() }, [loadQuickReplies])

  // Carrega status da roleta ao entrar na página
  useEffect(() => {
    api.get('/roulette/my-status')
      .then(res => setRouletteActive(res.data.data?.isActive ?? false))
      .catch(() => {})
  }, [])

  async function handleRouletteToggle() {
    setRouletteToggling(true)
    try {
      const res = await api.patch('/roulette/toggle')
      const isActive: boolean = res.data.data.isActive
      setRouletteActive(isActive)
      toast.success(isActive ? '🟢 Você está na roleta!' : '🔴 Você saiu da roleta')
    } catch {
      toast.error('Erro ao alterar status da roleta')
    } finally {
      setRouletteToggling(false)
    }
  }

  const loadConversations = useCallback(async () => {
    try {
      const res = await conversationsApi.findAll(filter || undefined)
      setConversations(res.data.data)
    } catch {
      toast.error('Erro ao carregar conversas')
    } finally {
      setLoadingConversations(false)
    }
  }, [filter])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    const socket = getSocket()

    socket.on('new-message', ({ message, conversation, contact }: { message: Message; conversation: Conversation; contact?: Conversation['contact'] }) => {
      setMessages((prev) => {
        if (selectedRef.current?.id === conversation.id) {
          if (prev.some((m) => m.id === message.id)) return prev
          return [...prev, message]
        }
        return prev
      })
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversation.id)
        let next: Conversation[]
        if (idx >= 0) {
          // Conversa já existe — atualiza
          next = [...prev]
          next[idx] = { ...next[idx], ...conversation, contact: contact || next[idx].contact }
        } else {
          // Conversa nova — adiciona no topo (antes só aparecia ao recarregar)
          next = [{ ...conversation, contact: contact || conversation.contact } as Conversation, ...prev]
        }
        return next.sort((a, b) =>
          new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
        )
      })

      // Browser notification for messages in background
      if (
        message.direction === 'IN' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        (document.hidden || selectedRef.current?.id !== conversation.id)
      ) {
        const from = conversation.contact?.name || displayPhone(conversation.contact?.phone) || 'Novo contato'
        const notif = new Notification(`💬 ${from}`, {
          body: message.textBody || '📎 Mídia',
          icon: '/favicon.ico',
          tag: conversation.id,
        })
        notif.onclick = () => { window.focus(); notif.close() }
      }
    })

    return () => { socket.off('new-message') }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Close popovers on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-emoji-picker]') && !target.closest('[data-emoji-btn]')) {
        setShowEmojiPicker(false)
      }
      if (!target.closest('[data-qr-picker]') && !target.closest('[data-qr-btn]')) {
        setShowQuickReplies(false)
      }
      if (!target.closest('[data-attach-menu]') && !target.closest('[data-attach-btn]')) {
        setShowAttachMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectConversation = async (conv: Conversation) => {
    setSelected(conv)
    setAiAuto(!!conv.aiAuto)
    setLoadingMessages(true)
    setShowEmojiPicker(false)
    setShowQuickReplies(false)
    try {
      const [msgRes] = await Promise.all([
        conversationsApi.getMessages(conv.id),
        conversationsApi.markAsRead(conv.id),
      ])
      setMessages(msgRes.data.data)
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c))
      )
    } catch {
      toast.error('Erro ao carregar mensagens')
    } finally {
      setLoadingMessages(false)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || !selected || sending) return
    const body = input.trim()
    setInput('')
    setSending(true)
    try {
      const session = selected.whatsappSession
      if (!session || session.status !== 'CONNECTED') {
        toast.error('WhatsApp não está conectado')
        setInput(body)
        return
      }
      await whatsappApi.sendMessage(selected.contact?.phone || '', body)
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selected.id
            ? { ...c, lastMessage: body, lastMessageAt: new Date().toISOString() }
            : c
        )
      )
    } catch {
      toast.error('Erro ao enviar mensagem')
      setInput(body)
    } finally {
      setSending(false)
    }
  }

  const aiSuggest = async () => {
    if (!selected) return
    setAiSuggesting(true)
    try {
      const res = await aiApi.suggest(selected.id)
      const suggestion = res.data.data.suggestion
      if (suggestion) {
        setInput(suggestion)
        toast.success('Sugestão da IA pronta — revise e envie')
      } else {
        toast.error('A IA não retornou sugestão')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao gerar sugestão')
    } finally {
      setAiSuggesting(false)
    }
  }

  const toggleAiAuto = async () => {
    if (!selected) return
    const next = !aiAuto
    setAiAuto(next)
    try {
      await conversationsApi.setAiAuto(selected.id, next)
      toast.success(next ? '🤖 IA responde automaticamente esta conversa' : 'Resposta automática desligada')
    } catch {
      setAiAuto(!next)
      toast.error('Erro ao alterar modo IA')
    }
  }

  const sendLocation = () => {
    if (!selected?.contact?.phone) return
    if (!navigator.geolocation) {
      toast.error('Geolocalização não suportada neste navegador')
      return
    }
    toast.loading('Obtendo sua localização...', { id: 'geo' })
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        toast.dismiss('geo')
        setSending(true)
        try {
          await whatsappApi.sendLocation(
            selected.contact!.phone,
            pos.coords.latitude,
            pos.coords.longitude,
          )
          toast.success('Localização enviada!')
        } catch {
          toast.error('Erro ao enviar localização')
        } finally {
          setSending(false)
        }
      },
      () => {
        toast.dismiss('geo')
        toast.error('Não foi possível obter a localização (permissão negada)')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const sendMediaFile = async (file: File) => {
    if (!selected) return
    setSending(true)
    try {
      await whatsappApi.sendMedia(selected.contact?.phone || '', file)
      toast.success('Arquivo enviado!')
    } catch {
      toast.error('Erro ao enviar arquivo')
    } finally {
      setSending(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg;codecs=opus'

      const mr = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mr
      audioChunksRef.current = []

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        const reader = new FileReader()
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1]
          await sendAudioMessage(base64, mimeType)
        }
        reader.readAsDataURL(blob)
      }

      mr.start(200)
      setRecording(true)
      setRecordingTime(0)
      recordingTimerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000)
    } catch {
      toast.error('Microfone não disponível')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    setRecording(false)
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      // Override onstop to not send
      mediaRecorderRef.current.onstop = () => {
        if (mediaRecorderRef.current) {
          const stream = (mediaRecorderRef.current as any).stream as MediaStream | undefined
          stream?.getTracks().forEach((t) => t.stop())
        }
      }
      mediaRecorderRef.current.stop()
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    setRecording(false)
  }

  const sendAudioMessage = async (audioBase64: string, mimetype: string) => {
    if (!selected) return
    setSending(true)
    try {
      await whatsappApi.sendAudio(selected.contact?.phone || '', audioBase64, mimetype)
      toast.success('Áudio enviado!')
    } catch {
      toast.error('Erro ao enviar áudio')
    } finally {
      setSending(false)
    }
  }

  const updateStatus = async (status: string) => {
    if (!selected) return
    try {
      await conversationsApi.updateStatus(selected.id, status)
      setSelected((prev) => prev ? { ...prev, status: status as Conversation['status'] } : null)
      setConversations((prev) =>
        prev.map((c) => (c.id === selected.id ? { ...c, status: status as Conversation['status'] } : c))
      )
      toast.success('Status atualizado')
    } catch {
      toast.error('Erro ao atualizar status')
    }
  }

  const createLead = async () => {
    if (!selected) return
    try {
      await leadsApi.createFromConversation({ conversationId: selected.id, source: 'WhatsApp' })
      toast.success('Lead criado com sucesso!')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao criar lead'
      toast.error(msg)
    }
  }

  const insertEmoji = (emoji: string) => {
    setInput((prev) => prev + emoji)
    setShowEmojiPicker(false)
    inputRef.current?.focus()
  }

  const insertQuickReply = (body: string) => {
    setInput(body)
    setShowQuickReplies(false)
    inputRef.current?.focus()
  }

  const filtered = conversations.filter((c) => {
    const name = (c.contact?.name || c.contact?.phone || '').toLowerCase()
    return name.includes(search.toLowerCase())
  })

  const filteredQR = quickReplies.filter((qr) =>
    qr.title.toLowerCase().includes(qrSearch.toLowerCase()) ||
    qr.body.toLowerCase().includes(qrSearch.toLowerCase())
  )

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar de conversas ── */}
      <div className={`w-full md:w-80 bg-bg-secondary border-r border-border flex-col flex-shrink-0 ${selected ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-text-primary font-semibold">Atendimento</h2>
            <button
              onClick={handleRouletteToggle}
              disabled={rouletteToggling}
              title={rouletteActive ? 'Sair da roleta de leads' : 'Entrar na roleta de leads'}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                rouletteActive
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-bg-tertiary hover:bg-bg-secondary text-text-muted hover:text-text-primary border border-border'
              }`}
            >
              <Shuffle size={12} className={rouletteToggling ? 'animate-spin' : ''} />
              {rouletteActive ? 'Na Roleta' : 'Fora da Roleta'}
            </button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="input-field pl-9 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2 mt-3">
            {(['', 'OPEN', 'PENDING', 'CLOSED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filter === s
                    ? 'bg-primary text-white'
                    : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
                }`}
              >
                {s === '' ? 'Todas' : s === 'OPEN' ? 'Abertas' : s === 'PENDING' ? 'Pend.' : 'Fechadas'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConversations ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-text-muted">
              <MessageSquare size={32} className="mb-2 opacity-30" />
              <p className="text-sm">Nenhuma conversa</p>
            </div>
          ) : (
            filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isSelected={selected?.id === conv.id}
                onClick={() => selectConversation(conv)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Chat ── */}
      <div className={`flex-1 flex-col bg-bg-primary min-w-0 ${selected ? 'flex' : 'hidden md:flex'}`}>
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <MessageSquare size={48} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">Selecione uma conversa</p>
            <p className="text-sm mt-1">Escolha uma conversa na lista ao lado</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 p-4 bg-bg-secondary border-b border-border flex-shrink-0">
              {/* Voltar (mobile) */}
              <button
                onClick={() => setSelected(null)}
                className="md:hidden text-text-muted hover:text-text-primary p-1 -ml-1 flex-shrink-0"
                title="Voltar"
              >
                <ChevronRight size={20} className="rotate-180" />
              </button>
              <Avatar src={selected.contact?.avatarUrl} name={selected.contact?.name} size={40} />
              <div className="flex-1 min-w-0">
                <p className="text-text-primary font-semibold text-sm truncate">
                  {displayPhone(selected.contact?.name) || displayPhone(selected.contact?.phone) || 'Desconhecido'}
                </p>
                <p className="text-text-muted text-xs">{displayPhone(selected.contact?.phone)}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {selected.tags && selected.tags.length > 0 && (
                  <div className="flex gap-1">
                    {selected.tags.slice(0, 3).map((ct) => (
                      <span
                        key={ct.id}
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ background: ct.tag.color + '22', color: ct.tag.color, border: `1px solid ${ct.tag.color}44` }}
                      >
                        {ct.tag.name}
                      </span>
                    ))}
                  </div>
                )}
                {aiAllowed && (
                  <button
                    onClick={toggleAiAuto}
                    title={aiAuto ? 'IA automática LIGADA (clique para desligar)' : 'Ligar resposta automática da IA'}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                      aiAuto ? 'bg-primary text-white' : 'bg-bg-tertiary text-text-muted hover:text-text-primary border border-border'
                    }`}
                  >
                    <Sparkles size={13} /> {aiAuto ? 'IA Auto' : 'IA'}
                  </button>
                )}
                <StatusBadge status={selected.status} />
                <div className="flex gap-1">
                  <button onClick={() => updateStatus('OPEN')} title="Aberta"
                    className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-success transition-colors">
                    <CheckCircle size={16} />
                  </button>
                  <button onClick={() => updateStatus('PENDING')} title="Pendente"
                    className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-warning transition-colors">
                    <Clock size={16} />
                  </button>
                  <button onClick={() => updateStatus('CLOSED')} title="Fechar"
                    className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-danger transition-colors">
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3 chat-messages">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-text-muted">
                  <p className="text-sm">Nenhuma mensagem ainda</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                    <div className={msg.direction === 'OUT' ? 'message-bubble-out' : 'message-bubble-in'}>
                      {/* Audio */}
                      {msg.type === 'AUDIO' && msg.mediaUrl && (
                        <div className="flex items-center gap-2 min-w-[200px]">
                          <Volume2 size={16} className="flex-shrink-0 opacity-70" />
                          <audio
                            controls
                            preload="metadata"
                            src={`/api/media/proxy?url=${encodeURIComponent(msg.mediaUrl)}`}
                            className="h-8 max-w-[220px]"
                            style={{ filter: msg.direction === 'OUT' ? 'invert(1)' : 'none', opacity: 0.9 }}
                            onError={() => toast.error('Não foi possível carregar o áudio')}
                          />
                        </div>
                      )}
                      {/* Image */}
                      {msg.type === 'IMAGE' && msg.mediaUrl && (
                        <div className="relative group">
                          <img
                            src={`/api/media/proxy?url=${encodeURIComponent(msg.mediaUrl)}`}
                            alt="imagem"
                            className="max-w-xs rounded-lg mb-1 cursor-pointer hover:opacity-90 transition-opacity"
                            loading="lazy"
                            onClick={() => window.open(`/api/media/proxy?url=${encodeURIComponent(msg.mediaUrl!)}`, '_blank')}
                            onError={(e) => {
                              const el = e.target as HTMLImageElement
                              el.style.display = 'none'
                              el.nextElementSibling?.classList.remove('hidden')
                            }}
                          />
                          <div className="hidden text-xs opacity-60 py-1">[Imagem não disponível]</div>
                        </div>
                      )}
                      {/* Video */}
                      {msg.type === 'VIDEO' && msg.mediaUrl && (
                        <div className="relative">
                          <video
                            controls
                            preload="metadata"
                            className="max-w-xs rounded-lg mb-1"
                            style={{ maxHeight: '300px' }}
                            onError={() => toast.error('Não foi possível carregar o vídeo')}
                          >
                            <source src={`/api/media/proxy?url=${encodeURIComponent(msg.mediaUrl)}`} />
                            Seu browser não suporta vídeo.
                          </video>
                        </div>
                      )}
                      {/* Document */}
                      {msg.type === 'DOCUMENT' && msg.mediaUrl && (
                        <a
                          href={`/api/media/proxy?url=${encodeURIComponent(msg.mediaUrl)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm underline hover:opacity-80 transition-opacity"
                          download
                        >
                          <Paperclip size={14} />
                          Baixar documento
                        </a>
                      )}
                      {/* Location */}
                      {msg.type === 'LOCATION' && msg.latitude != null && msg.longitude != null && (
                        <a
                          href={`https://www.google.com/maps?q=${msg.latitude},${msg.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-56 rounded-lg overflow-hidden border border-white/10 hover:opacity-90 transition-opacity"
                        >
                          <div className="h-24 flex items-center justify-center bg-bg-tertiary">
                            <MapPin size={28} className="text-red-400" />
                          </div>
                          <div className="px-3 py-2 bg-black/20">
                            <p className="text-xs font-medium">{msg.textBody || 'Localização'}</p>
                            <p className="text-[10px] opacity-70">Ver no Google Maps →</p>
                          </div>
                        </a>
                      )}
                      {/* Text */}
                      {msg.textBody && msg.type !== 'LOCATION' ? (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.textBody}</p>
                      ) : !msg.mediaUrl && msg.type !== 'AUDIO' && msg.type !== 'LOCATION' ? (
                        <p className="text-sm leading-relaxed opacity-60">[mídia]</p>
                      ) : null}
                      <p className={`text-xs mt-1 ${msg.direction === 'OUT' ? 'text-white/60' : 'text-text-muted'}`}>
                        {msg.sentAt ? format(new Date(msg.sentAt), 'HH:mm') : format(new Date(msg.createdAt), 'HH:mm')}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Input area ── */}
            <div className="p-4 bg-bg-secondary border-t border-border flex-shrink-0">

              {/* Recording indicator */}
              {recording && (
                <div className="flex items-center gap-3 mb-3 px-4 py-2 rounded-xl"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <span className="w-2.5 h-2.5 bg-danger rounded-full animate-pulse flex-shrink-0" />
                  <span className="text-danger text-sm font-medium flex-1">
                    Gravando... {formatRecordingTime(recordingTime)}
                  </span>
                  <button onClick={cancelRecording} className="text-text-muted hover:text-danger text-xs px-2">
                    Cancelar
                  </button>
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                    style={{ background: 'rgba(239,68,68,0.8)' }}
                  >
                    <MicOff size={14} />
                    Enviar
                  </button>
                </div>
              )}

              {/* Quick replies panel */}
              {showQuickReplies && (
                <div data-qr-picker
                  className="mb-3 rounded-xl border border-border overflow-hidden"
                  style={{ background: '#0f1622', maxHeight: 200 }}
                >
                  <div className="p-2 border-b border-border">
                    <input
                      value={qrSearch}
                      onChange={(e) => setQrSearch(e.target.value)}
                      placeholder="Buscar resposta..."
                      className="input-field py-1.5 text-xs w-full"
                    />
                  </div>
                  <div className="overflow-y-auto" style={{ maxHeight: 150 }}>
                    {filteredQR.length === 0 ? (
                      <p className="text-text-muted text-xs p-3">Nenhuma resposta encontrada</p>
                    ) : (
                      filteredQR.map((qr) => (
                        <button
                          key={qr.id}
                          onClick={() => insertQuickReply(qr.body)}
                          className="w-full text-left px-3 py-2 hover:bg-bg-hover transition-colors border-b border-border/30 last:border-0"
                        >
                          <p className="text-text-primary text-xs font-medium">{qr.title}</p>
                          <p className="text-text-muted text-xs truncate">{qr.body}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Emoji picker */}
              {showEmojiPicker && (
                <div data-emoji-picker
                  className="mb-3 p-3 rounded-xl border border-border flex flex-wrap gap-1"
                  style={{ background: '#0f1622', maxHeight: 180, overflowY: 'auto' }}
                >
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => insertEmoji(emoji)}
                      className="text-xl hover:scale-125 transition-transform p-0.5 rounded"
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) sendMediaFile(file)
                }}
              />

              {/* Input row — estilo WhatsApp */}
              {!recording && (
                <div className="flex items-end gap-2">
                  {/* Emoji */}
                  <button
                    data-emoji-btn
                    onClick={() => { setShowEmojiPicker((v) => !v); setShowQuickReplies(false); setShowAttachMenu(false) }}
                    className={`p-2.5 rounded-xl transition-colors flex-shrink-0 ${
                      showEmojiPicker ? 'bg-primary/20 text-primary' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
                    }`}
                    title="Emoji"
                  >
                    <Smile size={22} />
                  </button>

                  {/* Anexar — menu único (foto, localização, respostas rápidas, IA) */}
                  <div className="relative flex-shrink-0">
                    {showAttachMenu && (
                      <div data-attach-menu
                        className="absolute bottom-full mb-2 left-0 w-56 p-1.5 rounded-xl border border-border shadow-xl z-20"
                        style={{ background: '#0f1622' }}
                      >
                        <button
                          onClick={() => { setShowAttachMenu(false); fileInputRef.current?.click() }}
                          disabled={sending}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-bg-hover transition-colors"
                        >
                          <Paperclip size={18} className="text-primary" /> Foto / Arquivo
                        </button>
                        <button
                          onClick={() => { setShowAttachMenu(false); sendLocation() }}
                          disabled={sending}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-bg-hover transition-colors"
                        >
                          <MapPin size={18} className="text-red-400" /> Localização atual
                        </button>
                        <button
                          data-qr-btn
                          onClick={() => { setShowAttachMenu(false); setShowQuickReplies(true); setShowEmojiPicker(false); setQrSearch('') }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-bg-hover transition-colors"
                        >
                          <Zap size={18} className="text-gold" /> Respostas rápidas
                        </button>
                        {aiAllowed && (
                          <button
                            onClick={() => { setShowAttachMenu(false); aiSuggest() }}
                            disabled={aiSuggesting}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-bg-hover transition-colors disabled:opacity-50"
                          >
                            <Sparkles size={18} className="text-primary" /> Sugerir com IA
                          </button>
                        )}
                      </div>
                    )}
                    <button
                      data-attach-btn
                      onClick={() => { setShowAttachMenu((v) => !v); setShowEmojiPicker(false); setShowQuickReplies(false) }}
                      disabled={sending}
                      className={`p-2.5 rounded-xl transition-colors ${
                        showAttachMenu ? 'bg-primary/20 text-primary' : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover'
                      }`}
                      title="Anexar"
                    >
                      <Paperclip size={22} />
                    </button>
                  </div>

                  {/* Campo de texto — maior */}
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                    placeholder="Digite uma mensagem... (Shift+Enter para nova linha)"
                    className="input-field flex-1 resize-none min-h-[52px] max-h-44 py-3 px-4 text-base leading-relaxed"
                    rows={1}
                    disabled={sending}
                    style={{ height: 'auto' }}
                    onInput={(e) => {
                      const t = e.target as HTMLTextAreaElement
                      t.style.height = 'auto'
                      t.style.height = Math.min(t.scrollHeight, 176) + 'px'
                    }}
                  />

                  {/* Botão único: Enviar quando há texto, Microfone quando vazio */}
                  {input.trim() ? (
                    <button
                      onClick={sendMessage}
                      disabled={sending}
                      className="btn-primary rounded-full w-12 h-12 flex items-center justify-center flex-shrink-0"
                      title="Enviar mensagem"
                    >
                      {sending ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Send size={20} />
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={startRecording}
                      disabled={sending}
                      className="btn-primary rounded-full w-12 h-12 flex items-center justify-center flex-shrink-0"
                      title="Gravar áudio"
                    >
                      <Mic size={20} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Painel lateral — dados do contato (oculto em telas menores) ── */}
      {selected && selected.contact && (
        <div className="hidden lg:block w-72 bg-bg-secondary border-l border-border overflow-y-auto flex-shrink-0">
          <div className="p-5">
            <div className="text-center mb-5">
              <div className="mx-auto mb-3 w-fit">
                <Avatar src={selected.contact.avatarUrl} name={selected.contact.name} size={64} />
              </div>
              <h3 className="text-text-primary font-semibold">{displayPhone(selected.contact.name)}</h3>
              <p className="text-text-muted text-sm">{displayPhone(selected.contact.phone)}</p>
            </div>

            <div className="space-y-3">
              {selected.contact.city && (
                <div className="flex items-center gap-2 text-text-secondary text-sm">
                  <MapPin size={14} className="text-text-muted flex-shrink-0" />
                  <span>{selected.contact.city}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-text-secondary text-sm">
                <Phone size={14} className="text-text-muted flex-shrink-0" />
                <span>{displayPhone(selected.contact.phone)}</span>
              </div>
              {user && (
                <div className="flex items-center gap-2 text-text-secondary text-sm">
                  <User size={14} className="text-text-muted flex-shrink-0" />
                  <span>Atendente: {user.name}</span>
                </div>
              )}
            </div>

            {selected.contact.notes && (
              <div className="mt-4 p-3 bg-bg-tertiary rounded-xl">
                <p className="text-text-muted text-xs font-medium mb-1">Observações</p>
                <p className="text-text-secondary text-sm">{selected.contact.notes}</p>
              </div>
            )}

            {/* Tags */}
            {selected.tags && selected.tags.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Tag size={12} className="text-text-muted" />
                  <p className="text-text-muted text-xs font-medium">Tags</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.tags.map((ct) => (
                    <span
                      key={ct.id}
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{ background: ct.tag.color + '22', color: ct.tag.color, border: `1px solid ${ct.tag.color}44` }}
                    >
                      {ct.tag.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 space-y-2">
              <button onClick={createLead} className="w-full btn-primary flex items-center justify-center gap-2 text-sm">
                <Briefcase size={16} />
                Criar Lead no CRM
              </button>
              {selected.leadId && (
                <a
                  href={`/crm?lead=${selected.leadId}`}
                  className="w-full flex items-center justify-center gap-2 text-sm btn-ghost border border-border"
                >
                  <ChevronRight size={16} />
                  Ver Lead
                </a>
              )}
            </div>

            <div className="mt-5">
              <p className="text-text-muted text-xs font-medium mb-3">Status da Conversa</p>
              <StatusBadge status={selected.status} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

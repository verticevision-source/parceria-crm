import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search, Send, CheckCircle, Clock, X, User,
  Phone, MapPin, Briefcase, ChevronRight, MessageSquare
} from 'lucide-react'
import { conversationsApi, leadsApi } from '../services/api'
import { getSocket } from '../services/socket'
import { useAuth } from '../contexts/AuthContext'
import { Conversation, Message } from '../types'
import { StatusBadge } from '../components/UI/Badge'
import { format, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'

function formatMessageTime(date: string) {
  const d = new Date(date)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Ontem'
  return format(d, 'dd/MM/yy')
}

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
        <div className="w-11 h-11 bg-bg-tertiary rounded-full flex items-center justify-center">
          <span className="text-text-secondary font-medium text-sm">
            {conversation.contact?.name?.charAt(0).toUpperCase() || '?'}
          </span>
        </div>
        {conversation.unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-xs rounded-full flex items-center justify-center font-bold">
            {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className="text-text-primary text-sm font-medium truncate">
            {conversation.contact?.name || conversation.contact?.phone || 'Desconhecido'}
          </p>
          <span className="text-text-muted text-xs flex-shrink-0">
            {conversation.lastMessageAt ? formatMessageTime(conversation.lastMessageAt) : ''}
          </span>
        </div>
        <p className="text-text-muted text-xs truncate mt-0.5">
          {conversation.lastMessage || 'Sem mensagens'}
        </p>
        <div className="mt-1.5">
          <StatusBadge status={conversation.status} />
        </div>
      </div>
    </button>
  )
}

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
  const messagesEndRef = useRef<HTMLDivElement>(null)

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

    socket.on('new-message', ({ message, conversation }: { message: Message; conversation: Conversation }) => {
      setMessages((prev) => {
        if (selected?.id === conversation.id) {
          // Deduplicate by message ID
          if (prev.some((m) => m.id === message.id)) return prev
          return [...prev, message]
        }
        return prev
      })
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversation.id)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = { ...updated[idx], ...conversation }
          return updated.sort((a, b) =>
            new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
          )
        }
        return prev
      })
    })

    return () => { socket.off('new-message') }
  }, [selected])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectConversation = async (conv: Conversation) => {
    setSelected(conv)
    setLoadingMessages(true)
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
      await conversationsApi.findById(selected.id)
      const session = selected.whatsappSession
      if (!session || session.status !== 'CONNECTED') {
        toast.error('WhatsApp não está conectado')
        setInput(body)
        return
      }

      const { whatsappApi } = await import('../services/api')
      await whatsappApi.sendMessage(
        selected.contact?.phone || '',
        body
      )
      // Don't manually push message here — the socket 'new-message' event will add it
      // to avoid duplicates (backend emits socket after saving to DB)
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

  const filtered = conversations.filter((c) => {
    const name = (c.contact?.name || c.contact?.phone || '').toLowerCase()
    return name.includes(search.toLowerCase())
  })

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar de conversas */}
      <div className="w-80 bg-bg-secondary border-r border-border flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <h2 className="text-text-primary font-semibold mb-3">Atendimento</h2>
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

        {/* Lista */}
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

      {/* Chat */}
      <div className="flex-1 flex flex-col bg-bg-primary">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <MessageSquare size={48} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">Selecione uma conversa</p>
            <p className="text-sm mt-1">Escolha uma conversa na lista ao lado</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-4 p-4 bg-bg-secondary border-b border-border">
              <div className="w-10 h-10 bg-bg-tertiary rounded-full flex items-center justify-center">
                <span className="text-text-secondary font-medium text-sm">
                  {selected.contact?.name?.charAt(0).toUpperCase() || '?'}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-text-primary font-semibold text-sm">
                  {selected.contact?.name || selected.contact?.phone || 'Desconhecido'}
                </p>
                <p className="text-text-muted text-xs">{selected.contact?.phone}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={selected.status} />
                <div className="flex gap-1">
                  <button
                    onClick={() => updateStatus('OPEN')}
                    title="Marcar Aberta"
                    className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-success transition-colors"
                  >
                    <CheckCircle size={16} />
                  </button>
                  <button
                    onClick={() => updateStatus('PENDING')}
                    title="Marcar Pendente"
                    className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-warning transition-colors"
                  >
                    <Clock size={16} />
                  </button>
                  <button
                    onClick={() => updateStatus('CLOSED')}
                    title="Fechar"
                    className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-danger transition-colors"
                  >
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
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={
                        msg.direction === 'OUT' ? 'message-bubble-out' : 'message-bubble-in'
                      }
                    >
                      <p className="text-sm leading-relaxed">{msg.textBody}</p>
                      <p
                        className={`text-xs mt-1 ${
                          msg.direction === 'OUT' ? 'text-white/60' : 'text-text-muted'
                        }`}
                      >
                        {msg.sentAt
                          ? format(new Date(msg.sentAt), 'HH:mm')
                          : format(new Date(msg.createdAt), 'HH:mm')}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-bg-secondary border-t border-border">
              <div className="flex items-center gap-3">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Digite uma mensagem..."
                  className="input-field flex-1"
                  disabled={sending}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className="btn-primary p-3 rounded-xl flex items-center justify-center"
                >
                  {sending ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Painel lateral — dados do contato */}
      {selected && selected.contact && (
        <div className="w-72 bg-bg-secondary border-l border-border overflow-y-auto">
          <div className="p-5">
            <div className="text-center mb-5">
              <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-primary text-2xl font-bold">
                  {selected.contact.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <h3 className="text-text-primary font-semibold">{selected.contact.name}</h3>
              <p className="text-text-muted text-sm">{selected.contact.phone}</p>
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
                <span>{selected.contact.phone}</span>
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

            <div className="mt-5 space-y-2">
              <button
                onClick={createLead}
                className="w-full btn-primary flex items-center justify-center gap-2 text-sm"
              >
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

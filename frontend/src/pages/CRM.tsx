import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Plus, Phone, User, TrendingUp, Search, Layers, X, Trash2, MessageSquare, Send } from 'lucide-react'
import { leadsApi, pipelineApi, contactsApi, crmBoardsApi, whatsappApi } from '../services/api'
import { getSocket } from '../services/socket'
import { useAuth } from '../contexts/AuthContext'
import { Lead, PipelineStage, Contact, KanbanColumn, Message } from '../types'
import Modal from '../components/UI/Modal'
import { StatusBadge } from '../components/UI/Badge'
import { PageLoader } from '../components/UI/LoadingSpinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

// Lead estendido com info de mensagens (vem do kanban do board)
type LeadWithChat = Lead & { unreadCount?: number; lastMessage?: string | null }

interface Board {
  id: string
  name: string
  color: string
  description?: string
  stages: PipelineStage[]
}

function LeadCard({ lead, index, onDelete, onOpenChat }: {
  lead: LeadWithChat; index: number
  onDelete: (id: string) => void
  onOpenChat: (lead: LeadWithChat) => void
}) {
  const unread = lead.unreadCount || 0
  return (
    <Draggable draggableId={lead.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`kanban-card mb-3 group relative ${snapshot.isDragging ? 'shadow-glow rotate-1' : ''} ${unread > 0 ? 'ring-1 ring-green-500/40' : ''}`}
        >
          {/* Badge de mensagens não lidas */}
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-green-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow">
              {unread}
            </span>
          )}
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="text-text-primary text-sm font-medium leading-tight">
              {lead.contact?.name || 'Sem nome'}
            </h4>
            <div className="flex items-center gap-1 flex-shrink-0">
              <StatusBadge status={lead.status} />
              <button
                onClick={(e) => { e.stopPropagation(); onOpenChat(lead) }}
                onMouseDown={(e) => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-green-500 p-0.5"
                title="Abrir conversa"
              >
                <MessageSquare size={13} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(lead.id) }}
                onMouseDown={(e) => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-red-500 p-0.5"
                title="Excluir lead"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            {lead.contact?.phone && (
              <div className="flex items-center gap-1.5 text-text-muted text-xs">
                <Phone size={11} />
                <span>{lead.contact.phone}</span>
              </div>
            )}
            {lead.responsibleUser && (
              <div className="flex items-center gap-1.5 text-text-muted text-xs">
                <User size={11} />
                <span>{lead.responsibleUser.name}</span>
              </div>
            )}
            {lead.value && (
              <div className="flex items-center gap-1.5 text-success text-xs font-medium">
                <TrendingUp size={11} />
                <span>R$ {lead.value.toLocaleString('pt-BR')}</span>
              </div>
            )}
          </div>
          {lead.lastInteractionAt && (
            <p className="text-text-muted text-xs mt-2 pt-2 border-t border-border/50">
              {format(new Date(lead.lastInteractionAt), 'dd/MM HH:mm')}
            </p>
          )}
        </div>
      )}
    </Draggable>
  )
}

function KanbanCol({
  column, canManage, onDelete, onDeleteLead, onOpenChat,
}: {
  column: KanbanColumn
  canManage: boolean
  onDelete: (id: string) => void
  onDeleteLead: (id: string) => void
  onOpenChat: (lead: LeadWithChat) => void
}) {
  return (
    <div className="flex flex-col bg-bg-secondary rounded-2xl border border-border w-64 flex-shrink-0">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
          <h3 className="text-text-primary text-sm font-semibold truncate">{column.name}</h3>
          <span className="ml-auto text-text-muted text-xs bg-bg-tertiary px-2 py-0.5 rounded-full">
            {column.leads.length}
          </span>
          {canManage && (
            <button
              onClick={() => onDelete(column.id)}
              className="text-text-muted hover:text-red-500 p-0.5"
              title="Remover etapa"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-3 min-h-24 transition-colors ${
              snapshot.isDraggingOver ? 'bg-primary/5' : ''
            }`}
          >
            {column.leads.map((lead, index) => (
              <LeadCard key={lead.id} lead={lead as LeadWithChat} index={index} onDelete={onDeleteLead} onOpenChat={onOpenChat} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}

export default function CRM() {
  const { isAdmin } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const boardId = searchParams.get('board') || ''

  const [boards, setBoards] = useState<Board[]>([])
  const [columns, setColumns] = useState<KanbanColumn[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [legacyStages, setLegacyStages] = useState<PipelineStage[]>([])
  const [search, setSearch] = useState('')
  const [showAddStage, setShowAddStage] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const [form, setForm] = useState({
    contactId: '', pipelineStageId: '', source: '', value: '', notes: ''
  })

  // Chat drawer
  const [chatLead, setChatLead] = useState<LeadWithChat | null>(null)
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const currentBoard = boards.find(b => b.id === boardId)

  // Mapeia o retorno do kanban de board (stages com leads) para KanbanColumn[]
  const mapStagesToColumns = (stages: any[]): KanbanColumn[] =>
    stages.map((s) => ({
      id: s.id, name: s.name, order: s.order, color: s.color,
      leads: s.leads || [],
    }))

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Carrega lista de boards sempre (para o switcher)
      const boardsRes = await crmBoardsApi.list()
      const boardList: Board[] = boardsRes.data.data
      setBoards(boardList)

      const contactsRes = await contactsApi.findAll()
      setContacts(contactsRes.data.data)

      if (boardId) {
        // Modo board: carrega kanban específico do board
        const kanbanRes = await crmBoardsApi.getKanban(boardId)
        setColumns(mapStagesToColumns(kanbanRes.data.data))
      } else if (boardList.length > 0) {
        // Auto-seleciona o primeiro board disponível
        setSearchParams({ board: boardList[0].id }, { replace: true })
        return
      } else {
        // Sem boards: cai no pipeline legado (global)
        const [kanbanRes, stagesRes] = await Promise.all([
          pipelineApi.getKanban(),
          pipelineApi.getStages(),
        ])
        setColumns(kanbanRes.data.data)
        setLegacyStages(stagesRes.data.data)
      }
    } catch {
      toast.error('Erro ao carregar CRM')
    } finally {
      setLoading(false)
    }
  }, [boardId, setSearchParams])

  useEffect(() => { loadData() }, [loadData])

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination || destination.droppableId === source.droppableId) return

    setColumns((prev) => {
      const cols = prev.map((col) => ({ ...col, leads: [...col.leads] }))
      const srcCol = cols.find((c) => c.id === source.droppableId)
      const dstCol = cols.find((c) => c.id === destination.droppableId)
      if (!srcCol || !dstCol) return prev
      const [moved] = srcCol.leads.splice(source.index, 1)
      dstCol.leads.splice(destination.index, 0, moved)
      return cols
    })

    try {
      await leadsApi.updateStage(draggableId, destination.droppableId)
    } catch {
      toast.error('Erro ao mover lead')
      loadData()
    }
  }

  const createLead = async () => {
    if (!form.contactId) { toast.error('Selecione um contato'); return }
    try {
      await leadsApi.create({
        contactId: form.contactId,
        pipelineStageId: form.pipelineStageId || undefined,
        boardId: boardId || undefined,
        source: form.source || undefined,
        value: form.value ? parseFloat(form.value) : undefined,
        notes: form.notes || undefined,
      })
      toast.success('Lead criado!')
      setShowCreate(false)
      setForm({ contactId: '', pipelineStageId: '', source: '', value: '', notes: '' })
      loadData()
    } catch {
      toast.error('Erro ao criar lead')
    }
  }

  const handleAddStage = async () => {
    if (!newStageName.trim() || !boardId) return
    try {
      await crmBoardsApi.addStage(boardId, newStageName.trim())
      toast.success('Etapa adicionada!')
      setNewStageName('')
      setShowAddStage(false)
      loadData()
    } catch {
      toast.error('Erro ao adicionar etapa')
    }
  }

  const handleDeleteStage = async (stageId: string) => {
    if (!boardId) return
    if (!confirm('Remover esta etapa? Os leads dela ficarão sem etapa.')) return
    try {
      await crmBoardsApi.deleteStage(boardId, stageId)
      toast.success('Etapa removida')
      loadData()
    } catch {
      toast.error('Erro ao remover etapa')
    }
  }

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm('Excluir este lead? Esta ação não pode ser desfeita.')) return
    // Remove otimisticamente da UI
    setColumns(prev => prev.map(c => ({ ...c, leads: c.leads.filter(l => l.id !== leadId) })))
    try {
      await leadsApi.remove(leadId)
      toast.success('Lead excluído')
    } catch {
      toast.error('Erro ao excluir lead')
      loadData()
    }
  }

  // ── Chat do lead ───────────────────────────────────────────────────────────
  const openChat = async (lead: LeadWithChat) => {
    setChatLead(lead)
    setChatMessages([])
    setChatLoading(true)
    // Zera badge localmente
    setColumns(prev => prev.map(c => ({
      ...c,
      leads: c.leads.map(l => l.id === lead.id ? { ...l, unreadCount: 0 } as any : l),
    })))
    try {
      const res = await leadsApi.getMessages(lead.id)
      setChatMessages(res.data.data.messages || [])
    } catch {
      toast.error('Erro ao carregar conversa')
    } finally {
      setChatLoading(false)
    }
  }

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !chatLead?.contact?.phone) return
    const body = chatInput.trim()
    setChatInput('')
    setChatSending(true)
    try {
      const res = await whatsappApi.sendMessage(chatLead.contact.phone, body)
      setChatMessages(prev => [...prev, res.data.data])
    } catch {
      toast.error('Erro ao enviar — verifique se há um número conectado')
      setChatInput(body)
    } finally {
      setChatSending(false)
    }
  }

  // Auto-scroll do chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Socket: novas mensagens atualizam badges e o chat aberto
  useEffect(() => {
    const socket = getSocket()
    const handler = (payload: any) => {
      const contactId = payload?.contact?.id || payload?.message?.contactId
      // Atualiza badge no card correspondente
      setColumns(prev => prev.map(c => ({
        ...c,
        leads: c.leads.map(l => {
          if (l.contactId === contactId && (!chatLead || chatLead.id !== l.id)) {
            return { ...l, unreadCount: ((l as any).unreadCount || 0) + 1 } as any
          }
          return l
        }),
      })))
      // Se o chat desse contato está aberto, anexa a mensagem
      if (chatLead && chatLead.contact?.id === contactId && payload?.message) {
        setChatMessages(prev => [...prev, payload.message])
      }
    }
    socket.on('new-message', handler)
    return () => { socket.off('new-message', handler) }
  }, [chatLead])

  if (loading) return <PageLoader />

  const filteredColumns = columns.map((col) => ({
    ...col,
    leads: col.leads.filter((l) =>
      (l.contact?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.contact?.phone || '').includes(search)
    ),
  }))

  // Etapas para o modal de criar lead (board atual ou legado)
  const modalStages = currentBoard?.stages || legacyStages

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 md:p-6 border-b border-border bg-bg-secondary flex-shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-lg md:text-xl font-bold text-text-primary flex items-center gap-2">
              {currentBoard && (
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: currentBoard.color }} />
              )}
              {currentBoard?.name || 'CRM — Kanban'}
            </h1>
            <p className="text-text-muted text-sm">
              {columns.reduce((acc, c) => acc + c.leads.length, 0)} leads no funil
            </p>
          </div>

          {/* Switcher de boards */}
          {boards.length > 0 && (
            <div className="relative">
              <Layers size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <select
                value={boardId}
                onChange={(e) => setSearchParams({ board: e.target.value })}
                className="input-field pl-9 pr-8 py-2 text-sm appearance-none cursor-pointer"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar lead..."
              className="input-field pl-9 py-2 text-sm w-40 md:w-52"
            />
          </div>
          {isAdmin && boardId && (
            <button
              onClick={() => setShowAddStage(true)}
              className="btn-ghost border border-border flex items-center gap-2 text-sm"
            >
              <Plus size={15} /> Coluna
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus size={16} />
            Novo Lead
          </button>
        </div>
      </div>

      {/* Kanban */}
      {columns.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
          <Layers size={40} className="mb-3 opacity-30" />
          <p>Este board não tem etapas ainda</p>
          {isAdmin && boardId && (
            <button onClick={() => setShowAddStage(true)} className="btn-primary mt-4 flex items-center gap-2">
              <Plus size={16} /> Adicionar primeira etapa
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto p-6">
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-4 h-full">
              {filteredColumns.map((col) => (
                <KanbanCol
                  key={col.id}
                  column={col}
                  canManage={isAdmin && !!boardId}
                  onDelete={handleDeleteStage}
                  onDeleteLead={handleDeleteLead}
                  onOpenChat={openChat}
                />
              ))}
            </div>
          </DragDropContext>
        </div>
      )}

      {/* Modal adicionar etapa */}
      {showAddStage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-text-primary">Nova Etapa</h3>
              <button onClick={() => setShowAddStage(false)} className="p-1 hover:bg-bg-secondary rounded"><X size={16} /></button>
            </div>
            <input
              autoFocus
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddStage()}
              placeholder="Nome da etapa (ex: Em Negociação)"
              className="input-field w-full"
            />
            <div className="flex gap-2 mt-4">
              <button className="btn-primary flex-1" onClick={handleAddStage}>Adicionar</button>
              <button className="btn-ghost flex-1 border border-border" onClick={() => setShowAddStage(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drawer de Chat do Lead ── */}
      {chatLead && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setChatLead(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md h-full flex flex-col border-l border-border shadow-modal animate-slide-in"
            style={{ background: 'linear-gradient(180deg, #0f1622 0%, #0a0f1e 100%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-border flex-shrink-0">
              <div className="w-10 h-10 bg-bg-tertiary rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-text-secondary font-medium text-sm">
                  {chatLead.contact?.name?.charAt(0).toUpperCase() || '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-text-primary font-semibold text-sm truncate">{chatLead.contact?.name || 'Contato'}</p>
                <p className="text-text-muted text-xs">{chatLead.contact?.phone}</p>
              </div>
              <button onClick={() => setChatLead(null)} className="text-text-muted hover:text-text-primary p-1">
                <X size={18} />
              </button>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {chatLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-text-muted">
                  <MessageSquare size={36} className="mb-2 opacity-20" />
                  <p className="text-sm">Nenhuma mensagem ainda</p>
                  <p className="text-xs mt-1">Envie a primeira mensagem abaixo</p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                    <div className={msg.direction === 'OUT' ? 'message-bubble-out' : 'message-bubble-in'}>
                      {msg.textBody && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.textBody}</p>}
                      {!msg.textBody && <p className="text-sm opacity-60">[mídia]</p>}
                      <p className={`text-xs mt-1 ${msg.direction === 'OUT' ? 'text-white/60' : 'text-text-muted'}`}>
                        {format(new Date(msg.sentAt || msg.createdAt), 'HH:mm')}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border flex-shrink-0 flex items-end gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage() }
                }}
                placeholder="Digite uma mensagem..."
                rows={1}
                className="input-field flex-1 resize-none max-h-24 py-2.5"
              />
              <button
                onClick={sendChatMessage}
                disabled={chatSending || !chatInput.trim()}
                className="btn-primary p-2.5 rounded-xl flex-shrink-0"
                title="Enviar"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal criar lead */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Novo Lead">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Contato *</label>
            <select
              value={form.contactId}
              onChange={(e) => setForm({ ...form, contactId: e.target.value })}
              className="input-field"
            >
              <option value="">Selecione um contato</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Etapa do Funil</label>
            <select
              value={form.pipelineStageId}
              onChange={(e) => setForm({ ...form, pipelineStageId: e.target.value })}
              className="input-field"
            >
              <option value="">Primeira etapa (padrão)</option>
              {modalStages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Origem</label>
              <input
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="WhatsApp, Indicação..."
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Valor (R$)</label>
              <input
                type="number"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder="0,00"
                className="input-field"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Observações</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Informações sobre o lead..."
              rows={3}
              className="input-field resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowCreate(false)} className="flex-1 btn-ghost border border-border">
              Cancelar
            </button>
            <button onClick={createLead} className="flex-1 btn-primary">
              Criar Lead
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

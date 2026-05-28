import { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Plus, Phone, User, TrendingUp, Search } from 'lucide-react'
import { leadsApi, pipelineApi, contactsApi } from '../services/api'
import { Lead, PipelineStage, Contact, KanbanColumn } from '../types'
import Modal from '../components/UI/Modal'
import { StatusBadge } from '../components/UI/Badge'
import { PageLoader } from '../components/UI/LoadingSpinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

function LeadCard({ lead, index }: { lead: Lead; index: number }) {
  return (
    <Draggable draggableId={lead.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`kanban-card mb-3 ${snapshot.isDragging ? 'shadow-glow rotate-1' : ''}`}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="text-text-primary text-sm font-medium leading-tight">
              {lead.contact?.name || 'Sem nome'}
            </h4>
            <StatusBadge status={lead.status} />
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

function KanbanCol({ column }: { column: KanbanColumn }) {
  return (
    <div className="flex flex-col bg-bg-secondary rounded-2xl border border-border w-64 flex-shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
          <h3 className="text-text-primary text-sm font-semibold">{column.name}</h3>
          <span className="ml-auto text-text-muted text-xs bg-bg-tertiary px-2 py-0.5 rounded-full">
            {column.leads.length}
          </span>
        </div>
      </div>

      {/* Cards */}
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
              <LeadCard key={lead.id} lead={lead} index={index} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}

export default function CRM() {
  const [columns, setColumns] = useState<KanbanColumn[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    contactId: '', pipelineStageId: '', source: '', value: '', notes: ''
  })

  const loadData = async () => {
    try {
      const [kanbanRes, stagesRes, contactsRes] = await Promise.all([
        pipelineApi.getKanban(),
        pipelineApi.getStages(),
        contactsApi.findAll(),
      ])
      setColumns(kanbanRes.data.data)
      setStages(stagesRes.data.data)
      setContacts(contactsRes.data.data)
    } catch {
      toast.error('Erro ao carregar CRM')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

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

  if (loading) return <PageLoader />

  const filteredColumns = columns.map((col) => ({
    ...col,
    leads: col.leads.filter((l) =>
      (l.contact?.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.contact?.phone || '').includes(search)
    ),
  }))

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border bg-bg-secondary flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-text-primary">CRM — Kanban</h1>
          <p className="text-text-muted text-sm">
            {columns.reduce((acc, c) => acc + c.leads.length, 0)} leads no funil
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar lead..."
              className="input-field pl-9 py-2 text-sm w-52"
            />
          </div>
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
      <div className="flex-1 overflow-x-auto p-6">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 h-full">
            {filteredColumns.map((col) => (
              <KanbanCol key={col.id} column={col} />
            ))}
          </div>
        </DragDropContext>
      </div>

      {/* Modal criar lead */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Novo Lead">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Contato *
            </label>
            <select
              value={form.contactId}
              onChange={(e) => setForm({ ...form, contactId: e.target.value })}
              className="input-field"
            >
              <option value="">Selecione um contato</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.phone}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Etapa do Funil
            </label>
            <select
              value={form.pipelineStageId}
              onChange={(e) => setForm({ ...form, pipelineStageId: e.target.value })}
              className="input-field"
            >
              <option value="">Primeira etapa (padrão)</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Origem
              </label>
              <input
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="WhatsApp, Indicação..."
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Valor (R$)
              </label>
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
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Observações
            </label>
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

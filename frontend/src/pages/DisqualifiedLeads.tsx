import { useState, useEffect, useCallback } from 'react'
import { leadsApi, usersApi, whatsappApi } from '../services/api'
import { User } from '../types'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import Modal from '../components/UI/Modal'
import Badge from '../components/UI/Badge'
import { UserX, Loader2, MapPin, ArrowRightLeft } from 'lucide-react'

const DISQUALIFIED_SOURCES = ['robo-fora-area', 'robo-nao-interesse', 'robo-sem-resposta', 'chatbot-timeout']

const REASON_LABEL: Record<string, { label: string; variant: 'warning' | 'muted' | 'default' }> = {
  'robo-fora-area': { label: 'Fora de área', variant: 'warning' },
  'robo-nao-interesse': { label: 'Sem interesse', variant: 'muted' },
  'robo-sem-resposta': { label: 'Não respondeu', variant: 'muted' },
  'chatbot-timeout': { label: 'Timeout', variant: 'muted' },
}

interface DisqualifiedLead {
  id: string
  source?: string
  notes?: string
  createdAt: string
  contact?: { id: string; name: string; phone: string; city?: string }
  responsibleUser?: { id: string; name: string; role?: 'ADMIN' | 'USER' }
}

export default function DisqualifiedLeads() {
  const [leads, setLeads] = useState<DisqualifiedLead[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const [assignLead, setAssignLead] = useState<DisqualifiedLead | null>(null)
  const [vendorId, setVendorId] = useState('')
  const [assigning, setAssigning] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await leadsApi.findAll({ source: DISQUALIFIED_SOURCES.join(',') })
      setLeads(res.data.data)
    } catch {
      toast.error('Erro ao carregar leads desqualificados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    usersApi.findAll().then((res) => setUsers(res.data.data.filter((u: User) => u.isActive && u.role === 'USER'))).catch(() => {})
  }, [load])

  const visibleLeads = showAll ? leads : leads.filter((l) => l.responsibleUser?.role === 'ADMIN')

  function openAssign(lead: DisqualifiedLead) {
    setAssignLead(lead)
    setVendorId('')
  }

  async function confirmAssign() {
    if (!assignLead?.contact?.phone || !vendorId) { toast.error('Escolha o vendedor'); return }
    setAssigning(true)
    try {
      const res = await whatsappApi.routeToVendor(assignLead.contact.phone, vendorId)
      const notified = res.data?.data?.notified
      toast.success(notified
        ? 'Lead atribuído! O vendedor recebeu o link no WhatsApp. 📲'
        : 'Lead atribuído — mas o aviso não chegou no WhatsApp do vendedor (número offline?). Ele vê no painel.')
      setAssignLead(null)
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao atribuir lead')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <UserX size={22} className="text-primary" /> Leads Desqualificados
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            Fora de área, sem interesse ou sem resposta — veja e atribua manualmente a um vendedor quando fizer sentido.
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-bg-hover border border-border">
          <button
            onClick={() => setShowAll(false)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium ${!showAll ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            Aguardando triagem
          </button>
          <button
            onClick={() => setShowAll(true)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium ${showAll ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            Todos
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={28} /></div>
      ) : visibleLeads.length === 0 ? (
        <div className="card p-12 text-center text-text-muted">
          <UserX size={40} className="mx-auto mb-3 opacity-30" />
          <p>{showAll ? 'Nenhum lead desqualificado ainda' : 'Nada aguardando triagem — tudo em dia! 🎉'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleLeads.map((lead) => {
            const reason = (lead.source && REASON_LABEL[lead.source]) || { label: lead.source || '—', variant: 'default' as const }
            const isAdminOwned = lead.responsibleUser?.role === 'ADMIN'
            return (
              <div key={lead.id} className="card p-4 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-text-primary">{lead.contact?.name || lead.contact?.phone}</p>
                    <Badge variant={reason.variant}>{reason.label}</Badge>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">{lead.contact?.phone}</p>
                  {lead.contact?.city && (
                    <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                      <MapPin size={11} /> {lead.contact.city}
                    </p>
                  )}
                  {lead.notes && (
                    <p className="text-xs text-text-muted mt-2 line-clamp-2">{lead.notes}</p>
                  )}
                  <p className="text-[11px] text-text-muted mt-2">
                    {formatDistanceToNow(new Date(lead.createdAt), { locale: ptBR, addSuffix: true })}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isAdminOwned ? 'bg-bg-hover text-text-muted' : 'bg-success/15 text-success'}`}>
                    {lead.responsibleUser?.name || '—'}{isAdminOwned ? ' (sem vendedor)' : ''}
                  </span>
                  <button
                    onClick={() => openAssign(lead)}
                    className="text-xs px-2 py-1 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 flex items-center gap-1"
                  >
                    <ArrowRightLeft size={12} /> Atribuir a vendedor
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: atribuir a vendedor */}
      <Modal
        isOpen={!!assignLead}
        onClose={() => setAssignLead(null)}
        title="Atribuir a vendedor"
        size="sm"
      >
        <p className="text-xs text-text-muted mb-4">
          <b className="text-text-secondary">{assignLead?.contact?.name || assignLead?.contact?.phone}</b> passa
          a ser responsabilidade do vendedor escolhido (lead, contato e conversa juntos).
        </p>
        <label className="text-sm text-text-muted">Vendedor *</label>
        <select className="input w-full mt-1" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">Selecione...</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>

        <div className="flex items-start gap-2 rounded-xl p-3 mt-4"
          style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.25)' }}>
          <span className="text-base leading-none">📲</span>
          <p className="text-[11px] text-text-secondary leading-relaxed">
            O vendedor recebe <b>no WhatsApp dele</b> um aviso com o <b>link do cliente</b> pra chamar.
            Nenhuma mensagem é enviada ao cliente — quem chama é o vendedor.
          </p>
        </div>

        <div className="flex gap-2 mt-5">
          <button className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={confirmAssign} disabled={assigning}>
            {assigning ? <><Loader2 size={16} className="animate-spin" /> Atribuindo...</> : 'Confirmar'}
          </button>
          <button className="btn-ghost flex-1 border border-border" onClick={() => setAssignLead(null)}>Cancelar</button>
        </div>
      </Modal>
    </div>
  )
}

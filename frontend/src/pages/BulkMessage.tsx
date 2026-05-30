import { useState, useEffect } from 'react'
import { api } from '../services/api'
import toast from 'react-hot-toast'
import { Send, Plus, Trash2, Play, Eye, Users, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface BulkMsg {
  id: string
  name: string
  message: string
  status: string
  filterType: string
  filterValue?: string
  filterDays?: number
  totalCount: number
  sentCount: number
  failedCount: number
  createdAt: string
  startedAt?: string
  finishedAt?: string
  createdBy: { name: string }
}

interface Stage { id: string; name: string }
interface Board { id: string; name: string; stages: Stage[] }
interface Campaign { id: string; name: string }

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '📋 Rascunho', RUNNING: '🔄 Enviando', DONE: '✅ Concluído', FAILED: '❌ Falhou'
}
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700', RUNNING: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700', FAILED: 'bg-red-100 text-red-700',
}

export default function BulkMessage() {
  const [list, setList] = useState<BulkMsg[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [boards, setBoards] = useState<Board[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [preview, setPreview] = useState<{ count: number; samples: any[] } | null>(null)
  const [previewing, setPreviewing] = useState(false)

  const [form, setForm] = useState({
    name: '', message: '', filterType: 'stage', filterValue: '', filterDays: 3,
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [listRes, boardsRes, campRes] = await Promise.all([
        api.get('/bulk-messages'),
        api.get('/crm-boards'),
        api.get('/roulette/campaigns'),
      ])
      setList(listRes.data.data)
      setBoards(boardsRes.data.data)
      setCampaigns(campRes.data.data)
    } catch { toast.error('Erro ao carregar') }
    finally { setLoading(false) }
  }

  async function handlePreview() {
    setPreviewing(true)
    try {
      const res = await api.post('/bulk-messages/preview', {
        filterType: form.filterType,
        filterValue: form.filterValue || undefined,
        filterDays: form.filterType === 'no_response' ? form.filterDays : undefined,
      })
      setPreview(res.data.data)
    } catch { toast.error('Erro ao calcular') }
    finally { setPreviewing(false) }
  }

  async function handleCreate() {
    if (!form.name || !form.message) { toast.error('Nome e mensagem obrigatórios'); return }
    try {
      await api.post('/bulk-messages', {
        ...form,
        filterValue: form.filterValue || undefined,
        filterDays: form.filterType === 'no_response' ? form.filterDays : undefined,
      })
      toast.success('Campanha criada!')
      setShowCreate(false)
      setForm({ name: '', message: '', filterType: 'stage', filterValue: '', filterDays: 3 })
      setPreview(null)
      loadAll()
    } catch { toast.error('Erro ao criar') }
  }

  async function handleSend(id: string) {
    if (!confirm('Disparar mensagens agora? Isso enviará para todos os contatos selecionados.')) return
    try {
      await api.post(`/bulk-messages/${id}/send`)
      toast.success('Disparo iniciado!')
      setTimeout(loadAll, 2000)
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao disparar')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deletar campanha?')) return
    try {
      await api.delete(`/bulk-messages/${id}`)
      toast.success('Removida')
      loadAll()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao deletar')
    }
  }

  // Estágios do board selecionado
  const selectedBoard = boards.find(b => b.id === form.filterValue)
  const allStages = boards.flatMap(b => b.stages.map(s => ({ ...s, boardName: b.name })))

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Send size={22} className="text-primary" /> Envio em Massa
          </h1>
          <p className="text-sm text-text-muted mt-0.5">Dispare mensagens para grupos de contatos de uma vez</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAll} className="btn-ghost p-2 rounded-lg"><RefreshCw size={16} /></button>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nova Campanha
          </button>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
      ) : list.length === 0 ? (
        <div className="card p-12 text-center text-text-muted">
          <Send size={40} className="mx-auto mb-3 opacity-30" />
          <p>Nenhuma campanha criada ainda</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(b => (
            <div key={b.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-text-primary">{b.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[b.status]}`}>
                      {STATUS_LABELS[b.status] || b.status}
                    </span>
                  </div>
                  <p className="text-sm text-text-muted mt-1 line-clamp-2">{b.message}</p>
                  <div className="flex gap-4 mt-2">
                    <span className="text-xs text-text-muted flex items-center gap-1">
                      <Users size={12} /> {b.totalCount} destinatários
                    </span>
                    {b.sentCount > 0 && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle size={12} /> {b.sentCount} enviados
                      </span>
                    )}
                    {b.failedCount > 0 && (
                      <span className="text-xs text-red-500 flex items-center gap-1">
                        <XCircle size={12} /> {b.failedCount} falharam
                      </span>
                    )}
                    <span className="text-xs text-text-muted flex items-center gap-1">
                      <Clock size={12} />
                      {format(new Date(b.createdAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  {b.status === 'RUNNING' && (
                    <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${b.totalCount > 0 ? ((b.sentCount + b.failedCount) / b.totalCount) * 100 : 0}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {b.status === 'DRAFT' && (
                    <button onClick={() => handleSend(b.id)}
                      className="btn-primary text-xs px-3 py-1.5 rounded-lg flex items-center gap-1">
                      <Play size={12} /> Disparar
                    </button>
                  )}
                  {b.status === 'RUNNING' && (
                    <button onClick={loadAll} className="btn-ghost text-xs px-3 py-1.5 rounded-lg flex items-center gap-1">
                      <RefreshCw size={12} className="animate-spin" /> Atualizar
                    </button>
                  )}
                  {(b.status === 'DRAFT' || b.status === 'DONE' || b.status === 'FAILED') && (
                    <button onClick={() => handleDelete(b.id)} className="text-red-400 hover:text-red-600 p-1.5">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card rounded-2xl p-6 w-full max-w-xl shadow-xl my-4">
            <h3 className="font-bold text-text-primary mb-5 text-lg flex items-center gap-2">
              <Send size={18} /> Nova Campanha de Envio
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text-muted">Nome da campanha *</label>
                <input className="input w-full mt-1" placeholder="Ex: Remarketing clientes sem resposta"
                  value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>

              <div>
                <label className="text-sm font-medium text-text-muted">Quem vai receber? *</label>
                <select className="input w-full mt-1" value={form.filterType}
                  onChange={e => { setForm(p => ({ ...p, filterType: e.target.value, filterValue: '' })); setPreview(null) }}>
                  <option value="stage">📋 Por etapa do CRM</option>
                  <option value="board">🗂️ Por board de CRM</option>
                  <option value="campaign">📣 Por campanha</option>
                  <option value="no_response">😶 Sem resposta há X dias</option>
                  <option value="tag">🏷️ Por tag do lead</option>
                </select>
              </div>

              {form.filterType === 'stage' && (
                <div>
                  <label className="text-sm font-medium text-text-muted">Etapa</label>
                  <select className="input w-full mt-1" value={form.filterValue}
                    onChange={e => setForm(p => ({ ...p, filterValue: e.target.value }))}>
                    <option value="">Selecione uma etapa...</option>
                    {allStages.map(s => <option key={s.id} value={s.id}>{s.boardName} → {s.name}</option>)}
                  </select>
                </div>
              )}

              {form.filterType === 'board' && (
                <div>
                  <label className="text-sm font-medium text-text-muted">Board de CRM</label>
                  <select className="input w-full mt-1" value={form.filterValue}
                    onChange={e => setForm(p => ({ ...p, filterValue: e.target.value }))}>
                    <option value="">Selecione um board...</option>
                    {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}

              {form.filterType === 'campaign' && (
                <div>
                  <label className="text-sm font-medium text-text-muted">Campanha</label>
                  <select className="input w-full mt-1" value={form.filterValue}
                    onChange={e => setForm(p => ({ ...p, filterValue: e.target.value }))}>
                    <option value="">Selecione uma campanha...</option>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {form.filterType === 'no_response' && (
                <div>
                  <label className="text-sm font-medium text-text-muted">Sem resposta há quantos dias?</label>
                  <input type="number" min={1} max={365} className="input w-full mt-1"
                    value={form.filterDays}
                    onChange={e => setForm(p => ({ ...p, filterDays: Number(e.target.value) }))} />
                </div>
              )}

              {form.filterType === 'tag' && (
                <div>
                  <label className="text-sm font-medium text-text-muted">Tag</label>
                  <input className="input w-full mt-1" placeholder="Ex: paga-segunda, vip, follow-up"
                    value={form.filterValue} onChange={e => setForm(p => ({ ...p, filterValue: e.target.value }))} />
                </div>
              )}

              {/* Preview */}
              <div className="flex items-center gap-3">
                <button onClick={handlePreview} disabled={previewing}
                  className="btn-ghost flex items-center gap-2 text-sm px-3 py-2 rounded-lg">
                  <Eye size={14} /> {previewing ? 'Calculando...' : 'Ver quantos receberão'}
                </button>
                {preview && (
                  <div className={`text-sm font-semibold ${preview.count > 0 ? 'text-primary' : 'text-text-muted'}`}>
                    {preview.count} contatos
                    {preview.samples.length > 0 && (
                      <span className="font-normal text-text-muted ml-2">
                        ({preview.samples.map(s => s.name || s.phone).join(', ')}
                        {preview.count > preview.samples.length ? ` e mais ${preview.count - preview.samples.length}...` : ''})
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-text-muted">
                  Mensagem * <span className="text-xs text-text-muted ml-1">(use {'{{nome}}'} para personalizar)</span>
                </label>
                <textarea className="input w-full mt-1 h-32 resize-none" rows={4}
                  placeholder="Olá {{nome}}, tudo bem? Passando para saber se ainda tem interesse..."
                  value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} />
                <p className="text-xs text-text-muted mt-1">{form.message.length} caracteres</p>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={handleCreate}>
                <Plus size={16} /> Criar Campanha
              </button>
              <button className="btn-ghost flex-1" onClick={() => { setShowCreate(false); setPreview(null) }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

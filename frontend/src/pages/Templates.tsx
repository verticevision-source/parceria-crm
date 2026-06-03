import { useState, useEffect } from 'react'
import { templatesApi } from '../services/api'
import toast from 'react-hot-toast'
import { FileText, Plus, Trash2, RefreshCw, Info, CheckCircle, Clock, XCircle } from 'lucide-react'

interface Template {
  id: string; name: string; status: string; category: string; language: string; body: string
}

const STATUS_META: Record<string, { label: string; cls: string; icon: any }> = {
  APPROVED: { label: 'Aprovado', cls: 'bg-green-500/15 text-green-500', icon: CheckCircle },
  PENDING:  { label: 'Em análise', cls: 'bg-yellow-500/15 text-yellow-500', icon: Clock },
  REJECTED: { label: 'Rejeitado', cls: 'bg-red-500/15 text-red-400', icon: XCircle },
}

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'MARKETING', language: 'pt_BR', body: '' })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await templatesApi.list()
      setTemplates(res.data.data)
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao carregar modelos')
    } finally { setLoading(false) }
  }

  async function create() {
    if (!form.name.trim() || !form.body.trim()) { toast.error('Preencha nome e mensagem'); return }
    setSaving(true)
    try {
      await templatesApi.create(form)
      toast.success('Modelo enviado para aprovação da Meta!')
      setShowCreate(false)
      setForm({ name: '', category: 'MARKETING', language: 'pt_BR', body: '' })
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao criar modelo')
    } finally { setSaving(false) }
  }

  async function remove(name: string) {
    if (!confirm(`Remover o modelo "${name}"?`)) return
    try { await templatesApi.remove(name); toast.success('Modelo removido'); load() }
    catch { toast.error('Erro ao remover') }
  }

  const varCount = (form.body.match(/\{\{\d+\}\}/g) || []).length

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <FileText size={22} className="text-primary" /> Modelos de Mensagem
          </h1>
          <p className="text-sm text-text-muted mt-0.5">Para iniciar conversas com quem ainda não te respondeu</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost p-2 rounded-lg"><RefreshCw size={16} /></button>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Novo Modelo</button>
        </div>
      </div>

      {/* Aviso explicativo */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-bg-tertiary text-sm text-text-secondary">
        <Info size={16} className="text-primary flex-shrink-0 mt-0.5" />
        <p>A Meta exige um modelo <b>aprovado</b> para mensagens iniciadas pela empresa (prospecção). Crie aqui, aguarde a aprovação (geralmente minutos), e depois use no "Iniciar conversa" dos Contatos. Use <code className="text-primary">{'{{1}}'}</code>, <code className="text-primary">{'{{2}}'}</code>... para personalizar (ex: nome do cliente).</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
      ) : templates.length === 0 ? (
        <div className="card p-12 text-center text-text-muted">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p className="mb-1">Nenhum modelo criado ainda</p>
          <p className="text-xs">Crie seu primeiro modelo de abordagem</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const sm = STATUS_META[t.status] || { label: t.status, cls: 'bg-bg-tertiary text-text-muted', icon: Clock }
            const Icon = sm.icon
            return (
              <div key={t.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-text-primary font-mono text-sm">{t.name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${sm.cls}`}>
                        <Icon size={10} /> {sm.label}
                      </span>
                      <span className="text-[10px] text-text-muted uppercase">{t.category} · {t.language}</span>
                    </div>
                    <p className="text-sm text-text-secondary mt-2 whitespace-pre-wrap">{t.body}</p>
                  </div>
                  <button onClick={() => remove(t.name)} className="text-red-400 hover:text-red-600 p-1 flex-shrink-0"><Trash2 size={15} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal criar */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-panel max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2"><Plus size={18} className="text-primary" /> Novo Modelo</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-text-muted">Nome interno (sem espaços)</label>
                <input className="input w-full mt-1 font-mono text-sm" placeholder="primeira_abordagem"
                  value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-text-muted">Categoria</label>
                  <select className="input w-full mt-1" value={form.category} onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))}>
                    <option value="MARKETING">Marketing (prospecção)</option>
                    <option value="UTILITY">Utilidade (avisos/confirmações)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-text-muted">Idioma</label>
                  <select className="input w-full mt-1" value={form.language} onChange={(e) => setForm(p => ({ ...p, language: e.target.value }))}>
                    <option value="pt_BR">Português (BR)</option>
                    <option value="en_US">Inglês (US)</option>
                    <option value="es_ES">Espanhol</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-text-muted">Mensagem</label>
                <textarea className="input w-full mt-1 resize-none" rows={4}
                  placeholder="Olá {{1}}, tudo bem? Aqui é a Leydi. Vi que você tem interesse em..."
                  value={form.body} onChange={(e) => setForm(p => ({ ...p, body: e.target.value }))} />
                <p className="text-xs text-text-muted mt-1">
                  {varCount > 0 ? `${varCount} variável(is) detectada(s). ` : ''}
                  Use {'{{1}}'} para o nome do cliente, por exemplo.
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button className="btn-primary flex-1" onClick={create} disabled={saving}>{saving ? 'Enviando...' : 'Criar e enviar p/ aprovação'}</button>
              <button className="btn-ghost flex-1 border border-border" onClick={() => setShowCreate(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

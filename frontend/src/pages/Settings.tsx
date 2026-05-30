import { useState, useEffect } from 'react'
import {
  User, Lock, Save, Shield, Zap, Plus, Trash2, Edit3, Check,
  X, Layers, Tag, AlignLeft, Hash, ToggleLeft, Calendar, ChevronDown, Sparkles
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { usersApi, quickRepliesApi, pipelineApi, customFieldsApi, aiApi } from '../services/api'
import Logo from '../components/Logo'
import { QuickReply, PipelineStage, CustomField } from '../types'
import toast from 'react-hot-toast'

type Tab = 'profile' | 'security' | 'quickreplies' | 'pipeline' | 'customfields' | 'ai'

// ─── AI Settings tab ──────────────────────────────────────────────────────────
function AISettingsTab() {
  const [cfg, setCfg] = useState({ provider: 'gemini', model: '', systemPrompt: '', enabled: false, hasApiKey: false })
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    aiApi.getConfig()
      .then((r) => setCfg(r.data.data))
      .catch(() => toast.error('Erro ao carregar config de IA'))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const payload: any = {
        provider: cfg.provider, model: cfg.model,
        systemPrompt: cfg.systemPrompt, enabled: cfg.enabled,
      }
      if (apiKey.trim()) payload.apiKey = apiKey.trim()
      const r = await aiApi.updateConfig(payload)
      setCfg(r.data.data)
      setApiKey('')
      toast.success('Configuração de IA salva!')
    } catch { toast.error('Erro ao salvar') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" /></div>

  const modelPlaceholder = cfg.provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash'

  return (
    <div className="card max-w-xl">
      <div className="flex items-center gap-2 mb-5">
        <Sparkles size={18} className="text-primary-light" />
        <h3 className="text-text-primary font-bold">Assistente de IA</h3>
      </div>
      <div className="space-y-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <div onClick={() => setCfg({ ...cfg, enabled: !cfg.enabled })}
            className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${cfg.enabled ? 'bg-primary' : 'bg-bg-tertiary border border-border'}`}>
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${cfg.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-text-secondary text-sm">Ativar assistente de IA no sistema</span>
        </label>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Provedor</label>
          <select value={cfg.provider} onChange={(e) => setCfg({ ...cfg, provider: e.target.value })} className="input-field">
            <option value="gemini">Google Gemini (cota grátis)</option>
            <option value="openai">OpenAI (ChatGPT)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Chave de API {cfg.hasApiKey && <span className="text-success text-xs">✓ configurada</span>}
          </label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder={cfg.hasApiKey ? '•••••••• (deixe vazio para manter)' : 'Cole sua API key aqui'} className="input-field" />
          <p className="text-xs text-text-muted mt-1">
            {cfg.provider === 'gemini'
              ? 'Gere grátis em aistudio.google.com/apikey'
              : 'Gere em platform.openai.com/api-keys (requer créditos)'}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Modelo (opcional)</label>
          <input value={cfg.model || ''} onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
            placeholder={modelPlaceholder} className="input-field" />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Instruções do negócio (system prompt)</label>
          <textarea value={cfg.systemPrompt || ''} onChange={(e) => setCfg({ ...cfg, systemPrompt: e.target.value })}
            rows={5} className="input-field resize-none"
            placeholder="Ex: Você é atendente da Loja X. Seja cordial, responda dúvidas sobre produtos esportivos, horário de funcionamento 9h-18h..." />
        </div>

        <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
          <Save size={15} /> {saving ? 'Salvando...' : 'Salvar Configuração'}
        </button>
      </div>
    </div>
  )
}

// ─── Field type icon ───────────────────────────────────────────────────────────
function FieldTypeIcon({ type }: { type: CustomField['type'] }) {
  switch (type) {
    case 'TEXT':    return <AlignLeft size={14} />
    case 'NUMBER':  return <Hash size={14} />
    case 'DATE':    return <Calendar size={14} />
    case 'SELECT':  return <ChevronDown size={14} />
    case 'BOOLEAN': return <ToggleLeft size={14} />
    default:        return <AlignLeft size={14} />
  }
}

// ─── QuickReplies tab ─────────────────────────────────────────────────────────
function QuickRepliesTab({ isAdmin }: { isAdmin: boolean }) {
  const [replies, setReplies] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ title: '', body: '', isGlobal: false })
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    quickRepliesApi.getAll()
      .then((r) => setReplies(r.data.data || []))
      .catch(() => toast.error('Erro ao carregar respostas'))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) { toast.error('Preencha título e mensagem'); return }
    setSaving(true)
    try {
      if (editId) {
        const r = await quickRepliesApi.update(editId, form)
        setReplies((p) => p.map((qr) => qr.id === editId ? r.data.data : qr))
        toast.success('Resposta atualizada!')
      } else {
        const r = await quickRepliesApi.create(form)
        setReplies((p) => [r.data.data, ...p])
        toast.success('Resposta criada!')
      }
      setForm({ title: '', body: '', isGlobal: false })
      setEditId(null)
    } catch { toast.error('Erro ao salvar') }
    finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Remover esta resposta?')) return
    try {
      await quickRepliesApi.remove(id)
      setReplies((p) => p.filter((qr) => qr.id !== id))
      toast.success('Removida!')
    } catch { toast.error('Erro ao remover') }
  }

  const startEdit = (qr: QuickReply) => {
    setEditId(qr.id)
    setForm({ title: qr.title, body: qr.body, isGlobal: qr.isGlobal })
  }

  return (
    <div>
      {/* Form */}
      <div className="card mb-6">
        <h3 className="text-text-primary font-bold mb-4 flex items-center gap-2">
          <Plus size={16} className="text-gold" />
          {editId ? 'Editar Resposta' : 'Nova Resposta Rápida'}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Título / Atalho</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: saudacao, preco, horario..."
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Mensagem</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Texto completo da resposta..."
              className="input-field resize-none"
              rows={3}
            />
          </div>
          {isAdmin && (
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setForm({ ...form, isGlobal: !form.isGlobal })}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                  form.isGlobal ? 'bg-primary' : 'bg-bg-tertiary border border-border'
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
                  form.isGlobal ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </div>
              <span className="text-text-secondary text-sm">Global (visível para todos os atendentes)</span>
            </label>
          )}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
              {editId ? 'Salvar' : 'Criar'}
            </button>
            {editId && (
              <button onClick={() => { setEditId(null); setForm({ title: '', body: '', isGlobal: false }) }}
                className="btn-ghost border border-border text-sm flex items-center gap-1">
                <X size={14} /> Cancelar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" /></div>
      ) : replies.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-8">Nenhuma resposta rápida criada</p>
      ) : (
        <div className="space-y-2">
          {replies.map((qr) => (
            <div key={qr.id} className="card p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-text-primary font-medium text-sm">{qr.title}</p>
                  {qr.isGlobal && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{ background: 'rgba(245,208,107,0.12)', color: '#F5D06B', border: '1px solid rgba(245,208,107,0.25)' }}>
                      GLOBAL
                    </span>
                  )}
                </div>
                <p className="text-text-muted text-xs line-clamp-2">{qr.body}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => startEdit(qr)}
                  className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-primary transition-colors">
                  <Edit3 size={14} />
                </button>
                <button onClick={() => remove(qr.id)}
                  className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Pipeline tab ─────────────────────────────────────────────────────────────
const STAGE_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6']

function PipelineTab() {
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', color: STAGE_COLORS[0] })
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    pipelineApi.getStages()
      .then((r) => setStages((r.data.data || []).sort((a: PipelineStage, b: PipelineStage) => a.order - b.order)))
      .catch(() => toast.error('Erro ao carregar estágios'))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    try {
      if (editId) {
        const r = await pipelineApi.updateStage(editId, form)
        setStages((p) => p.map((s) => s.id === editId ? r.data.data : s))
        toast.success('Estágio atualizado!')
      } else {
        const r = await pipelineApi.createStage({ ...form, order: stages.length + 1 })
        setStages((p) => [...p, r.data.data])
        toast.success('Estágio criado!')
      }
      setForm({ name: '', color: STAGE_COLORS[0] })
      setEditId(null)
    } catch { toast.error('Erro ao salvar') }
    finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Remover este estágio? Os leads nele perderão o estágio.')) return
    try {
      await pipelineApi.deleteStage(id)
      setStages((p) => p.filter((s) => s.id !== id))
      toast.success('Estágio removido!')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erro ao remover')
    }
  }

  const startEdit = (s: PipelineStage) => {
    setEditId(s.id)
    setForm({ name: s.name, color: s.color })
  }

  return (
    <div>
      <div className="card mb-6">
        <h3 className="text-text-primary font-bold mb-4 flex items-center gap-2">
          <Plus size={16} className="text-primary-light" />
          {editId ? 'Editar Estágio' : 'Novo Estágio do Pipeline'}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nome do Estágio</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Prospecção, Proposta, Fechamento..." className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Cor</label>
            <div className="flex gap-2 flex-wrap">
              {STAGE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110 flex items-center justify-center"
                  style={{ background: c, boxShadow: form.color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : 'none' }}
                >
                  {form.color === c && <Check size={12} className="text-white" />}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
              {editId ? 'Salvar' : 'Criar'}
            </button>
            {editId && (
              <button onClick={() => { setEditId(null); setForm({ name: '', color: STAGE_COLORS[0] }) }}
                className="btn-ghost border border-border text-sm flex items-center gap-1">
                <X size={14} /> Cancelar
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" /></div>
      ) : stages.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-8">Nenhum estágio criado</p>
      ) : (
        <div className="space-y-2">
          {stages.map((s, i) => (
            <div key={s.id} className="card p-4 flex items-center gap-3">
              <span className="text-text-muted text-xs w-6 text-center font-bold">{i + 1}</span>
              <div className="w-3 h-8 rounded-full flex-shrink-0" style={{ background: s.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-text-primary font-medium text-sm">{s.name}</p>
                <p className="text-text-muted text-xs">{s._count?.leads ?? 0} leads</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => startEdit(s)}
                  className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-primary transition-colors">
                  <Edit3 size={14} />
                </button>
                <button onClick={() => remove(s.id)}
                  className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Custom Fields tab ────────────────────────────────────────────────────────
const FIELD_TYPES: { value: CustomField['type']; label: string }[] = [
  { value: 'TEXT',    label: 'Texto' },
  { value: 'NUMBER',  label: 'Número' },
  { value: 'DATE',    label: 'Data' },
  { value: 'SELECT',  label: 'Seleção' },
  { value: 'BOOLEAN', label: 'Sim/Não' },
]

function CustomFieldsTab() {
  const [entity, setEntity] = useState<'CONTACT' | 'LEAD'>('CONTACT')
  const [fields, setFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<{ name: string; fieldKey: string; type: CustomField['type']; entity: 'CONTACT' | 'LEAD'; options: string; isRequired: boolean }>({
    name: '', fieldKey: '', type: 'TEXT', entity: 'CONTACT', options: '', isRequired: false,
  })
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadFields = async (e: 'CONTACT' | 'LEAD') => {
    setLoading(true)
    try {
      const r = await customFieldsApi.getFields(e)
      setFields(r.data.data || [])
    } catch { toast.error('Erro ao carregar campos') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadFields(entity) }, [entity])

  const autoKey = (name: string) =>
    name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 30)

  const save = async () => {
    if (!form.name.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        entity,
        fieldKey: form.fieldKey || autoKey(form.name),
        options: form.type === 'SELECT' && form.options
          ? form.options.split(',').map((o) => o.trim()).filter(Boolean)
          : undefined,
      }
      if (editId) {
        const r = await customFieldsApi.updateField(editId, payload)
        setFields((p) => p.map((f) => f.id === editId ? r.data.data : f))
        toast.success('Campo atualizado!')
      } else {
        const r = await customFieldsApi.createField(payload)
        setFields((p) => [...p, r.data.data])
        toast.success('Campo criado!')
      }
      setForm({ name: '', fieldKey: '', type: 'TEXT', entity, options: '', isRequired: false })
      setEditId(null)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erro ao salvar')
    }
    finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Remover este campo? Os valores existentes também serão removidos.')) return
    try {
      await customFieldsApi.deleteField(id)
      setFields((p) => p.filter((f) => f.id !== id))
      toast.success('Campo removido!')
    } catch { toast.error('Erro ao remover') }
  }

  const startEdit = (f: CustomField) => {
    setEditId(f.id)
    setForm({
      name: f.name, fieldKey: f.fieldKey, type: f.type,
      entity: f.entity, options: f.options?.join(', ') || '', isRequired: f.isRequired,
    })
  }

  return (
    <div>
      {/* Entity toggle */}
      <div className="flex gap-2 mb-6">
        {(['CONTACT', 'LEAD'] as const).map((e) => (
          <button
            key={e}
            onClick={() => { setEntity(e); setEditId(null); setForm({ name: '', fieldKey: '', type: 'TEXT', entity: e, options: '', isRequired: false }) }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              entity === e ? 'bg-primary text-white' : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
            }`}
          >
            {e === 'CONTACT' ? 'Contatos' : 'Leads'}
          </button>
        ))}
      </div>

      {/* Form */}
      <div className="card mb-6">
        <h3 className="text-text-primary font-bold mb-4 flex items-center gap-2">
          <Plus size={16} className="text-primary-light" />
          {editId ? 'Editar Campo' : `Novo Campo — ${entity === 'CONTACT' ? 'Contato' : 'Lead'}`}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nome</label>
            <input value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value, fieldKey: editId ? form.fieldKey : autoKey(e.target.value) })}
              placeholder="Ex: CPF, LinkedIn, Origem..." className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Chave (interno)</label>
            <input value={form.fieldKey} onChange={(e) => setForm({ ...form, fieldKey: e.target.value })}
              placeholder="cpf, linkedin, origem..." className="input-field font-mono text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Tipo</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CustomField['type'] })}
              className="input-field">
              {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {form.type === 'SELECT' && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Opções (separadas por vírgula)</label>
              <input value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })}
                placeholder="Opção 1, Opção 2, Opção 3" className="input-field" />
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <div onClick={() => setForm({ ...form, isRequired: !form.isRequired })}
            className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${form.isRequired ? 'bg-primary' : 'bg-bg-tertiary border border-border'}`}>
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${form.isRequired ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-text-secondary text-sm">Campo obrigatório</span>
        </label>
        <div className="flex gap-2 mt-4">
          <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
            {editId ? 'Salvar' : 'Criar'}
          </button>
          {editId && (
            <button onClick={() => { setEditId(null); setForm({ name: '', fieldKey: '', type: 'TEXT', entity, options: '', isRequired: false }) }}
              className="btn-ghost border border-border text-sm flex items-center gap-1">
              <X size={14} /> Cancelar
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" /></div>
      ) : fields.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-8">Nenhum campo personalizado para {entity === 'CONTACT' ? 'Contatos' : 'Leads'}</p>
      ) : (
        <div className="space-y-2">
          {fields.map((f) => (
            <div key={f.id} className="card p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
                <FieldTypeIcon type={f.type} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-text-primary font-medium text-sm">{f.name}</p>
                  {f.isRequired && <span className="text-danger text-xs">*obrigatório</span>}
                </div>
                <p className="text-text-muted text-xs font-mono">{f.fieldKey} · {FIELD_TYPES.find((t) => t.value === f.type)?.label}</p>
                {f.options && f.options.length > 0 && (
                  <p className="text-text-muted text-xs mt-0.5">Opções: {f.options.join(', ')}</p>
                )}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => startEdit(f)}
                  className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-primary transition-colors">
                  <Edit3 size={14} />
                </button>
                <button onClick={() => remove(f.id)}
                  className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Settings ────────────────────────────────────────────────────────────
export default function Settings() {
  const { user, isAdmin } = useAuth()
  const [tab, setTab] = useState<Tab>('profile')
  const [profileForm, setProfileForm] = useState({ name: user?.name || '', email: user?.email || '' })
  const [passForm,    setPassForm]    = useState({ password: '', confirm: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPass,    setSavingPass]    = useState(false)

  const saveProfile = async () => {
    if (!profileForm.name || !profileForm.email) { toast.error('Nome e e-mail são obrigatórios'); return }
    setSavingProfile(true)
    try {
      await usersApi.update(user!.id, { name: profileForm.name, email: profileForm.email })
      toast.success('Perfil atualizado! Faça login novamente para aplicar.')
    } catch { toast.error('Erro ao atualizar perfil') }
    finally { setSavingProfile(false) }
  }

  const savePassword = async () => {
    if (!passForm.password || !passForm.confirm) { toast.error('Preencha todos os campos'); return }
    if (passForm.password.length < 6) { toast.error('Senha deve ter ao menos 6 caracteres'); return }
    if (passForm.password !== passForm.confirm) { toast.error('As senhas não coincidem'); return }
    setSavingPass(true)
    try {
      await usersApi.update(user!.id, { password: passForm.password })
      toast.success('Senha alterada com sucesso!')
      setPassForm({ password: '', confirm: '' })
    } catch { toast.error('Erro ao alterar senha') }
    finally { setSavingPass(false) }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    // Alterar perfil e senha é exclusivo do administrador (segurança)
    { id: 'profile',      label: 'Perfil',           icon: <User size={15} />,    adminOnly: true },
    { id: 'security',     label: 'Segurança',         icon: <Lock size={15} />,    adminOnly: true },
    { id: 'quickreplies', label: 'Respostas Rápidas', icon: <Zap size={15} /> },
    { id: 'pipeline',     label: 'Pipeline',          icon: <Layers size={15} />,  adminOnly: true },
    { id: 'customfields', label: 'Campos Extra',      icon: <Tag size={15} />,     adminOnly: true },
    { id: 'ai',           label: 'IA',                icon: <Sparkles size={15} />, adminOnly: true },
  ]

  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin)

  // Garante que a aba ativa seja visível (usuário comum cai em respostas rápidas)
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === tab) && visibleTabs[0]) {
      setTab(visibleTabs[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  return (
    <div className="p-8 max-w-4xl animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">Configurações</h1>
        <p className="text-text-muted text-sm mt-1">Perfil, segurança e personalização do CRM</p>
      </div>

      {/* Avatar card */}
      <div className="rounded-2xl p-6 mb-6 flex items-center gap-5 border"
        style={{ background: 'linear-gradient(135deg, #0f1622 0%, #111827 100%)', borderColor: '#1e2d4a' }}>
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)' }}>
            <span className="text-white text-3xl font-extrabold">{user?.name?.charAt(0).toUpperCase()}</span>
          </div>
          <div className="absolute -bottom-1 -right-1"><Logo size={28} /></div>
        </div>
        <div>
          <h2 className="text-text-primary font-bold text-xl">{user?.name}</h2>
          <p className="text-text-muted text-sm">{user?.email}</p>
          <div className="flex items-center gap-1.5 mt-2">
            {user?.role === 'ADMIN' && <Shield size={12} className="text-gold" />}
            <span className={`badge text-xs ${
              user?.role === 'ADMIN'
                ? 'bg-gold-muted text-gold-light border border-gold/25'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            }`}>
              {user?.role === 'ADMIN' ? 'Administrador' : 'Atendente'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'profile' && (
        <div className="card max-w-xl">
          <div className="flex items-center gap-2 mb-5">
            <User size={18} className="text-primary-light" />
            <h3 className="text-text-primary font-bold">Meu Perfil</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Nome</label>
              <input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">E-mail</label>
              <input type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} className="input-field" />
            </div>
            <button onClick={saveProfile} disabled={savingProfile} className="btn-primary flex items-center gap-2 text-sm">
              <Save size={15} />
              {savingProfile ? 'Salvando...' : 'Salvar Perfil'}
            </button>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="card max-w-xl">
          <div className="flex items-center gap-2 mb-5">
            <Lock size={18} className="text-primary-light" />
            <h3 className="text-text-primary font-bold">Alterar Senha</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Nova Senha</label>
              <input type="password" value={passForm.password} onChange={(e) => setPassForm({ ...passForm, password: e.target.value })} placeholder="Mínimo 6 caracteres" className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Confirmar Senha</label>
              <input type="password" value={passForm.confirm} onChange={(e) => setPassForm({ ...passForm, confirm: e.target.value })} placeholder="Repita a nova senha" className="input-field" />
            </div>
            <button onClick={savePassword} disabled={savingPass} className="btn-primary flex items-center gap-2 text-sm">
              <Lock size={15} />
              {savingPass ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </div>
        </div>
      )}

      {tab === 'quickreplies' && <QuickRepliesTab isAdmin={isAdmin} />}
      {tab === 'pipeline'     && isAdmin && <PipelineTab />}
      {tab === 'customfields' && isAdmin && <CustomFieldsTab />}
      {tab === 'ai'           && isAdmin && <AISettingsTab />}
    </div>
  )
}

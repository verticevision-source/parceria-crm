import { useState, useEffect } from 'react'
import { numbersApi } from '../services/api'
import toast from 'react-hot-toast'
import {
  Smartphone, Plus, Trash2, Star, CheckCircle, Zap, X, Info, Phone, ShieldCheck
} from 'lucide-react'

interface WNumber {
  id: string; label: string; phoneNumberId: string
  displayNumber?: string; verifiedName?: string; wabaId?: string
  isActive: boolean; isDefault: boolean; tokenMasked?: string | null
}

export default function AdminWhatsApp() {
  const [numbers, setNumbers] = useState<WNumber[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showOneClick, setShowOneClick] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ label: '', phoneNumberId: '', token: '', wabaId: '' })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await numbersApi.list()
      setNumbers(res.data.data)
    } catch { toast.error('Erro ao carregar números') }
    finally { setLoading(false) }
  }

  async function addNumber() {
    if (!form.label || !form.phoneNumberId || !form.token) {
      toast.error('Preencha apelido, Phone Number ID e token'); return
    }
    setSaving(true)
    try {
      const res = await numbersApi.add(form)
      toast.success(`Número ${res.data.data.displayNumber || ''} conectado!`)
      setShowAdd(false)
      setForm({ label: '', phoneNumberId: '', token: '', wabaId: '' })
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao adicionar número')
    } finally { setSaving(false) }
  }

  async function setDefault(id: string) {
    try { await numbersApi.setDefault(id); toast.success('Número padrão atualizado'); load() }
    catch { toast.error('Erro') }
  }
  async function remove(id: string) {
    if (!confirm('Remover este número?')) return
    try { await numbersApi.remove(id); toast.success('Número removido'); load() }
    catch { toast.error('Erro') }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Smartphone size={22} className="text-primary" /> Central de Números
          </h1>
          <p className="text-sm text-text-muted mt-0.5">Conecte e gerencie os números de WhatsApp da operação</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowOneClick(true)}
            className="btn-ghost border border-border flex items-center gap-2 text-sm">
            <Zap size={15} className="text-gold" /> Conectar com 1 clique
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Adicionar número
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
      ) : numbers.length === 0 ? (
        <div className="card p-12 text-center text-text-muted">
          <Smartphone size={40} className="mx-auto mb-3 opacity-30" />
          <p className="mb-1">Nenhum número conectado ainda</p>
          <p className="text-xs">Adicione o primeiro número para começar a atender</p>
        </div>
      ) : (
        <div className="space-y-3">
          {numbers.map((n) => (
            <div key={n.id} className="card p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center flex-shrink-0">
                  <Phone size={18} className="text-success" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-text-primary truncate">{n.label}</p>
                    {n.isDefault && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/15 text-gold font-bold flex items-center gap-0.5">
                        <Star size={9} /> PADRÃO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">
                    {n.displayNumber || n.phoneNumberId}{n.verifiedName ? ` · ${n.verifiedName}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!n.isDefault && (
                  <button onClick={() => setDefault(n.id)} className="text-xs px-2 py-1 rounded-lg text-text-muted hover:text-gold hover:bg-gold/10" title="Tornar padrão">
                    <Star size={14} />
                  </button>
                )}
                <button onClick={() => remove(n.id)} className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10" title="Remover">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal adicionar manual */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-panel max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-text-primary mb-1 flex items-center gap-2">
              <Plus size={18} className="text-primary" /> Adicionar número
            </h3>
            <p className="text-xs text-text-muted mb-4">
              Pegue o <b>Phone Number ID</b> e o <b>token</b> no painel da Meta (WhatsApp → Configuração da API).
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-text-muted">Apelido *</label>
                <input className="input w-full mt-1" placeholder="Ex: Vendas SP, Suporte..."
                  value={form.label} onChange={(e) => setForm(p => ({ ...p, label: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm text-text-muted">Phone Number ID *</label>
                <input className="input w-full mt-1 font-mono text-sm" placeholder="Ex: 101234567890123"
                  value={form.phoneNumberId} onChange={(e) => setForm(p => ({ ...p, phoneNumberId: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm text-text-muted">Token de acesso *</label>
                <input type="password" className="input w-full mt-1 font-mono text-sm" placeholder="EAA..."
                  value={form.token} onChange={(e) => setForm(p => ({ ...p, token: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm text-text-muted">WhatsApp Business Account ID (opcional)</label>
                <input className="input w-full mt-1 font-mono text-sm" placeholder="Para assinar o webhook automaticamente"
                  value={form.wabaId} onChange={(e) => setForm(p => ({ ...p, wabaId: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={addNumber} disabled={saving}>
                <CheckCircle size={16} /> {saving ? 'Validando...' : 'Conectar número'}
              </button>
              <button className="btn-ghost flex-1 border border-border" onClick={() => setShowAdd(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1-clique (explicativo) */}
      {showOneClick && (
        <div className="modal-overlay" onClick={() => setShowOneClick(false)}>
          <div className="modal-panel max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <Zap size={18} className="text-gold" /> Conectar com 1 clique
              </h3>
              <button onClick={() => setShowOneClick(false)} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
            </div>
            <div className="space-y-3 text-sm text-text-secondary">
              <div className="flex items-start gap-2 p-3 rounded-xl bg-bg-tertiary">
                <Info size={16} className="text-primary flex-shrink-0 mt-0.5" />
                <p>A conexão automática (Embedded Signup da Meta) deixa você plugar números de clientes em segundos, sem copiar token. Já está preparada no sistema, mas a Meta só a libera após um passo obrigatório:</p>
              </div>
              <div className="flex items-start gap-2">
                <ShieldCheck size={16} className="text-success flex-shrink-0 mt-0.5" />
                <p><b>Verificação de Negócio</b> no Meta Business: envie CNPJ + um comprovante (contrato social ou conta no nome da empresa). A Meta aprova em 1–5 dias.</p>
              </div>
              <p className="text-text-muted text-xs">
                Assim que sua empresa for verificada, ativamos o botão de 1 clique aqui. Por enquanto, use "Adicionar número" — funciona perfeitamente (só pede o ID e o token uma vez por número).
              </p>
            </div>
            <button className="btn-primary w-full mt-4" onClick={() => { setShowOneClick(false); setShowAdd(true) }}>
              Adicionar número manualmente
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

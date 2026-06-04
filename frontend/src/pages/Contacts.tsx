import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Phone, MapPin, Edit2, Trash2, User, MessageSquare, Send, Upload, FileSpreadsheet, Download, X, Loader2, CheckCircle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { contactsApi, whatsappApi, templatesApi, usersApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { Contact, User as UserType } from '../types'
import Avatar from '../components/UI/Avatar'
import { fileToAvatarDataUrl } from '../utils/image'

// Saudação conforme o horário
function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

// Substitui {{1}}, {{2}}... pelos valores
function fillTemplate(body: string, vars: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n) - 1] ?? `{{${n}}}`)
}
import Modal from '../components/UI/Modal'
import { PageLoader } from '../components/UI/LoadingSpinner'
import toast from 'react-hot-toast'

const emptyForm = { name: '', phone: '', city: '', documentNumber: '', notes: '', avatarUrl: '' }

export default function Contacts() {
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  // Importação de planilha (admin)
  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<Array<{ name: string; phone: string; city?: string; documentNumber?: string; notes?: string }>>([])
  const [importing, setImporting] = useState(false)
  const [importFileName, setImportFileName] = useState('')
  const [importUsers, setImportUsers] = useState<UserType[]>([])
  const [importTarget, setImportTarget] = useState('')

  // Iniciar conversa
  const [chatContact, setChatContact] = useState<Contact | null>(null)
  const [chatMsg, setChatMsg] = useState('')
  const [sendingChat, setSendingChat] = useState(false)
  const [chatMode, setChatMode] = useState<'free' | 'template'>('free')
  const [templates, setTemplates] = useState<{ name: string; status: string; language: string; body: string }[]>([])
  const [selectedTpl, setSelectedTpl] = useState('')

  const openChat = (contact: Contact) => {
    setChatContact(contact); setChatMsg(''); setChatMode('free'); setSelectedTpl('')
    // Carrega modelos aprovados para a opção de prospecção
    templatesApi.list()
      .then((r) => setTemplates((r.data.data || []).filter((t: any) => t.status === 'APPROVED')))
      .catch(() => setTemplates([]))
  }

  const startChat = async () => {
    if (!chatContact) return
    setSendingChat(true)
    try {
      if (chatMode === 'template') {
        const tpl = templates.find((t) => t.name === selectedTpl)
        if (!tpl) { toast.error('Selecione um modelo'); setSendingChat(false); return }
        // Convenção das variáveis: {{1}}=saudação, {{2}}=cliente, {{3}}=atendente
        const varCount = (tpl.body.match(/\{\{\d+\}\}/g) || []).length
        const allVars = [saudacao(), chatContact.name, user?.name || 'Atendimento']
        const variables = allVars.slice(0, varCount)
        const preview = fillTemplate(tpl.body, variables)
        await templatesApi.send(chatContact.phone, tpl.name, tpl.language, variables, preview)
      } else {
        if (!chatMsg.trim()) { toast.error('Digite uma mensagem'); setSendingChat(false); return }
        await whatsappApi.sendMessage(chatContact.phone, chatMsg.trim())
      }
      toast.success('Mensagem enviada! Abrindo conversa...')
      setChatContact(null)
      navigate('/attendance')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Erro ao enviar. Fora da janela de 24h use um modelo aprovado.'
      toast.error(msg)
    } finally {
      setSendingChat(false)
    }
  }

  const load = useCallback(async () => {
    try {
      const res = await contactsApi.findAll(search || undefined)
      setContacts(res.data.data)
    } catch {
      toast.error('Erro ao carregar contatos')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (c: Contact) => {
    setEditing(c)
    setForm({
      name: c.name,
      phone: c.phone,
      city: c.city || '',
      documentNumber: c.documentNumber || '',
      notes: c.notes || '',
      avatarUrl: c.avatarUrl || '',
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.name || !form.phone) {
      toast.error('Nome e telefone são obrigatórios')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await contactsApi.update(editing.id, form)
        toast.success('Contato atualizado!')
      } else {
        await contactsApi.create(form)
        toast.success('Contato criado!')
      }
      setShowForm(false)
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao salvar'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este contato?')) return
    try {
      await contactsApi.delete(id)
      toast.success('Contato removido')
      load()
    } catch {
      toast.error('Erro ao remover contato')
    }
  }

  // ── Importação de planilha ────────────────────────────────────────────────
  const openImport = () => {
    setImportRows([]); setImportFileName(''); setImportTarget('')
    setShowImport(true)
    usersApi.findAll().then((r) => setImportUsers(r.data.data.filter((u: UserType) => u.isActive))).catch(() => {})
  }

  // Acha o valor de uma coluna por nomes alternativos (case-insensitive)
  const pick = (row: Record<string, any>, keys: string[]): string => {
    const lower: Record<string, any> = {}
    for (const k of Object.keys(row)) lower[k.trim().toLowerCase()] = row[k]
    for (const key of keys) {
      const v = lower[key]
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
    }
    return ''
  }

  const parseFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' })
      const rows = json.map((r) => ({
        name: pick(r, ['nome', 'name', 'contato', 'cliente']),
        phone: pick(r, ['telefone', 'phone', 'celular', 'whatsapp', 'fone', 'numero', 'número', 'tel']),
        city: pick(r, ['cidade', 'city']),
        documentNumber: pick(r, ['cpf', 'documento', 'document', 'cnpj']),
        notes: pick(r, ['observacao', 'observação', 'obs', 'notes', 'anotacao', 'anotação']),
      })).filter((r) => r.phone)  // precisa ter telefone
      if (rows.length === 0) {
        toast.error('Nenhum telefone encontrado. A planilha precisa de uma coluna "telefone" (ou phone/celular/whatsapp).')
        return
      }
      setImportRows(rows)
      setImportFileName(file.name)
      toast.success(`${rows.length} contato(s) lido(s) da planilha`)
    } catch {
      toast.error('Não consegui ler o arquivo. Use .xlsx, .xls ou .csv')
    }
  }

  const doImport = async () => {
    if (importRows.length === 0) return
    setImporting(true)
    try {
      const res = await contactsApi.import(importRows, importTarget || undefined)
      const { created, skipped, invalid } = res.data.data
      toast.success(`Importado! ${created} criados, ${skipped} já existiam, ${invalid} inválidos`)
      setShowImport(false)
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao importar'
      toast.error(msg)
    } finally { setImporting(false) }
  }

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['nome', 'telefone', 'cidade', 'cpf', 'observacao'],
      ['João da Silva', '5517999998888', 'Ribeirão Preto', '', 'Lead quente'],
      ['Maria Souza', '17988887777', 'São Paulo', '', ''],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Contatos')
    XLSX.writeFile(wb, 'modelo_contatos.xlsx')
  }

  if (loading) return <PageLoader />

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Contatos</h1>
          <p className="text-text-muted text-sm mt-1">{contacts.length} contato(s)</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={openImport} className="btn-ghost border border-border flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-success" />
              Importar planilha
            </button>
          )}
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            Novo Contato
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="input-field pl-11 w-full max-w-md"
        />
      </div>

      {/* Grid */}
      {contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-text-muted">
          <User size={48} className="mb-3 opacity-20" />
          <p className="font-medium">Nenhum contato encontrado</p>
          <button onClick={openCreate} className="mt-4 btn-primary text-sm">
            Criar primeiro contato
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map((contact) => (
            <div key={contact.id} className="card hover:border-border-light transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Avatar src={contact.avatarUrl} name={contact.name} size={44} />
                  <div>
                    <h3 className="text-text-primary font-semibold text-sm">{contact.name}</h3>
                    <p className="text-text-muted text-xs">{contact.user?.name}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openChat(contact)}
                    className="p-1.5 text-text-muted hover:text-success hover:bg-success/10 rounded-lg transition-colors"
                    title="Iniciar conversa"
                  >
                    <MessageSquare size={14} />
                  </button>
                  <button
                    onClick={() => openEdit(contact)}
                    className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => remove(contact.id)}
                    className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-text-secondary text-sm">
                  <Phone size={13} className="text-text-muted flex-shrink-0" />
                  <span>{contact.phone}</span>
                </div>
                {contact.city && (
                  <div className="flex items-center gap-2 text-text-secondary text-sm">
                    <MapPin size={13} className="text-text-muted flex-shrink-0" />
                    <span>{contact.city}</span>
                  </div>
                )}
              </div>

              {contact._count && (
                <div className="flex gap-3 mt-3 pt-3 border-t border-border">
                  <span className="text-text-muted text-xs">
                    {contact._count.conversations} conversa(s)
                  </span>
                  <span className="text-text-muted text-xs">
                    {contact._count.leads} lead(s)
                  </span>
                </div>
              )}

              <button
                onClick={() => { setChatContact(contact); setChatMsg('') }}
                className="w-full mt-3 btn-primary text-sm py-2 flex items-center justify-center gap-2"
              >
                <MessageSquare size={14} /> Iniciar conversa
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal iniciar conversa */}
      <Modal
        isOpen={!!chatContact}
        onClose={() => setChatContact(null)}
        title={`Conversar com ${chatContact?.name || ''}`}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Phone size={14} /> {chatContact?.phone}
          </div>

          {/* Toggle modo */}
          <div className="flex gap-1 bg-bg-secondary p-1 rounded-lg">
            <button onClick={() => setChatMode('free')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md ${chatMode === 'free' ? 'bg-card shadow text-text-primary' : 'text-text-muted'}`}>
              💬 Mensagem livre
            </button>
            <button onClick={() => setChatMode('template')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md ${chatMode === 'template' ? 'bg-card shadow text-text-primary' : 'text-text-muted'}`}>
              📋 Modelo (prospecção)
            </button>
          </div>

          {chatMode === 'free' ? (
            <div>
              <textarea
                value={chatMsg}
                onChange={(e) => setChatMsg(e.target.value)}
                placeholder="Digite a primeira mensagem..."
                rows={4}
                className="input-field resize-none"
                autoFocus
              />
              <p className="text-xs text-text-muted mt-1">
                💡 Só funciona se o contato te respondeu nas últimas 24h. Senão, use a aba "Modelo".
              </p>
            </div>
          ) : (
            <div>
              {templates.length === 0 ? (
                <div className="text-sm text-text-muted p-3 rounded-lg bg-bg-tertiary">
                  Nenhum modelo aprovado ainda. Crie um em <b>Modelos</b> (menu admin) e aguarde a aprovação da Meta.
                </div>
              ) : (
                <>
                  <select className="input-field w-full" value={selectedTpl} onChange={(e) => setSelectedTpl(e.target.value)}>
                    <option value="">Selecione um modelo aprovado...</option>
                    {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                  {selectedTpl && (
                    <div className="mt-2 p-3 rounded-lg bg-bg-tertiary text-sm text-text-secondary whitespace-pre-wrap">
                      {fillTemplate(
                        templates.find((t) => t.name === selectedTpl)?.body || '',
                        [saudacao(), chatContact?.name || '', user?.name || 'Atendimento']
                      )}
                    </div>
                  )}
                  <p className="text-xs text-text-muted mt-1">✅ Modelos funcionam mesmo sem o cliente ter falado antes.</p>
                </>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setChatContact(null)} className="flex-1 btn-ghost border border-border">
              Cancelar
            </button>
            <button onClick={startChat} disabled={sendingChat} className="flex-1 btn-primary flex items-center justify-center gap-2">
              <Send size={15} /> {sendingChat ? 'Enviando...' : 'Enviar e abrir'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Editar Contato' : 'Novo Contato'}
      >
        <div className="space-y-4">
          {/* Foto de perfil */}
          <div className="flex items-center gap-4">
            <Avatar src={form.avatarUrl} name={form.name} size={64} />
            <div>
              <label className="btn-ghost border border-border text-sm cursor-pointer inline-flex items-center gap-2">
                <User size={14} /> {form.avatarUrl ? 'Trocar foto' : 'Adicionar foto'}
                <input type="file" accept="image/*" className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    try { setForm((f) => ({ ...f, avatarUrl: '' })); const url = await fileToAvatarDataUrl(file); setForm((f) => ({ ...f, avatarUrl: url })) }
                    catch { toast.error('Erro ao carregar imagem') }
                  }} />
              </label>
              {form.avatarUrl && (
                <button onClick={() => setForm({ ...form, avatarUrl: '' })} className="text-xs text-danger ml-2 hover:underline">Remover</button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-text-secondary mb-2">Nome *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nome completo"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Telefone *</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="5511999999999"
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Cidade</label>
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="São Paulo"
                className="input-field"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-text-secondary mb-2">CPF/Documento</label>
              <input
                value={form.documentNumber}
                onChange={(e) => setForm({ ...form, documentNumber: e.target.value })}
                placeholder="Opcional"
                className="input-field"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-text-secondary mb-2">Observações</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Informações adicionais..."
                rows={3}
                className="input-field resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowForm(false)} className="flex-1 btn-ghost border border-border">
              Cancelar
            </button>
            <button onClick={save} disabled={saving} className="flex-1 btn-primary">
              {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal importar planilha */}
      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
          <div className="modal-panel max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-text-primary flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-success" /> Importar contatos
              </h3>
              <button onClick={() => setShowImport(false)} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
            </div>
            <p className="text-xs text-text-muted mb-4">
              Envie uma planilha <b>.xlsx</b>, <b>.xls</b> ou <b>.csv</b>. Precisa ter as colunas <b>nome</b> e <b>telefone</b> (cidade, cpf e observação são opcionais).
            </p>

            <div className="flex items-center gap-2 mb-4">
              <label className="btn-primary flex items-center gap-2 cursor-pointer">
                <Upload size={16} /> Escolher planilha
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f) }} />
              </label>
              <button onClick={downloadTemplate} className="btn-ghost border border-border flex items-center gap-2 text-sm">
                <Download size={15} /> Baixar modelo
              </button>
              {importFileName && <span className="text-xs text-text-muted truncate">{importFileName}</span>}
            </div>

            {importRows.length > 0 && (
              <>
                <div className="mb-3">
                  <label className="text-sm text-text-muted">Atribuir os contatos a:</label>
                  <select className="input-field w-full mt-1" value={importTarget} onChange={(e) => setImportTarget(e.target.value)}>
                    <option value="">Eu (admin)</option>
                    {importUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role === 'ADMIN' ? 'Admin' : 'Atendente'})</option>)}
                  </select>
                </div>

                <div className="rounded-xl border border-border overflow-hidden mb-4">
                  <div className="px-3 py-2 bg-bg-tertiary text-xs font-semibold text-text-secondary flex items-center gap-2">
                    <CheckCircle size={14} className="text-success" /> {importRows.length} contato(s) prontos — prévia dos 5 primeiros:
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-border">
                    {importRows.slice(0, 5).map((r, i) => (
                      <div key={i} className="px-3 py-2 text-sm flex items-center justify-between gap-2">
                        <span className="text-text-primary truncate">{r.name || '(sem nome)'}</span>
                        <span className="text-text-muted font-mono text-xs flex-shrink-0">{r.phone}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2">
              <button className="btn-ghost flex-1 border border-border" onClick={() => setShowImport(false)}>Cancelar</button>
              <button className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={doImport} disabled={importing || importRows.length === 0}>
                {importing ? <><Loader2 size={16} className="animate-spin" /> Importando...</> : <><Upload size={16} /> Importar {importRows.length > 0 ? importRows.length : ''}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Phone, MapPin, Edit2, Trash2, User, MessageSquare, Send } from 'lucide-react'
import { contactsApi, whatsappApi, templatesApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { Contact } from '../types'

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

const emptyForm = { name: '', phone: '', city: '', documentNumber: '', notes: '' }

export default function Contacts() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

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

  if (loading) return <PageLoader />

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Contatos</h1>
          <p className="text-text-muted text-sm mt-1">{contacts.length} contato(s)</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Novo Contato
        </button>
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
                  <div className="w-11 h-11 bg-primary/20 rounded-full flex items-center justify-center">
                    <span className="text-primary font-bold">
                      {contact.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
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
    </div>
  )
}

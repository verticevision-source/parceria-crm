import { useState, useEffect } from 'react'
import { Plus, Edit2, Check, X, Wifi, WifiOff, Shield, User, Trash2, Sparkles } from 'lucide-react'
import { usersApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { User as UserType } from '../types'
import Modal from '../components/UI/Modal'
import { StatusBadge } from '../components/UI/Badge'
import { PageLoader } from '../components/UI/LoadingSpinner'
import toast from 'react-hot-toast'

const emptyForm = { name: '', email: '', password: '', role: 'USER' as 'ADMIN' | 'USER' }

export default function Users() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserType[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<UserType | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const res = await usersApi.findAll()
      setUsers(res.data.data)
    } catch {
      toast.error('Erro ao carregar usuários')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (u: UserType) => {
    setEditing(u)
    setForm({ name: u.name, email: u.email, password: '', role: u.role })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.name || !form.email) {
      toast.error('Nome e e-mail são obrigatórios')
      return
    }
    if (!editing && !form.password) {
      toast.error('Senha obrigatória para novo usuário')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        const data: Record<string, string> = { name: form.name, email: form.email }
        if (form.password) data.password = form.password
        await usersApi.update(editing.id, data)
        toast.success('Usuário atualizado!')
      } else {
        await usersApi.create(form)
        toast.success('Usuário criado!')
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

  const toggleActive = async (user: UserType) => {
    try {
      if (user.isActive) {
        await usersApi.deactivate(user.id)
        toast.success('Usuário desativado')
      } else {
        await usersApi.activate(user.id)
        toast.success('Usuário ativado')
      }
      load()
    } catch {
      toast.error('Erro ao alterar status')
    }
  }

  const toggleAi = async (u: UserType) => {
    try {
      await usersApi.setAi(u.id, !u.aiEnabled)
      toast.success(!u.aiEnabled ? 'IA liberada para ' + u.name : 'IA removida de ' + u.name)
      load()
    } catch {
      toast.error('Erro ao alterar acesso de IA')
    }
  }

  const remove = async (user: UserType) => {
    if (!confirm(`Excluir o usuário "${user.name}" permanentemente? Esta ação não pode ser desfeita.`)) return
    try {
      await usersApi.remove(user.id)
      toast.success('Usuário excluído')
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao excluir'
      toast.error(msg)
    }
  }

  if (loading) return <PageLoader />

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Usuários</h1>
          <p className="text-text-muted text-sm mt-1">{users.length} usuário(s)</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Novo Usuário
        </button>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-text-muted text-xs font-medium uppercase tracking-wider p-4">
                Usuário
              </th>
              <th className="text-left text-text-muted text-xs font-medium uppercase tracking-wider p-4">
                Tipo
              </th>
              <th className="text-left text-text-muted text-xs font-medium uppercase tracking-wider p-4">
                WhatsApp
              </th>
              <th className="text-left text-text-muted text-xs font-medium uppercase tracking-wider p-4">
                Conversas
              </th>
              <th className="text-left text-text-muted text-xs font-medium uppercase tracking-wider p-4">
                Status
              </th>
              <th className="text-right text-text-muted text-xs font-medium uppercase tracking-wider p-4">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const session = u.whatsappSessions?.[0]
              return (
                <tr key={u.id} className="border-b border-border/50 hover:bg-bg-hover transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary/20 rounded-full flex items-center justify-center">
                        <span className="text-primary text-sm font-bold">
                          {u.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-text-primary text-sm font-medium">{u.name}</p>
                        <p className="text-text-muted text-xs">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5">
                      {u.role === 'ADMIN' ? (
                        <Shield size={14} className="text-primary" />
                      ) : (
                        <User size={14} className="text-text-muted" />
                      )}
                      <StatusBadge status={u.role} />
                    </div>
                  </td>
                  <td className="p-4">
                    {session ? (
                      <div className="flex items-center gap-1.5">
                        {session.status === 'CONNECTED' ? (
                          <Wifi size={13} className="text-success" />
                        ) : (
                          <WifiOff size={13} className="text-text-muted" />
                        )}
                        <span className="text-text-secondary text-xs">
                          {session.status === 'CONNECTED'
                            ? session.phoneNumber
                            : session.status}
                        </span>
                      </div>
                    ) : (
                      <span className="text-text-muted text-xs">Sem sessão</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className="text-text-secondary text-sm">
                      {u._count?.conversations || 0}
                    </span>
                  </td>
                  <td className="p-4">
                    <span
                      className={`badge text-xs ${
                        u.isActive
                          ? 'bg-success/20 text-success'
                          : 'bg-danger/20 text-danger'
                      }`}
                    >
                      {u.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => toggleActive(u)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          u.isActive
                            ? 'text-text-muted hover:text-warning hover:bg-warning/10'
                            : 'text-text-muted hover:text-success hover:bg-success/10'
                        }`}
                        title={u.isActive ? 'Desativar' : 'Ativar'}
                      >
                        {u.isActive ? <X size={14} /> : <Check size={14} />}
                      </button>
                      {u.role !== 'ADMIN' && (
                        <button
                          onClick={() => toggleAi(u)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            u.aiEnabled
                              ? 'text-primary bg-primary/10 hover:bg-primary/20'
                              : 'text-text-muted hover:text-primary hover:bg-primary/10'
                          }`}
                          title={u.aiEnabled ? 'IA liberada (clique para remover)' : 'Liberar assistente de IA'}
                        >
                          <Sparkles size={14} />
                        </button>
                      )}
                      {currentUser?.id !== u.id && (
                        <button
                          onClick={() => remove(u)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Excluir permanentemente"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Editar Usuário' : 'Novo Usuário'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Nome *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome completo"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">E-mail *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@exemplo.com"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {editing ? 'Nova Senha (deixe vazio para manter)' : 'Senha *'}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Mínimo 6 caracteres"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Tipo</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as 'ADMIN' | 'USER' })}
              className="input-field"
              disabled={!!editing}
            >
              <option value="USER">Atendente</option>
              <option value="ADMIN">Administrador</option>
            </select>
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

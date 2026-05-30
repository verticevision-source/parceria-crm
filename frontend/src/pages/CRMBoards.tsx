import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../services/api'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import {
  Briefcase, Plus, Settings, Users, Layers, Trash2,
  ChevronRight, Star, UserPlus, X, Edit2
} from 'lucide-react'

interface Stage { id: string; name: string; order: number; color: string }
interface Member { id: string; userId: string; role: string; user: { id: string; name: string; email: string } }
interface Board {
  id: string; name: string; description?: string; color: string; icon: string
  isActive: boolean; stages: Stage[]
  _count: { leads: number; stages: number; members: number }
}
interface User { id: string; name: string; email: string; role: string }

const ICONS = ['briefcase','users','star','layers','target','zap','globe','award','bar-chart','heart']
const PRESET_STAGES: Record<string, string[]> = {
  vendas: ['Novo Lead','Contato Feito','Proposta Enviada','Negociação','Fechado'],
  conta: ['Onboarding','Ativo','Em Risco','Churn','Renovação'],
  suporte: ['Novo','Em Atendimento','Aguardando Cliente','Resolvido','Fechado'],
  custom: [],
}

export default function CRMBoards() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const navigate = useNavigate()

  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingBoard, setEditingBoard] = useState<Board | null>(null)
  const [managingMembers, setManagingMembers] = useState<Board | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [users, setUsers] = useState<User[]>([])

  const [form, setForm] = useState({
    name: '', description: '', color: '#6366f1', icon: 'briefcase',
    preset: 'vendas', customStages: ''
  })

  useEffect(() => { loadBoards() }, [])

  async function loadBoards() {
    try {
      const res = await api.get('/crm-boards')
      setBoards(res.data.data)
    } catch { toast.error('Erro ao carregar') }
    finally { setLoading(false) }
  }

  async function handleCreate() {
    if (!form.name) { toast.error('Nome obrigatório'); return }
    const stages = form.preset === 'custom'
      ? form.customStages.split('\n').map(s => s.trim()).filter(Boolean)
      : PRESET_STAGES[form.preset]
    try {
      await api.post('/crm-boards', {
        name: form.name, description: form.description,
        color: form.color, icon: form.icon, defaultStages: stages,
      })
      toast.success('Board criado!')
      setShowCreate(false)
      setForm({ name: '', description: '', color: '#6366f1', icon: 'briefcase', preset: 'vendas', customStages: '' })
      loadBoards()
    } catch { toast.error('Erro ao criar') }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deletar board? Todos os leads serão desvinculados.')) return
    try {
      await api.delete(`/crm-boards/${id}`)
      toast.success('Board removido')
      loadBoards()
    } catch { toast.error('Erro ao deletar') }
  }

  function openEdit(board: Board) {
    setEditingBoard(board)
    setForm({
      name: board.name, description: board.description || '',
      color: board.color, icon: board.icon || 'briefcase',
      preset: 'custom', customStages: '',
    })
  }

  async function handleUpdate() {
    if (!editingBoard || !form.name.trim()) { toast.error('Nome obrigatório'); return }
    try {
      await api.put(`/crm-boards/${editingBoard.id}`, {
        name: form.name, description: form.description, color: form.color,
      })
      toast.success('Board atualizado!')
      setEditingBoard(null)
      loadBoards()
    } catch { toast.error('Erro ao atualizar') }
  }

  async function openMembers(board: Board) {
    setManagingMembers(board)
    const [membersRes, usersRes] = await Promise.all([
      api.get(`/crm-boards/${board.id}/members`),
      api.get('/users'),
    ])
    setMembers(membersRes.data.data)
    setUsers(usersRes.data.data.filter((u: User) => u.role !== 'ADMIN'))
  }

  async function handleAddMember(userId: string, role = 'member') {
    if (!managingMembers) return
    try {
      await api.post(`/crm-boards/${managingMembers.id}/members`, { userId, role })
      const res = await api.get(`/crm-boards/${managingMembers.id}/members`)
      setMembers(res.data.data)
      toast.success('Membro adicionado!')
    } catch { toast.error('Erro ao adicionar') }
  }

  async function handleRemoveMember(userId: string) {
    if (!managingMembers) return
    try {
      await api.delete(`/crm-boards/${managingMembers.id}/members/${userId}`)
      setMembers(m => m.filter(x => x.userId !== userId))
      toast.success('Membro removido')
    } catch { toast.error('Erro ao remover') }
  }

  const memberIds = new Set(members.map(m => m.userId))

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Layers size={22} className="text-primary" /> CRM Boards
          </h1>
          <p className="text-sm text-text-muted mt-0.5">Gerencie múltiplos funis de CRM para diferentes equipes</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Novo Board
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      ) : boards.length === 0 ? (
        <div className="card p-12 text-center text-text-muted">
          <Layers size={40} className="mx-auto mb-3 opacity-30" />
          <p className="mb-4">Nenhum board criado ainda</p>
          {isAdmin && (
            <button onClick={() => setShowCreate(true)} className="btn-primary mx-auto flex items-center gap-2">
              <Plus size={16} /> Criar primeiro board
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map(board => (
            <div key={board.id} className="card overflow-hidden hover:shadow-md transition-shadow">
              {/* Header colorido */}
              <div className="h-2" style={{ backgroundColor: board.color }} />
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-text-primary text-base">{board.name}</h3>
                    {board.description && (
                      <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{board.description}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 ml-2">
                      <button onClick={() => openEdit(board)} className="p-1.5 hover:bg-bg-hover rounded-lg" title="Editar board">
                        <Edit2 size={14} className="text-text-muted" />
                      </button>
                      <button onClick={() => openMembers(board)} className="p-1.5 hover:bg-bg-hover rounded-lg" title="Gerenciar membros">
                        <Users size={14} className="text-text-muted" />
                      </button>
                      <button onClick={() => handleDelete(board.id)} className="p-1.5 hover:bg-danger/10 rounded-lg" title="Deletar">
                        <Trash2 size={14} className="text-red-400" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="flex gap-4 mt-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-primary">{board._count.leads}</p>
                    <p className="text-xs text-text-muted">Leads</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold">{board._count.stages}</p>
                    <p className="text-xs text-text-muted">Etapas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold">{board._count.members}</p>
                    <p className="text-xs text-text-muted">Membros</p>
                  </div>
                </div>

                {/* Stages preview */}
                <div className="flex flex-wrap gap-1 mt-3">
                  {board.stages.slice(0, 4).map(s => (
                    <span key={s.id} className="text-xs px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: s.color }}>
                      {s.name}
                    </span>
                  ))}
                  {board.stages.length > 4 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-bg-secondary text-text-muted">
                      +{board.stages.length - 4}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => navigate(`/crm?board=${board.id}`)}
                  className="w-full mt-4 btn-ghost text-sm py-2 rounded-lg flex items-center justify-center gap-2"
                >
                  Abrir Board <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal Criar Board ────────────────────────────────────────────── */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-panel max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-text-primary mb-5 text-lg flex items-center gap-2">
              <Layers size={18} className="text-primary" /> Novo Board de CRM
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text-muted">Nome *</label>
                <input className="input w-full mt-1" placeholder="Ex: CRM Vendas Sorocaba"
                  value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>

              <div>
                <label className="text-sm font-medium text-text-muted">Descrição</label>
                <input className="input w-full mt-1" placeholder="Opcional..."
                  value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>

              <div>
                <label className="text-sm font-medium text-text-muted">Cor</label>
                <div className="flex items-center gap-3 mt-1">
                  <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                    className="w-10 h-10 rounded cursor-pointer border border-border" />
                  <div className="flex gap-2">
                    {['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'].map(c => (
                      <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                        className="w-6 h-6 rounded-full border-2 transition-all"
                        style={{ backgroundColor: c, borderColor: form.color === c ? '#fff' : 'transparent' }} />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-text-muted">Modelo de etapas</label>
                <select className="input w-full mt-1" value={form.preset}
                  onChange={e => setForm(p => ({ ...p, preset: e.target.value }))}>
                  <option value="vendas">🎯 Vendas (Novo Lead → Fechado)</option>
                  <option value="conta">👤 Gerente de Conta (Onboarding → Renovação)</option>
                  <option value="suporte">🛠️ Suporte (Novo → Fechado)</option>
                  <option value="custom">✏️ Personalizado</option>
                </select>
                {form.preset !== 'custom' && (
                  <p className="text-xs text-text-muted mt-1">
                    Etapas: {PRESET_STAGES[form.preset].join(' → ')}
                  </p>
                )}
                {form.preset === 'custom' && (
                  <textarea className="input w-full mt-2 h-24 resize-none text-sm"
                    placeholder="Uma etapa por linha:&#10;Entrada&#10;Em Análise&#10;Aprovado&#10;Concluído"
                    value={form.customStages}
                    onChange={e => setForm(p => ({ ...p, customStages: e.target.value }))} />
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button className="btn-primary flex-1" onClick={handleCreate}>Criar Board</button>
              <button className="btn-ghost flex-1 border border-border" onClick={() => setShowCreate(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Editar Board ───────────────────────────────────────────── */}
      {editingBoard && (
        <div className="modal-overlay" onClick={() => setEditingBoard(null)}>
          <div className="modal-panel max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-text-primary mb-5 text-lg flex items-center gap-2">
              <Edit2 size={18} className="text-primary" /> Editar Board
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text-muted">Nome *</label>
                <input className="input w-full mt-1" value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-text-muted">Descrição</label>
                <input className="input w-full mt-1" placeholder="Opcional..." value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-text-muted">Cor</label>
                <div className="flex items-center gap-3 mt-1">
                  <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                    className="w-10 h-10 rounded cursor-pointer border border-border" />
                  <div className="flex gap-2">
                    {['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'].map(c => (
                      <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                        className="w-6 h-6 rounded-full border-2 transition-all"
                        style={{ backgroundColor: c, borderColor: form.color === c ? '#fff' : 'transparent' }} />
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-text-muted">
                💡 Para gerenciar as etapas, abra o board e use o botão "+ Coluna".
              </p>
            </div>
            <div className="flex gap-2 mt-5">
              <button className="btn-primary flex-1" onClick={handleUpdate}>Salvar Alterações</button>
              <button className="btn-ghost flex-1 border border-border" onClick={() => setEditingBoard(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Gerenciar Membros ────────────────────────────────────── */}
      {managingMembers && (
        <div className="modal-overlay" onClick={() => setManagingMembers(null)}>
          <div className="modal-panel max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-text-primary">Membros — {managingMembers.name}</h3>
              <button onClick={() => setManagingMembers(null)} className="p-1 hover:bg-bg-hover rounded"><X size={16} /></button>
            </div>

            {/* Membros atuais */}
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {members.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-3">Nenhum membro</p>
              ) : members.map(m => (
                <div key={m.id} className="flex items-center justify-between p-2 bg-bg-secondary rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{m.user.name}</p>
                    <p className="text-xs text-text-muted">{m.role === 'manager' ? '⭐ Gerente' : '👤 Membro'}</p>
                  </div>
                  <button onClick={() => handleRemoveMember(m.userId)} className="text-red-400 hover:text-red-600 p-1">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Adicionar membro */}
            <p className="text-xs font-medium text-text-muted mb-2">Adicionar:</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {users.filter(u => !memberIds.has(u.id)).map(u => (
                <div key={u.id} className="flex items-center justify-between p-2 hover:bg-bg-secondary rounded-lg">
                  <span className="text-sm text-text-primary">{u.name}</span>
                  <div className="flex gap-1">
                    <button onClick={() => handleAddMember(u.id, 'member')}
                      className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded hover:bg-primary/20">
                      + Membro
                    </button>
                    <button onClick={() => handleAddMember(u.id, 'manager')}
                      className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200">
                      ⭐ Gerente
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

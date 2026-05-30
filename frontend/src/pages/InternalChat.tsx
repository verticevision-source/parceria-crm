import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../services/api'
import { getSocket } from '../services/socket'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  Users, Plus, Send, Hash, X, Trash2, Edit2, Eye, MessageSquare, ChevronRight, Search
} from 'lucide-react'
import { format, isToday } from 'date-fns'

interface Group {
  id: string; name: string; description?: string; color: string
  memberCount: number; members: { id: string; name: string }[]
  lastMessage: string | null; lastMessageAt: string | null; unread: number; isMember: boolean
}
interface IMessage {
  id: string; groupId: string; userId: string; body: string; createdAt: string
  user: { id: string; name: string }
}
interface UserLite { id: string; name: string; email: string; role: string }

export default function InternalChat() {
  const { user, isAdmin } = useAuth()
  const [tab, setTab] = useState<'groups' | 'supervision'>('groups')

  // Grupos
  const [groups, setGroups] = useState<Group[]>([])
  const [activeGroup, setActiveGroup] = useState<Group | null>(null)
  const [messages, setMessages] = useState<IMessage[]>([])
  const [input, setInput] = useState('')
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  // Modal grupo
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [users, setUsers] = useState<UserLite[]>([])
  const [groupForm, setGroupForm] = useState<{ name: string; description: string; color: string; memberIds: string[] }>({
    name: '', description: '', color: '#6366f1', memberIds: [],
  })

  // Supervisão
  const [supAgent, setSupAgent] = useState<UserLite | null>(null)
  const [supConvs, setSupConvs] = useState<any[]>([])
  const [supMessages, setSupMessages] = useState<any[]>([])
  const [supConvId, setSupConvId] = useState<string | null>(null)

  const loadGroups = useCallback(async () => {
    try {
      const res = await api.get('/internal-chat/groups')
      setGroups(res.data.data)
    } catch { /* silencioso */ }
  }, [])

  useEffect(() => { loadGroups() }, [loadGroups])

  // Socket: novas mensagens internas
  useEffect(() => {
    const socket = getSocket()
    const onMsg = ({ groupId, message }: { groupId: string; message: IMessage }) => {
      if (activeGroup && groupId === activeGroup.id) {
        setMessages((prev) => [...prev, message])
      } else {
        setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, unread: g.unread + 1, lastMessage: message.body } : g))
      }
    }
    const onUpdate = () => loadGroups()
    socket.on('internal-message', onMsg)
    socket.on('internal-groups-updated', onUpdate)
    return () => { socket.off('internal-message', onMsg); socket.off('internal-groups-updated', onUpdate) }
  }, [activeGroup, loadGroups])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const openGroup = async (g: Group) => {
    setActiveGroup(g)
    setMessages([])
    setLoadingMsgs(true)
    setGroups((prev) => prev.map((x) => x.id === g.id ? { ...x, unread: 0 } : x))
    try {
      const res = await api.get(`/internal-chat/groups/${g.id}/messages`)
      setMessages(res.data.data)
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao abrir grupo')
    } finally { setLoadingMsgs(false) }
  }

  const send = async () => {
    if (!input.trim() || !activeGroup) return
    const body = input.trim()
    setInput('')
    try {
      const res = await api.post(`/internal-chat/groups/${activeGroup.id}/messages`, { body })
      setMessages((prev) => [...prev, res.data.data])
    } catch { toast.error('Erro ao enviar'); setInput(body) }
  }

  // ── Modal de grupo (admin) ──
  const openCreateGroup = async () => {
    setEditingGroup(null)
    setGroupForm({ name: '', description: '', color: '#6366f1', memberIds: [] })
    const res = await api.get('/users')
    setUsers(res.data.data.filter((u: UserLite) => u.id !== user?.id))
    setShowGroupModal(true)
  }
  const openEditGroup = async (g: Group) => {
    setEditingGroup(g)
    setGroupForm({ name: g.name, description: g.description || '', color: g.color, memberIds: g.members.map(m => m.id) })
    const res = await api.get('/users')
    setUsers(res.data.data.filter((u: UserLite) => u.id !== user?.id))
    setShowGroupModal(true)
  }
  const saveGroup = async () => {
    if (!groupForm.name.trim()) { toast.error('Nome obrigatório'); return }
    try {
      if (editingGroup) {
        await api.put(`/internal-chat/groups/${editingGroup.id}`, {
          name: groupForm.name, description: groupForm.description, color: groupForm.color,
        })
        await api.put(`/internal-chat/groups/${editingGroup.id}/members`, {
          memberIds: Array.from(new Set([user!.id, ...groupForm.memberIds])),
        })
      } else {
        await api.post('/internal-chat/groups', groupForm)
      }
      toast.success(editingGroup ? 'Grupo atualizado!' : 'Grupo criado!')
      setShowGroupModal(false)
      loadGroups()
    } catch { toast.error('Erro ao salvar grupo') }
  }
  const deleteGroup = async (g: Group) => {
    if (!confirm(`Excluir o grupo "${g.name}"?`)) return
    try {
      await api.delete(`/internal-chat/groups/${g.id}`)
      if (activeGroup?.id === g.id) setActiveGroup(null)
      toast.success('Grupo removido')
      loadGroups()
    } catch { toast.error('Erro ao excluir') }
  }

  // ── Supervisão ──
  const loadSupAgents = useCallback(async () => {
    const res = await api.get('/users')
    setUsers(res.data.data.filter((u: UserLite) => u.role !== 'ADMIN'))
  }, [])
  useEffect(() => { if (tab === 'supervision') loadSupAgents() }, [tab, loadSupAgents])

  const openSupAgent = async (agent: UserLite) => {
    setSupAgent(agent); setSupConvs([]); setSupMessages([]); setSupConvId(null)
    const res = await api.get(`/internal-chat/supervision/${agent.id}/conversations`)
    setSupConvs(res.data.data)
  }
  const openSupConv = async (convId: string) => {
    setSupConvId(convId); setSupMessages([])
    const res = await api.get(`/internal-chat/supervision/conversations/${convId}/messages`)
    setSupMessages(res.data.data)
  }
  // Supervisão em tempo real
  useEffect(() => {
    if (tab !== 'supervision' || !supConvId) return
    const socket = getSocket()
    const onNew = (payload: any) => {
      if (payload?.message?.conversationId === supConvId) {
        setSupMessages((prev) => [...prev, payload.message])
      }
    }
    socket.on('new-message', onNew)
    return () => { socket.off('new-message', onNew) }
  }, [tab, supConvId])

  const fmtTime = (d: string) => isToday(new Date(d)) ? format(new Date(d), 'HH:mm') : format(new Date(d), 'dd/MM HH:mm')

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header com tabs */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-bg-secondary flex-shrink-0">
        <h1 className="text-lg font-bold text-text-primary flex items-center gap-2">
          <Users size={20} className="text-primary" /> Chat Interno
        </h1>
        {isAdmin && (
          <div className="flex gap-1 bg-bg-tertiary p-1 rounded-lg ml-2">
            <button onClick={() => setTab('groups')}
              className={`px-3 py-1 text-xs font-medium rounded-md ${tab === 'groups' ? 'bg-card text-text-primary shadow' : 'text-text-muted'}`}>
              Grupos
            </button>
            <button onClick={() => setTab('supervision')}
              className={`px-3 py-1 text-xs font-medium rounded-md flex items-center gap-1 ${tab === 'supervision' ? 'bg-card text-text-primary shadow' : 'text-text-muted'}`}>
              <Eye size={12} /> Supervisão
            </button>
          </div>
        )}
      </div>

      {/* ── ABA GRUPOS ── */}
      {tab === 'groups' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Lista de grupos */}
          <div className={`w-full md:w-72 border-r border-border flex-col flex-shrink-0 ${activeGroup ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-semibold text-text-secondary">Grupos</span>
              {isAdmin && (
                <button onClick={openCreateGroup} className="btn-primary text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                  <Plus size={12} /> Novo
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {groups.length === 0 ? (
                <p className="text-text-muted text-sm text-center p-6">Nenhum grupo ainda</p>
              ) : groups.map((g) => (
                <button key={g.id} onClick={() => openGroup(g)}
                  className={`w-full flex items-center gap-3 p-3 border-b border-border/50 hover:bg-bg-hover transition-colors text-left ${activeGroup?.id === g.id ? 'bg-bg-hover' : ''}`}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: g.color + '33', color: g.color }}>
                    <Hash size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{g.name}</p>
                    <p className="text-xs text-text-muted truncate">{g.lastMessage || `${g.memberCount} membros`}</p>
                  </div>
                  {g.unread > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 bg-green-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{g.unread}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Chat do grupo */}
          <div className={`flex-1 flex-col bg-bg-primary min-w-0 ${activeGroup ? 'flex' : 'hidden md:flex'}`}>
            {!activeGroup ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted">
                <MessageSquare size={40} className="mb-3 opacity-20" />
                <p>Selecione um grupo</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 p-3 bg-bg-secondary border-b border-border flex-shrink-0">
                  <button onClick={() => setActiveGroup(null)} className="md:hidden text-text-muted p-1"><ChevronRight size={20} className="rotate-180" /></button>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: activeGroup.color + '33', color: activeGroup.color }}>
                    <Hash size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary">{activeGroup.name}</p>
                    <p className="text-xs text-text-muted">{activeGroup.memberCount} membros</p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button onClick={() => openEditGroup(activeGroup)} className="p-1.5 text-text-muted hover:text-primary rounded-lg"><Edit2 size={14} /></button>
                      <button onClick={() => deleteGroup(activeGroup)} className="p-1.5 text-text-muted hover:text-danger rounded-lg"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {loadingMsgs ? (
                    <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" /></div>
                  ) : messages.length === 0 ? (
                    <p className="text-text-muted text-sm text-center py-8">Nenhuma mensagem. Comece a conversa!</p>
                  ) : messages.map((m) => {
                    const mine = m.userId === user?.id
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={mine ? 'message-bubble-out' : 'message-bubble-in'}>
                          {!mine && <p className="text-xs font-semibold mb-0.5 opacity-80">{m.user.name}</p>}
                          <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                          <p className={`text-xs mt-1 ${mine ? 'text-white/60' : 'text-text-muted'}`}>{fmtTime(m.createdAt)}</p>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={endRef} />
                </div>

                <div className="p-3 border-t border-border flex items-end gap-2 flex-shrink-0">
                  <textarea value={input} onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                    placeholder="Mensagem para o grupo..." rows={1}
                    className="input-field flex-1 resize-none max-h-24 py-2.5" />
                  <button onClick={send} disabled={!input.trim()} className="btn-primary p-2.5 rounded-xl"><Send size={16} /></button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ABA SUPERVISÃO (admin) ── */}
      {tab === 'supervision' && isAdmin && (
        <div className="flex-1 flex overflow-hidden">
          {/* Agentes */}
          <div className="w-56 border-r border-border flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-border text-sm font-semibold text-text-secondary">Agentes</div>
            <div className="flex-1 overflow-y-auto">
              {users.map((a) => (
                <button key={a.id} onClick={() => openSupAgent(a)}
                  className={`w-full flex items-center gap-2 p-3 border-b border-border/50 hover:bg-bg-hover text-left ${supAgent?.id === a.id ? 'bg-bg-hover' : ''}`}>
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">{a.name.charAt(0)}</div>
                  <span className="text-sm text-text-primary truncate">{a.name}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Conversas do agente */}
          <div className="w-64 border-r border-border flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-border text-sm font-semibold text-text-secondary">
              {supAgent ? `Conversas de ${supAgent.name}` : 'Selecione um agente'}
            </div>
            <div className="flex-1 overflow-y-auto">
              {supConvs.map((c) => (
                <button key={c.id} onClick={() => openSupConv(c.id)}
                  className={`w-full p-3 border-b border-border/50 hover:bg-bg-hover text-left ${supConvId === c.id ? 'bg-bg-hover' : ''}`}>
                  <p className="text-sm text-text-primary truncate">{c.contact?.name || c.contact?.phone || 'Contato'}</p>
                  <p className="text-xs text-text-muted truncate">{c.lastMessage || ''}</p>
                </button>
              ))}
              {supAgent && supConvs.length === 0 && <p className="text-text-muted text-xs text-center p-4">Sem conversas</p>}
            </div>
          </div>
          {/* Mensagens (read-only) */}
          <div className="flex-1 flex flex-col bg-bg-primary min-w-0">
            {!supConvId ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted">
                <Eye size={40} className="mb-3 opacity-20" />
                <p>Visualização em tempo real</p>
                <p className="text-xs mt-1">Selecione uma conversa do agente</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {supMessages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === 'OUT' ? 'justify-end' : 'justify-start'}`}>
                    <div className={m.direction === 'OUT' ? 'message-bubble-out' : 'message-bubble-in'}>
                      <p className="text-sm whitespace-pre-wrap">{m.textBody || `[${(m.type || 'midia').toLowerCase()}]`}</p>
                      <p className={`text-xs mt-1 ${m.direction === 'OUT' ? 'text-white/60' : 'text-text-muted'}`}>{fmtTime(m.sentAt || m.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal grupo */}
      {showGroupModal && (
        <div className="modal-overlay" onClick={() => setShowGroupModal(false)}>
          <div className="modal-panel max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-text-primary mb-4">{editingGroup ? 'Editar Grupo' : 'Novo Grupo'}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-text-muted">Nome *</label>
                <input className="input w-full mt-1" placeholder="Ex: Vendedores, Gerentes..."
                  value={groupForm.name} onChange={(e) => setGroupForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm text-text-muted">Cor</label>
                <div className="flex gap-2 mt-1">
                  {['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899'].map(c => (
                    <button key={c} onClick={() => setGroupForm(p => ({ ...p, color: c }))}
                      className="w-7 h-7 rounded-full border-2" style={{ backgroundColor: c, borderColor: groupForm.color === c ? '#fff' : 'transparent' }} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-text-muted">Membros</label>
                <div className="mt-1 max-h-44 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                  {users.map((u) => {
                    const sel = groupForm.memberIds.includes(u.id)
                    return (
                      <button key={u.id} onClick={() => setGroupForm(p => ({
                        ...p, memberIds: sel ? p.memberIds.filter(id => id !== u.id) : [...p.memberIds, u.id],
                      }))} className="w-full flex items-center justify-between p-2 hover:bg-bg-hover text-left">
                        <span className="text-sm text-text-primary">{u.name}</span>
                        <span className={`w-4 h-4 rounded border flex items-center justify-center ${sel ? 'bg-primary border-primary' : 'border-border'}`}>
                          {sel && <span className="text-white text-[10px]">✓</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn-primary flex-1" onClick={saveGroup}>{editingGroup ? 'Salvar' : 'Criar'}</button>
              <button className="btn-ghost flex-1 border border-border" onClick={() => setShowGroupModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

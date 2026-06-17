import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search as SearchIcon, User, MessageSquare, Loader2 } from 'lucide-react'
import { searchApi } from '../services/api'
import Avatar from '../components/UI/Avatar'

interface Result {
  contacts: { id: string; name: string; phone: string; avatarUrl?: string | null }[]
  messages: { id: string; textBody?: string; direction: string; createdAt: string; conversationId: string; contact?: { id: string; name: string; phone: string } }[]
}

export default function Search() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [res, setRes] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const doSearch = async () => {
    if (q.trim().length < 2) return
    setLoading(true); setSearched(true)
    try {
      const r = await searchApi.search(q.trim())
      setRes(r.data.data)
    } catch { setRes({ contacts: [], messages: [] }) }
    finally { setLoading(false) }
  }

  const total = (res?.contacts.length || 0) + (res?.messages.length || 0)

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-text-primary mb-1">Busca</h1>
      <p className="text-text-muted text-sm mb-5">Encontre contatos e mensagens em todo o sistema</p>

      <div className="relative mb-6">
        <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
          placeholder="Buscar por nome, telefone ou texto da mensagem..."
          className="input-field pl-12 pr-24 w-full py-3"
        />
        <button onClick={doSearch} disabled={loading || q.trim().length < 2}
          className="btn-primary absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1.5 text-sm">
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Buscar'}
        </button>
      </div>

      {searched && !loading && total === 0 && (
        <p className="text-text-muted text-center py-10">Nada encontrado para "{q}"</p>
      )}

      {res && res.contacts.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5">
            <User size={13} /> Contatos ({res.contacts.length})
          </h2>
          <div className="space-y-1.5">
            {res.contacts.map((c) => (
              <button key={c.id} onClick={() => navigate('/contacts')}
                className="w-full card p-3 flex items-center gap-3 hover:border-border-light text-left">
                <Avatar src={c.avatarUrl} name={c.name} size={38} />
                <div className="min-w-0">
                  <p className="text-text-primary text-sm font-medium truncate">{c.name}</p>
                  <p className="text-text-muted text-xs">{c.phone}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {res && res.messages.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5">
            <MessageSquare size={13} /> Mensagens ({res.messages.length})
          </h2>
          <div className="space-y-1.5">
            {res.messages.map((m) => (
              <button key={m.id} onClick={() => navigate('/attendance')}
                className="w-full card p-3 text-left hover:border-border-light">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-text-primary text-sm font-medium truncate">{m.contact?.name || m.contact?.phone || 'Contato'}</span>
                  <span className="text-text-muted text-[10px]">{m.direction === 'OUT' ? 'enviada' : 'recebida'}</span>
                </div>
                <p className="text-text-secondary text-sm truncate">{m.textBody}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

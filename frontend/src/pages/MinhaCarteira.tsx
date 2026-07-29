import { useEffect, useState } from 'react'
import { Wallet, AlertCircle, Loader2 } from 'lucide-react'
import { portfolioApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

interface WalletLink {
  id: string
  walletId: string
  walletName: string
  whatsappSessionId: string | null
  user: { id: string; name: string }
}

export default function MinhaCarteira() {
  const { isAdmin } = useAuth()
  const [wallets, setWallets] = useState<WalletLink[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    portfolioApi
      .wallets()
      .then((r) => setWallets(r.data.data || []))
      .catch((e) => setErro(e?.response?.data?.message || 'Não foi possível carregar as carteiras'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Wallet size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Minha Carteira</h1>
          <p className="text-text-muted text-sm">
            {isAdmin ? 'Todas as carteiras vinculadas ao CRM' : 'As carteiras que você gerencia no Parceria Financeiro'}
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-text-muted text-sm py-10 justify-center">
          <Loader2 size={16} className="animate-spin" /> Carregando…
        </div>
      )}

      {erro && (
        <div className="flex items-start gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{erro}</span>
        </div>
      )}

      {!loading && !erro && wallets.length === 0 && (
        <div className="p-6 rounded-xl border border-border bg-bg-secondary text-center">
          <p className="text-text-primary font-medium">Nenhuma carteira vinculada ainda</p>
          <p className="text-text-muted text-sm mt-1">
            Um administrador precisa rodar "Sincronizar gerentes" em Usuários para trazer as carteiras do
            Parceria Financeiro.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {wallets.map((w) => (
          <div
            key={w.id}
            className="p-4 rounded-xl border border-border bg-bg-secondary flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-lg bg-gold/15 flex items-center justify-center flex-shrink-0">
              <Wallet size={16} className="text-gold" />
            </div>
            <div className="min-w-0">
              <p className="text-text-primary font-semibold truncate">{w.walletName}</p>
              {isAdmin && <p className="text-text-muted text-xs mt-0.5 truncate">Gerente: {w.user.name}</p>}
              <p className="text-text-muted text-[11px] mt-1">
                Clientes e cobrança chegam na próxima etapa.
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

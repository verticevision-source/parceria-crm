import { useEffect, useMemo, useState } from 'react'
import { Wallet, AlertCircle, Loader2, Search, MessageCircle, X, AlertTriangle } from 'lucide-react'
import { portfolioApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const dinheiro = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

interface Parcela {
  id: string
  numero: number
  vencimento: string
  valor: number
  pago: number | null
  status: string
  diasAtraso: number
  moraSugerida?: number
}

interface Cliente {
  loanId: string
  walletName: string
  cliente: { id: string; nome: string; cpf: string; telefone: string; endereco: string | null }
  plano: string
  saldoDevedor: number
  totalPago: number
  parcelasPagas: number
  parcelasTotal: number
  parcelasVencidas: number
  totalVencido: number
  diasAtraso: number
  inadimplente: boolean
  parcelas: Parcela[]
}

/** Só dígitos, com DDI — o link do WhatsApp não aceita máscara. */
const paraWhats = (tel: string) => {
  const d = (tel || '').replace(/\D/g, '')
  if (!d) return null
  return d.startsWith('55') ? d : `55${d}`
}

export default function MinhaCarteira() {
  const { isAdmin } = useAuth()
  const [dados, setDados] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'atrasados' | 'todos'>('atrasados')
  const [aberto, setAberto] = useState<Cliente | null>(null)

  useEffect(() => {
    portfolioApi
      .clients()
      .then((r) => setDados(r.data.data))
      .catch((e) => setErro(e?.response?.data?.message || 'Não foi possível carregar sua carteira'))
      .finally(() => setLoading(false))
  }, [])

  const clientes: Cliente[] = dados?.clientes || []

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return clientes
      .filter((c) => (filtro === 'atrasados' ? c.inadimplente : true))
      .filter((c) =>
        !q
          ? true
          : c.cliente.nome.toLowerCase().includes(q) ||
            (c.cliente.cpf || '').includes(q) ||
            (c.cliente.telefone || '').includes(q)
      )
      // Quem está mais atrasado primeiro: é a ordem em que ela vai ligar.
      .sort((a, b) => b.diasAtraso - a.diasAtraso || b.totalVencido - a.totalVencido)
  }, [clientes, busca, filtro])

  const atrasados = clientes.filter((c) => c.inadimplente).length

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Wallet size={20} className="text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-text-primary">Minha Carteira</h1>
          <p className="text-text-muted text-sm truncate">
            {loading ? 'Carregando…' : dados?.gerente?.nome || (isAdmin ? 'Visão do administrador' : '')}
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-text-muted text-sm py-12 justify-center">
          <Loader2 size={16} className="animate-spin" /> Buscando no sistema financeiro…
        </div>
      )}

      {erro && (
        <div className="flex items-start gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{erro}</p>
            <p className="text-danger/70 text-xs mt-1">
              Os dados de empréstimo vêm do Parceria Financeiro. Se ele estiver fora do ar,
              esta tela fica vazia — nenhum valor é guardado aqui.
            </p>
          </div>
        </div>
      )}

      {!loading && !erro && (
        <>
          {/* Resumo: os 3 números que a gerente olha antes de começar o dia */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <Cartao rotulo="Clientes" valor={String(dados?.resumo?.clientes ?? 0)} />
            <Cartao rotulo="Em atraso" valor={String(atrasados)} alerta={atrasados > 0} />
            <Cartao rotulo="Total vencido" valor={dinheiro(dados?.resumo?.totalVencido ?? 0)} alerta={(dados?.resumo?.totalVencido ?? 0) > 0} />
            <Cartao rotulo="Saldo devedor" valor={dinheiro(dados?.resumo?.saldoDevedorTotal ?? 0)} />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, CPF ou telefone"
                className="input-field pl-9"
              />
            </div>
            <div className="flex rounded-xl overflow-hidden border border-border flex-shrink-0">
              {(['atrasados', 'todos'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    filtro === f ? 'bg-primary text-white' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {f === 'atrasados' ? `Em atraso (${atrasados})` : `Todos (${clientes.length})`}
                </button>
              ))}
            </div>
          </div>

          {lista.length === 0 ? (
            <div className="p-8 rounded-xl border border-border bg-bg-secondary text-center">
              <p className="text-text-primary font-medium">
                {clientes.length === 0 ? 'Nenhum cliente na sua carteira' : 'Nada encontrado'}
              </p>
              <p className="text-text-muted text-sm mt-1">
                {clientes.length === 0
                  ? 'Se você tem clientes no Parceria Financeiro, peça pro administrador rodar "Sincronizar gerentes".'
                  : filtro === 'atrasados'
                    ? 'Ninguém em atraso com esse termo. Veja em "Todos".'
                    : 'Tente outro nome, CPF ou telefone.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {lista.map((c) => (
                <LinhaCliente key={c.loanId} c={c} onAbrir={() => setAberto(c)} />
              ))}
            </div>
          )}
        </>
      )}

      {aberto && <FichaCliente c={aberto} onFechar={() => setAberto(null)} />}
    </div>
  )
}

function Cartao({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="p-3 rounded-xl border bg-bg-secondary"
      style={alerta ? { borderColor: 'rgba(239,68,68,.4)' } : { borderColor: 'var(--border, #1e2d4a)' }}>
      <p className="text-text-muted text-[11px] uppercase tracking-wide">{rotulo}</p>
      <p className={`text-lg font-bold mt-0.5 ${alerta ? 'text-danger' : 'text-text-primary'}`}>{valor}</p>
    </div>
  )
}

function LinhaCliente({ c, onAbrir }: { c: Cliente; onAbrir: () => void }) {
  const zap = paraWhats(c.cliente.telefone)
  return (
    <div
      className="p-3 sm:p-4 rounded-xl border bg-bg-secondary flex items-start gap-3"
      style={c.inadimplente ? { borderColor: 'rgba(239,68,68,.35)' } : undefined}
    >
      <button onClick={onAbrir} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-text-primary font-semibold truncate">{c.cliente.nome}</p>
          {c.inadimplente && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-danger/15 text-danger border border-danger/40">
              {c.diasAtraso}d em atraso
            </span>
          )}
        </div>
        <p className="text-text-muted text-xs mt-1">
          {c.parcelasPagas}/{c.parcelasTotal} parcelas · saldo {dinheiro(c.saldoDevedor)}
          {c.totalVencido > 0 && <span className="text-danger"> · vencido {dinheiro(c.totalVencido)}</span>}
        </p>
        <p className="text-text-muted text-[11px] mt-0.5 truncate">{c.walletName} · {c.cliente.telefone}</p>
      </button>
      {zap && (
        <a
          href={`https://wa.me/${zap}`}
          target="_blank"
          rel="noreferrer"
          title="Abrir conversa no WhatsApp"
          className="flex-shrink-0 p-2 rounded-lg bg-success/15 text-success hover:bg-success/25 transition-colors"
        >
          <MessageCircle size={16} />
        </a>
      )}
    </div>
  )
}

function FichaCliente({ c, onFechar }: { c: Cliente; onFechar: () => void }) {
  const [ficha, setFicha] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', onEsc)
    portfolioApi
      .borrower({ id: c.cliente.id })
      .then((r) => setFicha(r.data.data))
      .catch((e) => toast.error(e?.response?.data?.message || 'Não foi possível abrir a ficha'))
      .finally(() => setCarregando(false))
    return () => document.removeEventListener('keydown', onEsc)
  }, [c.cliente.id, onFechar])

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onFechar}>
      <div
        className="bg-bg-secondary w-full sm:max-w-2xl max-h-[92vh] sm:rounded-2xl rounded-t-2xl border border-border overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-text-primary font-bold truncate">{c.cliente.nome}</h2>
            <p className="text-text-muted text-xs mt-0.5">CPF {c.cliente.cpf} · {c.cliente.telefone}</p>
          </div>
          <button onClick={onFechar} className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-5">
          {carregando ? (
            <div className="flex items-center gap-2 text-text-muted text-sm py-8 justify-center">
              <Loader2 size={16} className="animate-spin" /> Carregando ficha…
            </div>
          ) : !ficha ? (
            <p className="text-text-muted text-sm">Ficha não disponível.</p>
          ) : (
            <>
              <Secao titulo="Dados do cliente">
                <Campo rotulo="Profissão" valor={ficha.cliente.profissao} />
                <Campo rotulo="Tipo" valor={ficha.cliente.tipo} />
                <Campo rotulo="RG" valor={ficha.cliente.rg} />
                <Campo rotulo="Nascimento" valor={ficha.cliente.nascimento ? dataCurta(ficha.cliente.nascimento) : null} />
                <Campo rotulo="Endereço" valor={ficha.cliente.enderecoResidencial} largo />
                <Campo rotulo="Comercial" valor={ficha.cliente.enderecoComercial} largo />
              </Secao>

              {ficha.referencias?.length > 0 && (
                <Secao titulo="Referências">
                  {ficha.referencias.map((r: any, i: number) => (
                    <Campo key={i} rotulo={r.nome} valor={r.telefone} />
                  ))}
                </Secao>
              )}

              {ficha.emprestimos?.map((emp: any) => (
                <div key={emp.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-text-primary text-sm font-bold">
                      Empréstimo {emp.plano === 'DAILY' ? 'diário' : emp.plano === 'WEEKLY' ? 'semanal' : emp.plano}
                    </p>
                    <span className="text-text-muted text-xs">{dataCurta(emp.data)}</span>
                    {emp.parcelasVencidas > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-danger/15 text-danger border border-danger/40 flex items-center gap-1">
                        <AlertTriangle size={9} /> {emp.parcelasVencidas} vencida(s)
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    <Campo rotulo="Emprestado" valor={dinheiro(emp.valorEmprestado)} />
                    <Campo rotulo="Total a pagar" valor={dinheiro(emp.totalAPagar)} />
                    <Campo rotulo="Já pago" valor={dinheiro(emp.totalPago)} />
                    <Campo rotulo="Saldo" valor={dinheiro(emp.saldoDevedor)} />
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-text-muted">
                          <th className="text-left p-2 font-medium">#</th>
                          <th className="text-left p-2 font-medium">Vence</th>
                          <th className="text-right p-2 font-medium">Valor</th>
                          <th className="text-right p-2 font-medium">Pago</th>
                          <th className="text-left p-2 font-medium">Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {emp.parcelas.map((p: any) => {
                          const atrasada = p.status !== 'PAID' && p.diasAtraso > 0
                          return (
                            <tr key={p.id} className="border-b border-border/50 last:border-0">
                              <td className="p-2 text-text-muted">{p.numero}</td>
                              <td className="p-2 text-text-secondary">{dataCurta(p.vencimento)}</td>
                              <td className="p-2 text-right text-text-secondary">{dinheiro(p.valor)}</td>
                              <td className="p-2 text-right text-text-muted">{p.pago ? dinheiro(p.pago) : '—'}</td>
                              <td className="p-2">
                                {p.status === 'PAID' ? (
                                  <span className="text-success">Paga</span>
                                ) : atrasada ? (
                                  <span className="text-danger font-medium">{p.diasAtraso}d atraso</span>
                                ) : (
                                  <span className="text-text-muted">A vencer</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              <p className="text-text-muted text-[11px] pt-2 border-t border-border">
                Dados vindos do Parceria Financeiro em tempo real. A baixa de pagamento
                entra na próxima etapa — por enquanto continue dando baixa por lá.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-text-primary text-sm font-bold mb-2">{titulo}</p>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  )
}

function Campo({ rotulo, valor, largo }: { rotulo: string; valor?: string | null; largo?: boolean }) {
  if (!valor) return null
  return (
    <div className={largo ? 'col-span-2' : ''}>
      <p className="text-text-muted text-[10px] uppercase tracking-wide">{rotulo}</p>
      <p className="text-text-secondary text-sm break-words">{valor}</p>
    </div>
  )
}

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
  const [cobrando, setCobrando] = useState<Cliente | null>(null)

  const recarregar = () => {
    portfolioApi
      .clients()
      .then((r) => setDados(r.data.data))
      .catch((e) => setErro(e?.response?.data?.message || 'Não foi possível carregar sua carteira'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { recarregar() }, [])

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
                <LinhaCliente key={c.loanId} c={c} onAbrir={() => setAberto(c)} onCobrar={() => setCobrando(c)} />
              ))}
            </div>
          )}
        </>
      )}

      {aberto && <FichaCliente c={aberto} onFechar={() => setAberto(null)} onMudou={recarregar} />}
      {cobrando && (
        <ModalCobranca c={cobrando} nomeGerente={dados?.gerente?.nome} onFechar={() => setCobrando(null)} />
      )}
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

function LinhaCliente({ c, onAbrir, onCobrar }: { c: Cliente; onAbrir: () => void; onCobrar: () => void }) {
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
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        {/* Cobrar PELO SISTEMA: sai do numero da carteira e fica registrado.
            O wa.me abaixo sai do celular pessoal e nao deixa rastro — fica como
            alternativa, nao como caminho principal. */}
        <button
          onClick={onCobrar}
          title="Cobrar pelo número da carteira (fica registrado)"
          className="px-2.5 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 text-[11px] font-semibold transition-colors whitespace-nowrap"
        >
          Cobrar
        </button>
        {zap && (
          <a
            href={`https://wa.me/${zap}`}
            target="_blank"
            rel="noreferrer"
            title="Abrir no seu WhatsApp pessoal (não fica registrado)"
            className="p-1.5 rounded-lg bg-bg-tertiary text-text-muted hover:text-success transition-colors flex items-center justify-center"
          >
            <MessageCircle size={14} />
          </a>
        )}
      </div>
    </div>
  )
}

function FichaCliente({ c, onFechar, onMudou }: { c: Cliente; onFechar: () => void; onMudou: () => void }) {
  const [ficha, setFicha] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [baixando, setBaixando] = useState<Parcela | null>(null)

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
                          <th className="p-2"></th>
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
                              <td className="p-2 text-right">
                                {p.status !== 'PAID' && (
                                  <button
                                    onClick={() => {
                                      // A mora sugerida vem da lista da carteira, que já
                                      // calculou com o motor do financeiro.
                                      const daLista = c.parcelas.find((x) => x.id === p.id)
                                      setBaixando({ ...p, moraSugerida: daLista?.moraSugerida ?? 0 })
                                    }}
                                    className="px-2 py-1 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 text-[11px] font-semibold whitespace-nowrap transition-colors"
                                  >
                                    Dar baixa
                                  </button>
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
                Dados vindos do Parceria Financeiro em tempo real. A baixa também é gravada
                lá — este painel não guarda valor nenhum.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Baixa de pagamento. Duas coisas que o desenho tem que deixar óbvias, senão o
 * dinheiro entra errado:
 *  - O JUROS está DENTRO do valor recebido, não somado a ele. Por isso a tela
 *    mostra a conta desmembrada em vez de só dois campos soltos.
 *  - A cascata: pagar mais que a parcela adianta as próximas. A gerente vê
 *    quais serão quitadas ANTES de confirmar, senão a baixa "some" aos olhos
 *    dela e ela lança de novo.
 */
function ModalBaixa({
  c,
  parcela,
  onFechar,
  onPronto,
}: {
  c: Cliente
  parcela: Parcela
  onFechar: () => void
  onPronto: () => void
}) {
  const sugerido = parcela.valor - (parcela.pago || 0) + (parcela.moraSugerida || 0)
  const [valor, setValor] = useState(sugerido.toFixed(2))
  const [juros, setJuros] = useState((parcela.moraSugerida || 0).toFixed(2))
  const [metodo, setMetodo] = useState<'DINHEIRO' | 'PIX'>('DINHEIRO')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<any>(null)
  // Uma chave por abertura do modal: repetir a MESMA baixa não duplica.
  const [eventoId] = useState(() =>
    (globalThis.crypto?.randomUUID?.() as string) || `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  )

  const vNum = Number(valor.replace(',', '.')) || 0
  const jNum = Number(juros.replace(',', '.')) || 0
  const principal = Math.max(0, vNum - jNum)
  const jurosMaior = jNum > vNum

  // Simula a cascata: preenche a parcela alvo e vai quitando as próximas.
  const quitadas = useMemo(() => {
    if (principal <= 0) return []
    const pend = c.parcelas.filter((p) => p.status !== 'PAID')
    const ordem = [
      ...pend.filter((p) => p.id === parcela.id),
      ...pend.filter((p) => p.id !== parcela.id).sort((a, b) => a.numero - b.numero),
    ]
    let resta = principal
    const out: number[] = []
    for (const p of ordem) {
      const falta = p.valor - (p.pago || 0)
      if (falta <= 0.004) continue
      if (resta >= falta - 0.005) {
        out.push(p.numero)
        resta -= falta
      } else break
    }
    return out
  }, [principal, c.parcelas, parcela.id])

  const sobra = useMemo(() => {
    const pend = c.parcelas.filter((p) => p.status !== 'PAID')
    const totalFalta = pend.reduce((s, p) => s + Math.max(0, p.valor - (p.pago || 0)), 0)
    return Math.max(0, principal - totalFalta)
  }, [principal, c.parcelas])

  const confirmar = async () => {
    if (vNum <= 0) return toast.error('Informe o valor recebido')
    if (jurosMaior) return toast.error('O juros não pode ser maior que o valor recebido')
    if (!senha) return toast.error('Confirme com sua senha de operação')
    setEnviando(true)
    try {
      const r = await portfolioApi.darBaixa({
        loanId: c.loanId,
        installmentId: parcela.id,
        amount: vNum,
        moraAmount: jNum,
        metodo,
        opPassword: senha,
        eventoId,
      })
      setSenha('')
      setResultado(r.data.data)
      toast.success(r.data.data?.repetido ? 'Esta baixa já estava registrada' : 'Baixa registrada no financeiro')
      onPronto()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Não foi possível dar baixa', { duration: 7000 })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-bg-secondary w-full sm:max-w-md max-h-[92vh] sm:rounded-2xl rounded-t-2xl border border-border overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-text-primary font-bold">Dar baixa · parcela {parcela.numero}</h2>
            <p className="text-text-muted text-xs mt-0.5 truncate">{c.cliente.nome}</p>
          </div>
          <button onClick={onFechar} className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {resultado ? (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-success/10 border border-success/30">
                <p className="text-success font-semibold text-sm">
                  {resultado.emprestimo?.quitado ? '✅ Empréstimo quitado!' : '✅ Baixa registrada'}
                </p>
                <p className="text-text-secondary text-xs mt-1">
                  Saldo devedor agora: {dinheiro(resultado.emprestimo?.saldoDevedor ?? 0)}
                </p>
              </div>
              <button onClick={onFechar} className="btn-primary w-full">Fechar</button>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Valor recebido <span className="text-text-muted text-xs">(total, com o juros dentro)</span>
                </label>
                <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="input-field text-lg font-semibold" />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Juros por atraso <span className="text-text-muted text-xs">(sugerido, pode mudar)</span>
                </label>
                <input value={juros} onChange={(e) => setJuros(e.target.value)} inputMode="decimal" className="input-field" />
              </div>

              {/* A conta desmembrada: é o que evita a gerente somar o juros duas vezes */}
              <div className="rounded-xl p-3 text-sm space-y-1" style={{ background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.2)' }}>
                <Linha rotulo="Recebido do cliente" valor={dinheiro(vNum)} />
                <Linha rotulo="— Juros (receita à parte)" valor={dinheiro(jNum)} />
                <Linha rotulo="= Abate da dívida" valor={dinheiro(principal)} forte />
                {jurosMaior && (
                  <p className="text-danger text-xs pt-1">O juros não pode ser maior que o valor recebido.</p>
                )}
                {quitadas.length > 0 && (
                  <p className="text-text-secondary text-xs pt-1">
                    Vai quitar {quitadas.length === 1 ? 'a parcela' : 'as parcelas'} <b>{quitadas.join(', ')}</b>
                    {quitadas.length > 1 && ' (o excedente adianta as próximas)'}
                  </p>
                )}
                {principal > 0 && quitadas.length === 0 && (
                  <p className="text-text-secondary text-xs pt-1">Pagamento parcial: nenhuma parcela fica quitada.</p>
                )}
                {sobra > 0.004 && (
                  <p className="text-warning text-xs pt-1">
                    ⚠️ {dinheiro(sobra)} acima do saldo devedor — esse excedente NÃO será aplicado.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Como recebeu</label>
                <div className="flex rounded-xl overflow-hidden border border-border">
                  {(['DINHEIRO', 'PIX'] as const).map((m) => (
                    <button key={m} onClick={() => setMetodo(m)}
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        metodo === m ? 'bg-primary text-white' : 'text-text-muted hover:text-text-primary'
                      }`}>
                      {m === 'DINHEIRO' ? 'Dinheiro' : 'PIX'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Senha de operação</label>
                <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmar() }}
                  placeholder="a mesma que você usa no financeiro" className="input-field" autoComplete="off" />
                <p className="text-text-muted text-[11px] mt-1.5">
                  A baixa é gravada no Parceria Financeiro, com o caixa da carteira aberto.
                  Se o caixa estiver fechado, o sistema recusa — o valor não pode ficar fora do fechamento do dia.
                </p>
              </div>

              <button onClick={confirmar} disabled={enviando || jurosMaior} className="btn-primary w-full flex items-center justify-center gap-2">
                {enviando ? <><Loader2 size={15} className="animate-spin" /> Registrando…</> : `Confirmar ${dinheiro(vNum)}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Cobrança pelo número da carteira, passando pelo sistema.
 *
 * O texto sugerido é factual e oferece diálogo, de propósito: cobrança que
 * pressiona ou expõe o cliente é proibida (CDC art. 42) e, na prática, faz a
 * pessoa bloquear o número — aí a carteira perde o canal de cobrança inteiro.
 * Sempre editável antes de enviar.
 */
function ModalCobranca({
  c,
  nomeGerente,
  onFechar,
}: {
  c: Cliente
  nomeGerente?: string
  onFechar: () => void
}) {
  const primeiroNome = (c.cliente.nome || '').trim().split(/\s+/)[0] || 'tudo bem'
  const sugerido = [
    `Oi ${primeiroNome}, tudo bem?${nomeGerente ? ` Aqui é a ${nomeGerente.split(/\s+/)[0]}` : ''} da Parceria Financeira.`,
    '',
    c.totalVencido > 0
      ? `Passando para lembrar da sua parcela em aberto, de ${dinheiro(c.totalVencido)}. Consegue acertar hoje?`
      : 'Passando para falar do seu empréstimo. Podemos conversar?',
    '',
    'Se estiver difícil agora, me chama aqui que a gente vê uma forma juntos.',
  ].join('\n')

  const [texto, setTexto] = useState(sugerido)
  const [enviando, setEnviando] = useState(false)

  const enviar = async () => {
    if (!texto.trim()) return toast.error('Escreva a mensagem')
    setEnviando(true)
    try {
      await portfolioApi.cobrar({ phone: c.cliente.telefone, body: texto.trim(), walletId: undefined })
      toast.success('Mensagem enviada — a conversa está no Atendimento')
      onFechar()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Não foi possível enviar', { duration: 7000 })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onFechar}>
      <div className="bg-bg-secondary w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-text-primary font-bold truncate">Cobrar {c.cliente.nome}</h2>
            <p className="text-text-muted text-xs mt-0.5">
              {c.diasAtraso > 0 ? `${c.diasAtraso} dias em atraso · ` : ''}{dinheiro(c.totalVencido)} vencido
            </p>
          </div>
          <button onClick={onFechar} className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8}
            className="input-field resize-none text-sm" />
          <p className="text-text-muted text-[11px]">
            Sai pelo número da sua carteira e fica registrada no Atendimento — a resposta
            do cliente chega no seu painel.
          </p>
          <button onClick={enviar} disabled={enviando} className="btn-primary w-full flex items-center justify-center gap-2">
            {enviando ? <><Loader2 size={15} className="animate-spin" /> Enviando…</> : <><MessageCircle size={15} /> Enviar cobrança</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={forte ? 'text-text-primary font-semibold' : 'text-text-muted'}>{rotulo}</span>
      <span className={forte ? 'text-text-primary font-bold' : 'text-text-secondary'}>{valor}</span>
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

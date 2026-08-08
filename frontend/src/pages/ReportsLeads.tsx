import { useState, useEffect } from 'react'
import { api } from '../services/api'
import toast from 'react-hot-toast'
import { TrendingUp, TrendingDown, Target, MessageSquare } from 'lucide-react'

/**
 * Aba "Leads por dia": uma linha por lead, com telefone, quando caiu pro
 * vendedor e quanto cada lado demorou a responder.
 *
 * Nasceu de uma pergunta real do dono ("quantos leads a Stela atendeu no fim de
 * semana, com telefone e tempo de resposta") que só dava pra responder na mão,
 * conversa por conversa.
 */

interface LeadLinha {
  leadId: string
  cliente: string
  telefone: string
  caiuEm: string
  vendedor: string
  vendedorId: string | null
  origem: string | null
  etapa: string | null
  status: string
  msgsCliente: number
  msgsVendedor: number
  respostaVendedorSeg: number | null
  respostaClienteSeg: number | null
}

interface LeadsReport {
  periodo: { from: string; to: string }
  total: number
  truncado: boolean
  resumo: {
    totalLeads: number
    semNenhumaRespostaDoVendedor: number
    respostaVendedorMediaSeg: number | null
    respostaVendedorMedianaSeg: number | null
  } | null
  porDia: { dia: string; total: number }[]
  leads: LeadLinha[]
}

/** Hoje em Brasília, no formato do <input type="date"> (o servidor é UTC). */
function hojeBRT(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

function diasAtrasBRT(n: number): string {
  return new Date(Date.now() - 3 * 3600_000 - n * 86400_000).toISOString().slice(0, 10)
}

function duracao(seg: number | null): string {
  if (seg === null) return '—'
  if (seg < 60) return `${seg}s`
  if (seg < 3600) return `${Math.round(seg / 60)}min`
  const h = Math.floor(seg / 3600)
  const m = Math.round((seg % 3600) / 60)
  return m ? `${h}h ${m}min` : `${h}h`
}

/** Mesma leitura do semáforo do Atendimento: verde até 2min, amarelo até 15. */
function corResposta(seg: number | null): string {
  if (seg === null) return 'text-text-muted'
  if (seg <= 120) return 'text-green-500'
  if (seg <= 900) return 'text-yellow-500'
  return 'text-red-500'
}

function telefoneBonito(t: string): string {
  const m = t.match(/^55(\d{2})(\d{4,5})(\d{4})$/)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : t
}

function Kpi({ icon, label, value, accent, sub }: {
  icon: React.ReactNode; label: string; value: string | number; accent: string; sub?: string
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-lg" style={{ background: accent + '22', color: accent }}>{icon}</div>
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

export default function ReportsLeads() {
  const [from, setFrom] = useState(diasAtrasBRT(6))
  const [to, setTo] = useState(hojeBRT())
  const [vendedores, setVendedores] = useState<{ id: string; name: string }[]>([])
  const [vendedorId, setVendedorId] = useState('')
  const [data, setData] = useState<LeadsReport | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/users')
      .then((r) => setVendedores(
        (r.data.data || [])
          .filter((u: any) => u.isActive)
          .map((u: any) => ({ id: u.id, name: u.name }))
      ))
      .catch(() => { /* silencioso: filtrar por vendedor é opcional */ })
  }, [])

  useEffect(() => { void buscar() }, [])

  async function buscar() {
    if (to < from) { toast.error('A data final é anterior à inicial'); return }
    setLoading(true)
    try {
      const q = new URLSearchParams({ from, to, ...(vendedorId ? { userId: vendedorId } : {}) })
      const res = await api.get(`/reports/leads?${q}`)
      setData(res.data.data)
    } catch {
      toast.error('Erro ao carregar os leads')
    } finally {
      setLoading(false)
    }
  }

  function baixarCSV() {
    if (!data || data.leads.length === 0) return
    const cab = ['Cliente', 'Telefone', 'Caiu em', 'Vendedor', 'Origem', 'Etapa',
      'Msgs cliente', 'Msgs vendedor', 'Resp. vendedor (s)', 'Resp. cliente (s)']
    const linhas = data.leads.map((l) => [
      l.cliente, l.telefone,
      new Date(l.caiuEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      l.vendedor, l.origem || '', l.etapa || '',
      l.msgsCliente, l.msgsVendedor,
      l.respostaVendedorSeg ?? '', l.respostaClienteSeg ?? '',
    ])
    // Aspas escapadas: nome de cliente com vírgula quebraria as colunas.
    const csv = [cab, ...linhas]
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    // BOM: sem ele o Excel abre os acentos errados.
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `leads_${from}_a_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const r = data?.resumo
  const maxDia = Math.max(1, ...(data?.porDia || []).map((x) => x.total))

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-text-muted mb-1">De</label>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
            className="input h-10 px-3 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Até</label>
          <input type="date" value={to} min={from} max={hojeBRT()} onChange={(e) => setTo(e.target.value)}
            className="input h-10 px-3 text-sm" />
        </div>
        <div className="min-w-[180px]">
          <label className="block text-xs text-text-muted mb-1">Vendedor</label>
          <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}
            className="input h-10 px-3 text-sm w-full">
            <option value="">Todos</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <button onClick={buscar} disabled={loading}
          className="btn-primary h-10 px-4 text-sm rounded-lg disabled:opacity-50">
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
        <button onClick={baixarCSV} disabled={!data || data.leads.length === 0}
          className="btn-ghost h-10 px-4 text-sm rounded-lg border border-border disabled:opacity-40">
          Baixar CSV
        </button>
      </div>

      {/* Resumo */}
      {r && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={<Target size={16} />} label="Leads no período" value={r.totalLeads} accent="#6366f1" />
          <Kpi icon={<MessageSquare size={16} />} label="Resposta típica" accent="#10b981"
            value={duracao(r.respostaVendedorMedianaSeg)} sub="mediana — o dia normal" />
          <Kpi icon={<TrendingUp size={16} />} label="Média" accent="#f59e0b"
            value={duracao(r.respostaVendedorMediaSeg)} sub="puxada por casos extremos" />
          <Kpi icon={<TrendingDown size={16} />} label="Sem resposta" accent="#ef4444"
            value={r.semNenhumaRespostaDoVendedor} sub="vendedor nunca falou" />
        </div>
      )}

      {/* Leads por dia */}
      {data && data.porDia.length > 1 && (
        <div className="card p-4">
          <h3 className="font-semibold text-text-primary mb-3 text-sm">Leads por dia</h3>
          <div className="flex items-end gap-2 h-24">
            {data.porDia.map((d) => (
              <div key={d.dia} className="flex-1 flex flex-col items-center gap-1" title={`${d.dia}: ${d.total}`}>
                <span className="text-[10px] text-text-muted tabular-nums">{d.total}</span>
                <div className="w-full rounded-t bg-primary"
                  style={{ height: `${(d.total / maxDia) * 100}%`, minHeight: 2 }} />
                <span className="text-[10px] text-text-muted">{d.dia.slice(8)}/{d.dia.slice(5, 7)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="card overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-sm text-text-muted">Carregando…</p>
        ) : !data ? null : data.leads.length === 0 ? (
          <p className="p-8 text-center text-sm text-text-muted">Nenhum lead caiu nesse período.</p>
        ) : (
          <>
            {data.truncado && (
              <p className="px-4 py-2 text-xs text-yellow-500 border-b border-border">
                Mostrando os {data.total} leads mais recentes — o período tem mais que isso.
                Diminua o intervalo pra ver todos.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="text-left text-xs text-text-muted border-b border-border">
                    <th className="px-4 py-2.5 font-semibold">Cliente</th>
                    <th className="px-4 py-2.5 font-semibold">Telefone</th>
                    <th className="px-4 py-2.5 font-semibold">Caiu em</th>
                    <th className="px-4 py-2.5 font-semibold">Vendedor</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Msgs</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Resp. vendedor</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Resp. cliente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.leads.map((l) => (
                    <tr key={l.leadId} className="hover:bg-bg-hover">
                      <td className="px-4 py-2.5 font-medium text-text-primary">{l.cliente}</td>
                      <td className="px-4 py-2.5 text-text-muted tabular-nums">{telefoneBonito(l.telefone)}</td>
                      <td className="px-4 py-2.5 text-text-muted tabular-nums whitespace-nowrap">
                        {/* Só o dia: o horário exato polui a leitura e não muda
                            nenhuma decisão. Quem precisar dele tem no CSV. */}
                        {new Date(l.caiuEm).toLocaleDateString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                          day: '2-digit', month: '2-digit', year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap">{l.vendedor}</td>
                      <td className="px-4 py-2.5 text-right text-text-muted tabular-nums whitespace-nowrap">
                        {l.msgsCliente}/{l.msgsVendedor}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${corResposta(l.respostaVendedorSeg)}`}>
                        {duracao(l.respostaVendedorSeg)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-text-muted tabular-nums">
                        {duracao(l.respostaClienteSeg)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2.5 text-xs text-text-muted border-t border-border">
              Msgs = cliente/vendedor. O tempo conta só a partir do momento em que o lead caiu pro
              vendedor — a conversa do robô antes disso não entra. "—" = não houve troca suficiente
              pra medir.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

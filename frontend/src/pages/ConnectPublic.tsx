import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import { Smartphone, CheckCircle2, Loader2, AlertTriangle, Monitor } from 'lucide-react'

type State = { userName: string; status: string; qrCode?: string }

/**
 * Página PÚBLICA (sem login): o atendente abre o link que o admin mandou,
 * escaneia o QR e o WhatsApp dele conecta. Marca "Leads Parceria Financeira".
 */
export default function ConnectPublic() {
  const { token } = useParams<{ token: string }>()
  const [params] = useSearchParams()
  // ?s=1 → modo limpo: só o QR, sem marca/identificação nenhuma
  const clean = params.get('s') === '1'
  const [state, setState] = useState<State | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/public/connect/${token}`)
      setState(res.data.data)
      setInvalid(false)
    } catch {
      setInvalid(true)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  // Atualiza o QR / detecta conexão (QR do WhatsApp expira rápido)
  useEffect(() => {
    if (invalid || state?.status === 'CONNECTED') return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load, invalid, state?.status])

  const connected = state?.status === 'CONNECTED'

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(160deg,#0b1220 0%,#111c30 100%)' }}>
      <div className="w-full max-w-md rounded-3xl p-7 text-center shadow-2xl"
        style={{ background: '#0f1622', border: '1px solid rgba(255,255,255,.08)' }}>

        {/* Marca — escondida no modo limpo (?s=1) */}
        {clean ? (
          <h1 className="text-base font-bold text-white/90 mb-5">Conectar WhatsApp</h1>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="text-2xl">🤝</span>
              <h1 className="text-lg font-extrabold tracking-tight text-white">
                Leads <span style={{ color: '#eab308' }}>Parceria Financeira</span>
              </h1>
            </div>
            <p className="text-xs text-white/40 mb-6">Conexão de WhatsApp</p>
          </>
        )}

        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3 text-white/60">
            <Loader2 size={30} className="animate-spin" />
            <p className="text-sm">Preparando sua conexão...</p>
          </div>
        ) : invalid ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <AlertTriangle size={40} className="text-amber-400" />
            <p className="text-white font-semibold">Link inválido ou expirado</p>
            <p className="text-sm text-white/50">Peça um link novo para o administrador.</p>
          </div>
        ) : connected ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <CheckCircle2 size={56} className="text-green-400" />
            <p className="text-xl font-bold text-white">WhatsApp conectado! 🎉</p>
            <p className="text-sm text-white/60">
              {clean ? 'Tudo certo. Pode fechar esta página.' : <>Tudo certo, <b className="text-white/80">{state?.userName}</b>. Pode fechar esta página.</>}
            </p>
          </div>
        ) : (
          <>
            <p className="text-white/80 text-sm mb-4">
              {clean
                ? 'Escaneie o código abaixo para conectar seu WhatsApp.'
                : <>Olá, <b className="text-white">{state?.userName}</b>! Escaneie o código abaixo para conectar seu WhatsApp.</>}
            </p>

            {/* Aviso: precisa de outra tela pra escanear */}
            <div className="flex items-start gap-2 text-left rounded-xl p-3 mb-4"
              style={{ background: 'rgba(234,179,8,.08)', border: '1px solid rgba(234,179,8,.25)' }}>
              <Monitor size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Abra este link <b>no computador</b> e escaneie com o celular. Não dá para
                escanear pelo mesmo aparelho que está com a tela aberta.
              </p>
            </div>

            {/* QR */}
            <div className="bg-white rounded-2xl p-4 inline-block mb-5 min-h-[232px] min-w-[232px] flex items-center justify-center">
              {state?.qrCode ? (
                <img src={state.qrCode} alt="QR Code" className="w-52 h-52" />
              ) : (
                <div className="w-52 h-52 flex flex-col items-center justify-center gap-2 text-gray-400">
                  <Loader2 size={26} className="animate-spin" />
                  <span className="text-xs">Gerando código...</span>
                </div>
              )}
            </div>

            {/* Passo a passo */}
            <div className="text-left space-y-2 mb-4">
              {[
                'Abra o WhatsApp no seu celular',
                'Toque em ⋮ (ou Ajustes) → Aparelhos conectados',
                'Toque em Conectar um aparelho',
                'Aponte a câmera para o código acima',
              ].map((s, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(234,179,8,.15)', color: '#eab308' }}>{i + 1}</span>
                  <span className="text-xs text-white/70">{s}</span>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-white/35 flex items-center justify-center gap-1.5">
              <Smartphone size={11} /> O código atualiza sozinho. Mantenha esta página aberta.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

/**
 * Avisa quando saiu versão nova do CRM.
 *
 * O index.html é servido com s-maxage=86400: o CDN guarda a página por até 24h,
 * então um deploy pode simplesmente NÃO chegar no celular da equipe — foi o que
 * aconteceu, o dono testou e viu a tela antiga achando que nada tinha mudado.
 *
 * Como os arquivos têm hash no nome, comparar o hash do bundle atual com o do
 * index.html do servidor diz com precisão se a versão mudou. O `?t=` é o que
 * faz o CDN tratar como URL nova e buscar do servidor de verdade.
 *
 * Só avisa: não recarrega sozinho, porque recarregar no meio de uma mensagem
 * sendo digitada perderia o texto.
 */
export default function AtualizacaoDisponivel() {
  const [temNova, setTemNova] = useState(false)

  useEffect(() => {
    // Hash do bundle que ESTA página carregou.
    const meuBundle = [...document.querySelectorAll('script[src]')]
      .map((s) => (s as HTMLScriptElement).src)
      .find((src) => /\/assets\/index-.*\.js/.test(src))
    if (!meuBundle) return
    const meuHash = meuBundle.split('/').pop()

    let vivo = true
    const conferir = async () => {
      if (!vivo || temNova) return
      try {
        const res = await fetch(`/?t=${Date.now()}`, { cache: 'no-store' })
        const html = await res.text()
        const doServidor = html.match(/assets\/index-[^"']+\.js/)?.[0]?.split('/').pop()
        if (doServidor && meuHash && doServidor !== meuHash) setTemNova(true)
      } catch {
        /* silencioso: sem rede não é problema de versão */
      }
    }

    // Ao voltar pro app (é como se usa no celular) e a cada 15 min.
    const aoFocar = () => { if (document.visibilityState === 'visible') void conferir() }
    document.addEventListener('visibilitychange', aoFocar)
    const timer = setInterval(conferir, 15 * 60 * 1000)
    const primeiro = setTimeout(conferir, 20000)

    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', aoFocar)
      clearInterval(timer)
      clearTimeout(primeiro)
    }
  }, [temNova])

  if (!temNova) return null

  return (
    <button
      onClick={() => window.location.reload()}
      className="fixed left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 px-4 h-11 rounded-full shadow-modal text-sm font-semibold text-white active:scale-95 transition-transform"
      style={{ background: '#6366f1', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}
    >
      <RefreshCw size={15} />
      Nova versão — toque para atualizar
    </button>
  )
}

import { useState, useRef, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'

interface AudioPlayerProps {
  src: string
  /** Balão de saída (fundo roxo) usa tons claros; entrada usa as cores do tema. */
  outgoing?: boolean
  onError?: () => void
}

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/**
 * Player de áudio do chat. Substitui o <audio controls> nativo, que precisava de
 * `filter: invert(1)` no balão roxo pra ficar visível — gambiarra que destoava
 * do resto da interface.
 */
export default function AudioPlayer({ src, outgoing = false, onError }: AudioPlayerProps) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onTime = () => setCur(el.currentTime)
    const onMeta = () => setDur(el.duration)
    const onEnd = () => { setPlaying(false); setCur(0) }
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('ended', onEnd)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('ended', onEnd)
    }
  }, [])

  const toggle = () => {
    const el = ref.current
    if (!el) return
    if (el.paused) { el.play().then(() => setPlaying(true)).catch(() => onError?.()) }
    else { el.pause(); setPlaying(false) }
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el || !Number.isFinite(el.duration)) return
    const r = e.currentTarget.getBoundingClientRect()
    el.currentTime = ((e.clientX - r.left) / r.width) * el.duration
  }

  const pct = dur > 0 ? (cur / dur) * 100 : 0
  const btn = outgoing ? 'bg-white/25 text-white hover:bg-white/35' : 'bg-primary/20 text-primary-light hover:bg-primary/30'
  const track = outgoing ? 'bg-white/25' : 'bg-bg-tertiary'
  const fill = outgoing ? 'bg-white' : 'bg-primary'
  const txt = outgoing ? 'text-white/70' : 'text-text-muted'

  return (
    <div className="flex items-center gap-2.5 w-[min(240px,62vw)]">
      <audio ref={ref} src={src} preload="metadata" onError={() => onError?.()} className="hidden" />
      <button
        onClick={toggle}
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${btn}`}
        title={playing ? 'Pausar' : 'Reproduzir'}
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`h-1.5 rounded-full cursor-pointer ${track}`} onClick={seek}>
          <div className={`h-full rounded-full transition-[width] ${fill}`} style={{ width: `${pct}%` }} />
        </div>
        <p className={`text-[10px] mt-1 tabular-nums ${txt}`}>
          {fmt(cur)} {dur > 0 && `/ ${fmt(dur)}`}
        </p>
      </div>
    </div>
  )
}

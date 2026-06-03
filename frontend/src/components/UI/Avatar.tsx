interface AvatarProps {
  src?: string | null
  name?: string | null
  size?: number
  className?: string
}

const GRADIENTS = [
  'linear-gradient(135deg,#6366f1,#7c3aed)',
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#f59e0b,#d97706)',
  'linear-gradient(135deg,#ef4444,#b91c1c)',
  'linear-gradient(135deg,#3b82f6,#1d4ed8)',
  'linear-gradient(135deg,#ec4899,#be185d)',
]

export default function Avatar({ src, name, size = 40, className = '' }: AvatarProps) {
  const initial = (name || '?').charAt(0).toUpperCase()
  if (src) {
    return (
      <img
        src={src}
        alt={name || ''}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  // Cor estável baseada no nome
  const idx = (name || '?').charCodeAt(0) % GRADIENTS.length
  return (
    <div
      className={`rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold ${className}`}
      style={{ width: size, height: size, background: GRADIENTS[idx], fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  )
}

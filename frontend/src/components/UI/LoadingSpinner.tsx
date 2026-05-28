interface Props {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function LoadingSpinner({ size = 'md', className = '' }: Props) {
  const s = { sm: 'w-4 h-4 border-2', md: 'w-8 h-8 border-2', lg: 'w-12 h-12 border-[3px]' }[size]
  return (
    <div
      className={`${s} ${className} rounded-full animate-spin`}
      style={{ borderColor: '#1e2d4a', borderTopColor: '#6366f1' }}
    />
  )
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-64">
      <div className="flex flex-col items-center gap-4">
        {/* Logo animada */}
        <div className="relative">
          <div
            className="w-14 h-14 rounded-full animate-spin"
            style={{
              background: 'conic-gradient(from 0deg, transparent 0%, #6366f1 100%)',
              padding: '3px',
            }}
          >
            <div className="w-full h-full rounded-full" style={{ background: '#080d17' }} />
          </div>
          <div
            className="absolute inset-0 rounded-full animate-pulse"
            style={{ boxShadow: '0 0 20px rgba(99,102,241,0.4)' }}
          />
        </div>
        <p className="text-text-muted text-sm font-medium">Carregando...</p>
      </div>
    </div>
  )
}

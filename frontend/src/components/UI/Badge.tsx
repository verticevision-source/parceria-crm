import React from 'react'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'gold'
  size?: 'sm' | 'md'
}

const variants: Record<string, string> = {
  default: 'bg-primary-muted text-primary-light border border-primary/20',
  success: 'bg-success-muted text-success   border border-success/20',
  warning: 'bg-warning-muted text-warning   border border-warning/20',
  danger:  'bg-danger-muted  text-danger    border border-danger/20',
  info:    'bg-blue-500/10   text-blue-400  border border-blue-500/20',
  muted:   'bg-bg-hover      text-text-muted border border-border',
  gold:    'bg-gold-muted    text-gold-light border border-gold/25',
}

export default function Badge({ children, variant = 'default', size = 'sm' }: BadgeProps) {
  return (
    <span className={`badge ${variants[variant]} ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    OPEN:         { label: 'Aberta',          variant: 'success' },
    PENDING:      { label: 'Pendente',        variant: 'warning' },
    CLOSED:       { label: 'Fechada',         variant: 'muted'   },
    CONNECTED:    { label: 'Conectado',       variant: 'success' },
    DISCONNECTED: { label: 'Desconectado',    variant: 'muted'   },
    WAITING_QR:   { label: 'Aguardando QR',   variant: 'warning' },
    ERROR:        { label: 'Erro',            variant: 'danger'  },
    WON:          { label: 'Ganho',           variant: 'gold'    },
    LOST:         { label: 'Perdido',         variant: 'danger'  },
    ADMIN:        { label: 'Administrador',   variant: 'gold'    },
    USER:         { label: 'Atendente',       variant: 'info'    },
  }
  const config = map[status] || { label: status, variant: 'muted' as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

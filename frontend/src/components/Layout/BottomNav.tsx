import { NavLink } from 'react-router-dom'
import { MessageSquare, Briefcase, UserCircle, Wallet, Menu } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

/**
 * Navegação de baixo, só no celular.
 *
 * O menu ficava num botão de 34px a 11px do topo de uma tela de 812px —
 * inalcançável com o polegar de quem segura o celular com uma mão, que é como a
 * equipe usa em campo. Aqui embaixo fica na zona do polegar, e cada alvo tem
 * 56px de altura (o mínimo confortável é ~44px).
 *
 * Respeita a barra de gestos do iPhone com env(safe-area-inset-bottom), senão o
 * último item fica por baixo dela e não recebe o toque.
 */
export default function BottomNav({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const { isGerente } = useAuth()

  const itens = isGerente
    ? [
        { to: '/attendance', icon: MessageSquare, label: 'Conversas' },
        { to: '/carteira', icon: Wallet, label: 'Carteira' },
        { to: '/contacts', icon: UserCircle, label: 'Contatos' },
      ]
    : [
        { to: '/attendance', icon: MessageSquare, label: 'Conversas' },
        { to: '/crm', icon: Briefcase, label: 'CRM' },
        { to: '/contacts', icon: UserCircle, label: 'Contatos' },
      ]

  return (
    <nav
      className="md:hidden flex-shrink-0 border-t flex items-stretch"
      style={{
        background: '#0a0f1e',
        borderColor: '#1e2d4a',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {itens.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 h-14 transition-colors ${
              isActive ? 'text-primary' : 'text-text-muted'
            }`
          }
        >
          <Icon size={21} />
          <span className="text-[10px] font-medium">{label}</span>
        </NavLink>
      ))}
      <button
        onClick={onAbrirMenu}
        aria-label="Abrir menu"
        className="flex-1 flex flex-col items-center justify-center gap-0.5 h-14 text-text-muted active:text-text-primary transition-colors"
      >
        <Menu size={21} />
        <span className="text-[10px] font-medium">Menu</span>
      </button>
    </nav>
  )
}

import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, Users, UserCircle,
  Settings, Smartphone, Briefcase, LogOut, Shield, Shuffle, Layers, Send
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import Logo from '../Logo'

const navItems = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/attendance', icon: MessageSquare,   label: 'Atendimento' },
  { to: '/crm',        icon: Briefcase,       label: 'CRM' },
  { to: '/crm-boards', icon: Layers,          label: 'CRM Boards' },
  { to: '/contacts',   icon: UserCircle,      label: 'Contatos' },
  { to: '/roulette',   icon: Shuffle,         label: 'Roleta' },
  { to: '/whatsapp',   icon: Smartphone,      label: 'WhatsApp' },
]

const adminItems = [
  { to: '/bulk-messages',  icon: Send,       label: 'Envio em Massa' },
  { to: '/admin/whatsapp', icon: Smartphone, label: 'Gerenciar Números' },
  { to: '/users',          icon: Users,      label: 'Usuários' },
]

export default function Sidebar() {
  const { user, logout, isAdmin } = useAuth()

  return (
    <aside
      className="w-64 min-h-screen flex flex-col flex-shrink-0"
      style={{
        background: 'linear-gradient(180deg, #0a0f1e 0%, #080d17 100%)',
        borderRight: '1px solid #1e2d4a',
      }}
    >
      {/* ── Logo / Brand ── */}
      <div className="px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <Logo size={44} />
            {/* Status glow */}
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-bg-primary" />
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight" style={{
              background: 'linear-gradient(135deg, #F5D06B 0%, #C9952A 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Parceria CRM
            </h1>
            <p className="text-text-muted text-xs mt-0.5">
              {isAdmin ? (
                <span className="flex items-center gap-1">
                  <Shield size={10} className="text-gold" />
                  Administrador
                </span>
              ) : 'Atendente'}
            </p>
          </div>
        </div>

        {/* Linha dourada decorativa */}
        <div className="glow-divider-gold mt-5" />
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <Icon size={17} />
            <span className="text-sm font-medium">{label}</span>
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="pt-5 pb-2 px-4">
              <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest">
                Admin
              </p>
            </div>
            {adminItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={17} />
                <span className="text-sm font-medium">{label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* ── Footer ── */}
      <div className="px-3 pb-4 space-y-1">
        <div className="glow-divider mb-3" />

        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <Settings size={17} />
          <span className="text-sm font-medium">Configurações</span>
        </NavLink>

        {/* User info */}
        <div className="flex items-center gap-3 px-3 py-3 mt-1 rounded-xl"
          style={{ background: 'rgba(15,22,34,0.6)', border: '1px solid #1e2d4a' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)' }}>
            <span className="text-white text-xs font-bold">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-text-primary text-xs font-semibold truncate">{user?.name}</p>
            <p className="text-text-muted text-[10px] truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="text-text-muted hover:text-danger transition-colors p-1 rounded-lg hover:bg-danger/10"
            title="Sair"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  )
}

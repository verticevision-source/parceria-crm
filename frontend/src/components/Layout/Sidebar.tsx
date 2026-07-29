import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, Users, UserCircle,
  Settings, Smartphone, Briefcase, LogOut, Shield, Shuffle, Layers, Send, X, BarChart3, MessagesSquare, Workflow, Eye, FileText, Search, ShieldAlert, UserX
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { conversationsApi } from '../../services/api'
import { getSocket } from '../../services/socket'
import Logo from '../Logo'
import Avatar from '../UI/Avatar'

const navItems = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/attendance', icon: MessageSquare,   label: 'Atendimento' },
  { to: '/crm',        icon: Briefcase,       label: 'CRM' },
  { to: '/contacts',   icon: UserCircle,      label: 'Contatos' },
  { to: '/search',     icon: Search,          label: 'Busca' },
  { to: '/roulette',   icon: Shuffle,         label: 'Roleta' },
  { to: '/team-chat',  icon: MessagesSquare,  label: 'Chat Interno' },
]

// Admin dividido em 2 blocos: os 10 itens numa lista corrida viravam uma parede
// de links de peso igual (e estouravam com scroll em telas baixas).
const adminGroups = [
  {
    title: 'Operação',
    items: [
      { to: '/admin/sellers',  icon: ShieldAlert, label: 'Central de Vendedores' },
      { to: '/leads-desqualificados', icon: UserX, label: 'Leads Desqualificados' },
      { to: '/monitor',        icon: Eye,        label: 'Monitor ao Vivo' },
      { to: '/reports',        icon: BarChart3,  label: 'Relatórios' },
    ],
  },
  {
    title: 'Configuração',
    items: [
      { to: '/flows',          icon: Workflow,   label: 'Robô / Fluxos' },
      { to: '/crm-boards',     icon: Layers,     label: 'CRM Boards' },
      { to: '/bulk-messages',  icon: Send,       label: 'Envio em Massa' },
      { to: '/templates',      icon: FileText,   label: 'Modelos' },
      { to: '/admin/whatsapp', icon: Smartphone, label: 'Gerenciar Números' },
      { to: '/users',          icon: Users,      label: 'Usuários' },
    ],
  },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout, isAdmin } = useAuth()
  const [unread, setUnread] = useState(0)

  // Total de não-lidas pro badge do Atendimento. Atualiza no socket (imediato)
  // e num intervalo folgado (rede de segurança se o socket cair).
  useEffect(() => {
    let alive = true
    const load = () => {
      conversationsApi.findAll()
        .then((r) => {
          if (!alive) return
          const total = (r.data.data || []).reduce((s: number, c: any) => s + (c.unreadCount || 0), 0)
          setUnread(total)
        })
        .catch(() => { /* silencioso: badge não pode quebrar a navegação */ })
    }
    load()
    const socket = getSocket()
    socket.on('new-message', load)
    const timer = setInterval(load, 60000)
    return () => {
      alive = false
      socket.off('new-message', load)
      clearInterval(timer)
    }
  }, [])

  return (
    <>
      {/* Backdrop (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50 w-64 h-screen flex flex-col flex-shrink-0
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        `}
        style={{
          background: 'linear-gradient(180deg, #0a0f1e 0%, #080d17 100%)',
          borderRight: '1px solid #1e2d4a',
        }}
      >
        {/* ── Logo / Brand ── */}
        <div className="px-5 py-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <Logo size={44} />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-bg-primary" />
            </div>
            <div className="flex-1 min-w-0">
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
            {/* Fechar (mobile) */}
            <button
              onClick={onClose}
              className="md:hidden text-text-muted hover:text-text-primary p-1"
            >
              <X size={20} />
            </button>
          </div>

          <div className="glow-divider-gold mt-5" />
        </div>

        {/* ── Nav (scrollável) ── */}
        <nav className="flex-1 overflow-y-auto px-3 space-y-1 min-h-0">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={17} />
              <span className="text-sm font-medium">{label}</span>
              {/* Não-lidas: o sinal mais importante pra quem vive no CRM */}
              {to === '/attendance' && unread > 0 && (
                <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </NavLink>
          ))}

          {isAdmin && adminGroups.map((group) => (
            <div key={group.title}>
              <div className="pt-5 pb-2 px-4">
                <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest">
                  {group.title}
                </p>
              </div>
              {group.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active-gold' : ''}`}
                >
                  <Icon size={17} />
                  <span className="text-sm font-medium">{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* ── Footer ── */}
        <div className="px-3 pb-4 space-y-1 flex-shrink-0">
          <div className="glow-divider mb-3" />

          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <Settings size={17} />
            <span className="text-sm font-medium">Configurações</span>
          </NavLink>

          <div className="flex items-center gap-3 px-3 py-3 mt-1 rounded-xl"
            style={{ background: 'rgba(15,22,34,0.6)', border: '1px solid #1e2d4a' }}>
            <Avatar src={user?.avatarUrl} name={user?.name} size={32} />
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
    </>
  )
}

import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import Logo from '../Logo'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#080d17' }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar mobile (hamburger) */}
        <header
          className="md:hidden flex items-center gap-3 px-4 h-14 flex-shrink-0 border-b"
          style={{ background: '#0a0f1e', borderColor: '#1e2d4a' }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-text-secondary hover:text-text-primary p-1.5 rounded-lg hover:bg-bg-hover"
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <Logo size={28} />
            <span className="font-bold text-sm" style={{
              background: 'linear-gradient(135deg, #F5D06B 0%, #C9952A 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Parceria CRM
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-auto" style={{ background: '#080d17' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

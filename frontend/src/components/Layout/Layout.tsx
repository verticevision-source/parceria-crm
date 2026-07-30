import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import AtualizacaoDisponivel from '../AtualizacaoDisponivel'
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
          {/* 44x44 é o alvo mínimo confortável de toque; antes eram 34px e
              errar o botão no celular era comum. */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-hover flex items-center justify-center w-11 h-11 -ml-1.5"
            aria-label="Abrir menu"
          >
            <Menu size={24} />
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

        <main className="flex-1 overflow-auto min-h-0" style={{ background: '#080d17' }}>
          <Outlet />
        </main>

        {/* Navegação na zona do polegar. O menu no topo é inalcançável de uma mão. */}
        <BottomNav onAbrirMenu={() => setSidebarOpen(true)} />
      </div>

      {/* O CDN guarda o index.html por 24h: sem este aviso, um deploy pode não
          chegar no celular da equipe e todo mundo trabalha na versão velha. */}
      <AtualizacaoDisponivel />
    </div>
  )
}

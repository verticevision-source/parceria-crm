import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#080d17' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto" style={{ background: '#080d17' }}>
        <Outlet />
      </main>
    </div>
  )
}

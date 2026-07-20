import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout/Layout'
import Login from './pages/Login'
import ConnectPublic from './pages/ConnectPublic'
import Dashboard from './pages/Dashboard'
import Attendance from './pages/Attendance'
import CRM from './pages/CRM'
import Contacts from './pages/Contacts'
import Users from './pages/Users'
import WhatsAppConfig from './pages/WhatsAppConfig'
import AdminWhatsApp from './pages/AdminWhatsApp'
import AdminSellers from './pages/AdminSellers'
import Roulette from './pages/Roulette'
import CRMBoards from './pages/CRMBoards'
import BulkMessage from './pages/BulkMessage'
import Reports from './pages/Reports'
import InternalChat from './pages/InternalChat'
import FlowBuilder from './pages/FlowBuilder'
import Monitor from './pages/Monitor'
import Templates from './pages/Templates'
import Settings from './pages/Settings'
import Search from './pages/Search'
import { PageLoader } from './components/UI/LoadingSpinner'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <PageLoader />

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <Login />}
      />

      {/* Público: link de conexão de WhatsApp (sem login) */}
      <Route path="/conectar/:token" element={<ConnectPublic />} />

      <Route
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/crm" element={<CRM />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/search" element={<Search />} />
        <Route path="/whatsapp" element={<WhatsAppConfig />} />
        <Route path="/roulette" element={<Roulette />} />
        <Route path="/team-chat" element={<InternalChat />} />
        <Route path="/crm-boards" element={<CRMBoards />} />
        <Route path="/settings" element={<Settings />} />

        <Route
          path="/bulk-messages"
          element={
            <AdminRoute>
              <BulkMessage />
            </AdminRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <AdminRoute>
              <Reports />
            </AdminRoute>
          }
        />

        <Route
          path="/flows"
          element={
            <AdminRoute>
              <FlowBuilder />
            </AdminRoute>
          }
        />

        <Route
          path="/monitor"
          element={
            <AdminRoute>
              <Monitor />
            </AdminRoute>
          }
        />

        <Route
          path="/templates"
          element={
            <AdminRoute>
              <Templates />
            </AdminRoute>
          }
        />

        <Route
          path="/users"
          element={
            <AdminRoute>
              <Users />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/whatsapp"
          element={
            <AdminRoute>
              <AdminWhatsApp />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/sellers"
          element={
            <AdminRoute>
              <AdminSellers />
            </AdminRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../components/Logo'
import toast from 'react-hot-toast'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || !password) { toast.error('Preencha todos os campos'); return }
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Credenciais inválidas'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#080d17' }}>

      {/* ── Painel esquerdo decorativo ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-1/2 p-16 relative overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #0a1628 0%, #0d1f3c 60%, #080d17 100%)',
          borderRight: '1px solid #1e2d4a',
        }}
      >
        {/* Orbs de fundo */}
        <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(201,149,42,0.1) 0%, transparent 70%)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)' }} />

        {/* Logo grande */}
        <div className="flex items-center gap-4">
          <Logo size={52} />
          <div>
            <h1 className="text-2xl font-extrabold" style={{
              background: 'linear-gradient(135deg, #F5D06B 0%, #C9952A 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Parceria CRM
            </h1>
            <p className="text-text-muted text-sm">Plataforma de Atendimento</p>
          </div>
        </div>

        {/* Texto central */}
        <div>
          <h2 className="text-4xl font-extrabold text-text-primary leading-tight mb-4">
            Atendimento{' '}
            <span style={{
              background: 'linear-gradient(135deg, #6366f1, #818cf8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              inteligente
            </span>
            {' '}com CRM integrado
          </h2>
          <p className="text-text-secondary text-lg leading-relaxed">
            Gerencie conversas do WhatsApp, acompanhe leads e feche mais negócios em um único lugar.
          </p>

          {/* Features */}
          <div className="mt-10 space-y-3">
            {[
              'Histórico permanente de conversas',
              'CRM Kanban em tempo real',
              'Integração modular com WhatsApp',
            ].map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(201,149,42,0.2)', border: '1px solid rgba(201,149,42,0.4)' }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: '#C9952A' }} />
                </div>
                <span className="text-text-secondary text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-text-muted text-xs">© 2025 Parceria CRM. Todos os direitos reservados.</p>
      </div>

      {/* ── Painel direito — formulário ── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-slide-up">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-10 justify-center">
            <Logo size={48} />
            <h1 className="text-2xl font-extrabold" style={{
              background: 'linear-gradient(135deg, #F5D06B 0%, #C9952A 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>Parceria CRM</h1>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-extrabold text-text-primary">Bem-vindo de volta</h2>
            <p className="text-text-muted mt-2">Entre na sua conta para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="input-field"
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Senha</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field pr-12"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3.5 mt-2 flex items-center justify-center gap-2 text-base"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Entrar
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

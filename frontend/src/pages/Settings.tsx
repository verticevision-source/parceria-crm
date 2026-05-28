import { useState } from 'react'
import { User, Lock, Save, Shield } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { usersApi } from '../services/api'
import Logo from '../components/Logo'
import toast from 'react-hot-toast'

export default function Settings() {
  const { user } = useAuth()
  const [profileForm, setProfileForm] = useState({ name: user?.name || '', email: user?.email || '' })
  const [passForm,    setPassForm]    = useState({ password: '', confirm: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPass,    setSavingPass]    = useState(false)

  const saveProfile = async () => {
    if (!profileForm.name || !profileForm.email) { toast.error('Nome e e-mail são obrigatórios'); return }
    setSavingProfile(true)
    try {
      await usersApi.update(user!.id, { name: profileForm.name, email: profileForm.email })
      toast.success('Perfil atualizado! Faça login novamente para aplicar.')
    } catch { toast.error('Erro ao atualizar perfil') }
    finally { setSavingProfile(false) }
  }

  const savePassword = async () => {
    if (!passForm.password || !passForm.confirm) { toast.error('Preencha todos os campos'); return }
    if (passForm.password.length < 6) { toast.error('Senha deve ter ao menos 6 caracteres'); return }
    if (passForm.password !== passForm.confirm) { toast.error('As senhas não coincidem'); return }
    setSavingPass(true)
    try {
      await usersApi.update(user!.id, { password: passForm.password })
      toast.success('Senha alterada com sucesso!')
      setPassForm({ password: '', confirm: '' })
    } catch { toast.error('Erro ao alterar senha') }
    finally { setSavingPass(false) }
  }

  return (
    <div className="p-8 max-w-xl animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-text-primary tracking-tight">Configurações</h1>
        <p className="text-text-muted text-sm mt-1">Gerencie seu perfil e segurança</p>
      </div>

      {/* Avatar card */}
      <div className="rounded-2xl p-6 mb-6 flex items-center gap-5 border"
        style={{ background: 'linear-gradient(135deg, #0f1622 0%, #111827 100%)', borderColor: '#1e2d4a' }}>
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)' }}>
            <span className="text-white text-3xl font-extrabold">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="absolute -bottom-1 -right-1">
            <Logo size={28} />
          </div>
        </div>
        <div>
          <h2 className="text-text-primary font-bold text-xl">{user?.name}</h2>
          <p className="text-text-muted text-sm">{user?.email}</p>
          <div className="flex items-center gap-1.5 mt-2">
            {user?.role === 'ADMIN' && <Shield size={12} className="text-gold" />}
            <span className={`badge text-xs ${
              user?.role === 'ADMIN'
                ? 'bg-gold-muted text-gold-light border border-gold/25'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            }`}>
              {user?.role === 'ADMIN' ? 'Administrador' : 'Atendente'}
            </span>
          </div>
        </div>
      </div>

      {/* Perfil */}
      <div className="card mb-5">
        <div className="flex items-center gap-2 mb-5">
          <User size={18} className="text-primary-light" />
          <h3 className="text-text-primary font-bold">Meu Perfil</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Nome</label>
            <input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">E-mail</label>
            <input type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} className="input-field" />
          </div>
          <button onClick={saveProfile} disabled={savingProfile} className="btn-primary flex items-center gap-2 text-sm">
            <Save size={15} />
            {savingProfile ? 'Salvando...' : 'Salvar Perfil'}
          </button>
        </div>
      </div>

      {/* Senha */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Lock size={18} className="text-primary-light" />
          <h3 className="text-text-primary font-bold">Alterar Senha</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Nova Senha</label>
            <input type="password" value={passForm.password} onChange={(e) => setPassForm({ ...passForm, password: e.target.value })} placeholder="Mínimo 6 caracteres" className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Confirmar Senha</label>
            <input type="password" value={passForm.confirm} onChange={(e) => setPassForm({ ...passForm, confirm: e.target.value })} placeholder="Repita a nova senha" className="input-field" />
          </div>
          <button onClick={savePassword} disabled={savingPass} className="btn-primary flex items-center gap-2 text-sm">
            <Lock size={15} />
            {savingPass ? 'Alterando...' : 'Alterar Senha'}
          </button>
        </div>
      </div>
    </div>
  )
}

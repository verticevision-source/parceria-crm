import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { AuthUser } from '../types'
import { authApi } from '../services/api'
import { connectSocket, disconnectSocket } from '../services/socket'

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    setToken(null)
    disconnectSocket()
  }, [])

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')

    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser) as AuthUser
        setToken(storedToken)
        setUser(parsedUser)
        connectSocket(parsedUser.id)
        // Revalida no servidor (pega aiEnabled, mudanças de role, etc.)
        authApi.me()
          .then((r) => {
            const fresh = r.data.data as AuthUser
            setUser(fresh)
            localStorage.setItem('user', JSON.stringify(fresh))
          })
          .catch(() => {})
      } catch {
        logout()
      }
    }
    setIsLoading(false)
  }, [logout])

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password)
    const { token: newToken, user: newUser } = response.data.data

    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
    connectSocket(newUser.id)
    // Força reload do token no axios
    window.dispatchEvent(new Event('storage'))
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        isAdmin: user?.role === 'ADMIN',
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

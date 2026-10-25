import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { api, apiErrorMessage } from '../api/client'
import type { User } from '../types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (payload: { name: string; email: string; password: string; role: string; department?: string }) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem('user')
      return raw ? (JSON.parse(raw) as User) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState<boolean>(() => Boolean(localStorage.getItem('token')))

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }
    api
      .get<User>('/auth/me')
      .then((res) => {
        setUser(res.data)
        localStorage.setItem('user', JSON.stringify(res.data))
      })
      .catch(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await api.post('/auth/login', { email, password })
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      setUser(res.data.user)
    } catch (e) {
      throw new Error(apiErrorMessage(e, 'Login failed'))
    }
  }, [])

  const register = useCallback(
    async (payload: { name: string; email: string; password: string; role: string; department?: string }) => {
      try {
        await api.post('/auth/register', payload)
      } catch (e) {
        throw new Error(apiErrorMessage(e, 'Registration failed'))
      }
    },
    []
  )

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

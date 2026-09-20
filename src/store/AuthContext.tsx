import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import {
  clearTokens,
  clearUser,
  getStoredUser,
  getTokens,
  saveTokens,
  saveUser,
  type StoredUser,
} from '../lib/auth-storage'

interface AuthContextValue {
  user: StoredUser | null
  loading: boolean
  // auth
  sendSms: (phone: string) => Promise<{ devCode?: string; error?: string }>
  login: (phone: string, code: string) => Promise<{ error?: string }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(() => getStoredUser())
  const [loading, setLoading] = useState(true)

  // 应用启动时验证 token 是否有效
  useEffect(() => {
    const { accessToken } = getTokens()
    if (!accessToken) {
      setLoading(false)
      return
    }
    // 静默获取 profile 验证 token
    api.get<StoredUser>('/api/profile').then((res) => {
      if (res.code === 'OK' && res.data) {
        setUser(res.data)
        saveUser(res.data)
      } else {
        clearTokens()
        clearUser()
        setUser(null)
      }
      setLoading(false)
    })

    // 监听 token 过期事件
    const onExpired = () => {
      clearTokens()
      clearUser()
      setUser(null)
    }
    window.addEventListener('themory-auth-expired', onExpired)
    return () => window.removeEventListener('themory-auth-expired', onExpired)
  }, [])

  const sendSms = useCallback(async (phone: string) => {
    const res = await api.post<{ devCode?: string }>('/api/auth/sms/send', { phone })
    if (res.code === 'OK') {
      return { devCode: res.data?.devCode }
    }
    return { error: res.message || '发送失败' }
  }, [])

  const login = useCallback(async (phone: string, code: string) => {
    const res = await api.post<{ accessToken: string; refreshToken: string; user: StoredUser }>(
      '/api/auth/sms/login',
      { phone, code },
    )
    if (res.code === 'OK' && res.data) {
      saveTokens(res.data.accessToken, res.data.refreshToken)
      saveUser(res.data.user)
      setUser(res.data.user)
      return {}
    }
    return { error: res.message || '登录失败' }
  }, [])

  const logout = useCallback(async () => {
    const { refreshToken } = getTokens()
    if (refreshToken) {
      try {
        await api.post('/api/auth/logout', { refreshToken })
      } catch {
        /* ignore */
      }
    }
    clearTokens()
    clearUser()
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const res = await api.get<StoredUser>('/api/profile')
    if (res.code === 'OK' && res.data) {
      setUser(res.data)
      saveUser(res.data)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, sendSms, login, logout, refreshUser }),
    [user, loading, sendSms, login, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}

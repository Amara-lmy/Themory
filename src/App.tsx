import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LibraryProvider } from './store/LibraryContext'
import { DragProvider } from './store/DragContext'
import { ToastProvider } from './store/ToastContext'
import { AuthProvider, useAuth } from './store/AuthContext'
import { SettingsProvider } from './store/SettingsContext'
import { saveTokens } from './lib/auth-storage'
import { LibraryPage } from './pages/LibraryPage'
import { ReaderPage } from './pages/ReaderPage'
import { LoginPage } from './pages/LoginPage'

/**
 * 微信扫码登录回调承接：
 * 后端重定向回 /auth/wechat/callback?accessToken=..&refreshToken=..（非 hash 路由），
 * 落地后保存 token 并回到首页，由 AuthProvider 校验登录态。
 */
function WechatCallbackHandler() {
  useEffect(() => {
    if (window.location.pathname !== '/auth/wechat/callback') return
    const params = new URLSearchParams(window.location.search)
    const accessToken = params.get('accessToken')
    const refreshToken = params.get('refreshToken')
    if (accessToken && refreshToken) {
      saveTokens(accessToken, refreshToken)
      window.location.replace(window.location.origin + '/')
    }
  }, [])
  return null
}

/** 需要登录的路由守卫 */
function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: 14,
      }}>
        加载中…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <WechatCallbackHandler />
      <SettingsProvider>
        <LibraryProvider>
          <DragProvider>
            <ToastProvider>
              <HashRouter>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/" element={
                    <ProtectedRoute><LibraryPage /></ProtectedRoute>
                  } />
                  <Route path="/reader/:paperId" element={
                    <ProtectedRoute><ReaderPage /></ProtectedRoute>
                  } />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </HashRouter>
            </ToastProvider>
          </DragProvider>
        </LibraryProvider>
      </SettingsProvider>
    </AuthProvider>
  )
}

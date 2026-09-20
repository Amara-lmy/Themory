import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Smartphone, MessageCircle, ArrowRight, Sparkles } from 'lucide-react'
import { useAuth } from '../store/AuthContext'
import { api } from '../lib/api'

export function LoginPage() {
  const { sendSms, login, user } = useAuth()
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState('')
  const [devCode, setDevCode] = useState('')
  const [wechatUrl, setWechatUrl] = useState('')
  const timerRef = useRef<number | null>(null)

  // 已登录直接跳首页
  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  // 探测微信扫码登录是否可用（后端未配置时隐藏入口）
  useEffect(() => {
    api
      .get<{ configured: boolean; url?: string }>('/api/auth/wechat/url')
      .then((res) => {
        if (res.code === 'OK' && res.data?.configured && res.data.url) {
          setWechatUrl(res.data.url)
        }
      })
      .catch(() => {})
  }, [])

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return
    timerRef.current = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [countdown])

  const phoneValid = /^\d{10,11}$/.test(phone)
  const codeValid = /^\d{6}$/.test(code)

  const handleSendCode = async () => {
    if (!phoneValid || sending || countdown > 0) return
    setSending(true)
    setError('')
    setDevCode('')
    const result = await sendSms(phone)
    setSending(false)
    if (result.error) {
      setError(result.error)
    } else {
      setCountdown(10) // 开发环境 10 秒倒计时
      if (result.devCode) {
        setDevCode(result.devCode)
        setCode(result.devCode) // 自动填入 000000
      }
    }
  }

  const handleLogin = async () => {
    if (!phoneValid || !codeValid || loggingIn) return
    setLoggingIn(true)
    setError('')
    const result = await login(phone, code)
    setLoggingIn(false)
    if (result.error) setError(result.error)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* 品牌区 */}
        <div className="login-brand">
          <div className="login-slogan">
            <Sparkles size={12} className="login-slogan-icon" />
            <span>雕刻你的学术记忆</span>
          </div>
          <div className="login-logo">研</div>
          <div className="login-title">研忆 · THEMORY</div>
          <div className="login-subtitle">RESEARCH MEMORY</div>
        </div>

        {/* 已删除 "欢迎回来" */}
        <p className="login-desc">使用手机号 + 验证码登录</p>

        <div className="login-form">
          {/* 手机号 */}
          <div className="login-field">
            <Smartphone size={16} className="login-field-icon" />
            <input
              type="tel"
              className="login-input"
              placeholder="请输入 10-11 位手机号"
              value={phone}
              maxLength={11}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendCode()
              }}
            />
          </div>

          {/* 验证码 */}
          <div className="login-field">
            <MessageCircle size={16} className="login-field-icon" />
            <input
              type="text"
              className="login-input"
              placeholder="6 位验证码（开发模式：000000）"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLogin()
              }}
            />
            <button
              type="button"
              className={`login-sms-btn ${!phoneValid || countdown > 0 || sending ? 'disabled' : ''}`}
              onClick={handleSendCode}
              disabled={!phoneValid || countdown > 0 || sending}
            >
              {sending ? (
                <Loader2 size={14} className="spin" />
              ) : countdown > 0 ? (
                `${countdown}s 后重试`
              ) : (
                '获取验证码'
              )}
            </button>
          </div>

          {devCode && (
            <div className="login-dev-tip">
              <span className="login-dev-label">开发模式验证码</span>
              <span className="login-dev-code">{devCode}</span>
            </div>
          )}

          {error && <div className="login-error">{error}</div>}

          <button
            type="button"
            className={`login-submit ${!phoneValid || !codeValid || loggingIn ? 'disabled' : ''}`}
            onClick={handleLogin}
            disabled={!phoneValid || !codeValid || loggingIn}
          >
            {loggingIn ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <>
                <span>登录 / 注册</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {wechatUrl && (
            <>
              <div className="login-divider"><span>或</span></div>
              <a className="login-wechat-btn" href={wechatUrl}>
                <MessageCircle size={16} />
                <span>微信扫码登录</span>
              </a>
            </>
          )}

          <p className="login-tip">
            开发模式：任意 10-11 位手机号 + 验证码 <strong>000000</strong>
          </p>
        </div>
      </div>
    </div>
  )
}

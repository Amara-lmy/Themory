import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import type { CitationStyle } from '../lib/citation'

/**
 * 用户偏好设置（本地持久化，按登录账号隔离）
 * MVP 阶段存 localStorage：即时生效、无需改库表；后续可平滑迁移到服务端。
 */
export interface AppSettings {
  /** 默认引文格式 */
  citationStyle: CitationStyle
  /** 论文区划词翻译浮卡 */
  translateEnabled: boolean
  /** 打开论文时恢复上次阅读位置 */
  rememberPosition: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  citationStyle: 'apa7',
  translateEnabled: true,
  rememberPosition: true,
}

interface SettingsContextValue {
  settings: AppSettings
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

function storageKey(userId: string | undefined): string {
  return `themory-settings-${userId || 'anon'}`
}

function loadSettings(userId: string | undefined): AppSettings {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings(user?.id))

  // 切换账号时加载对应设置
  const [boundUser, setBoundUser] = useState(user?.id)
  if (user?.id !== boundUser) {
    setBoundUser(user?.id)
    setSettings(loadSettings(user?.id))
  }

  const updateSetting = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value }
        try {
          localStorage.setItem(storageKey(user?.id), JSON.stringify(next))
        } catch {
          /* 隐私模式等场景忽略写入失败 */
        }
        return next
      })
    },
    [user?.id],
  )

  const value = useMemo(() => ({ settings, updateSetting }), [settings, updateSetting])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings 必须在 SettingsProvider 内使用')
  return ctx
}

import { useEffect, useRef, useState } from 'react'
import { Pencil, Settings, LogOut, Sparkles } from 'lucide-react'
import { Popover } from './ui/Popover'
import { SettingsDialog } from './dialogs/SettingsDialog'
import { useLibrary } from '../store/LibraryContext'
import { useAuth } from '../store/AuthContext'
import { useToast } from '../store/ToastContext'
import { LEVELS } from '../types'
import { getLevelInfo } from '../lib/utils'

interface ProfileMenuProps {
  x: number
  y: number
  onClose: () => void
}

/** 头像悬浮窗：用户信息 / 研究等级 / 积分 / 设置 / 退出 */
export function ProfileMenu({ x, y, onClose }: ProfileMenuProps) {
  const { profile, updateProfileName } = useLibrary()
  const { user, logout } = useAuth()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState(profile.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const { current, next, progress } = getLevelInfo(profile.points, LEVELS)

  const commitName = () => {
    updateProfileName(draft)
    setDraft(draft.trim() || profile.name)
    setEditing(false)
    toast('昵称已更新', 'success')
  }

  return (
    <>
      <Popover x={x} y={y} onClose={onClose} className="profile-menu">
        <div className="pm-head">
          <div className="avatar avatar-lg">{profile.name.slice(0, 1)}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            {editing ? (
              <input
                ref={inputRef}
                className="input"
                value={draft}
                maxLength={20}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName()
                  if (e.key === 'Escape') {
                    setDraft(profile.name)
                    setEditing(false)
                  }
                }}
              />
            ) : (
              <div className="pm-name">
                <span>{profile.name}</span>
                <button
                  className="btn-icon"
                  style={{ width: 22, height: 22 }}
                  title="编辑昵称"
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={11} />
                </button>
              </div>
            )}
            <div className="pm-sub">{user?.phone ? `账号 ${user.phone}` : '微信账号'}</div>
            <div className="pm-level-badge">
              <Sparkles size={11} />
              Lv.{current.level} {current.name}
            </div>
          </div>
        </div>

        <div className="pm-points">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="pm-points-num">{profile.points}</span>
            <span className="t-meta">研究积分</span>
          </div>
          <div className="pm-progress">
            <div className="pm-progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <div className="pm-progress-text">
            {next
              ? `距离 Lv.${next.level} ${next.name} 还需 ${next.min - profile.points} 积分`
              : '已达到最高研究等级'}
          </div>
        </div>

        <div className="pm-rows">
          <button
            className="pm-row"
            onClick={() => {
              setDraft(profile.name)
              setEditing(true)
            }}
          >
            <span className="pm-row-icon">
              <Pencil size={14} />
            </span>
            编辑昵称
          </button>
          <button
            className="pm-row"
            onClick={() => {
              onClose()
              setSettingsOpen(true)
            }}
          >
            <span className="pm-row-icon">
              <Settings size={14} />
            </span>
            偏好设置
          </button>
          <button
            className="pm-row pm-row-danger"
            onClick={async () => {
              await logout()
              onClose()
              toast('已退出登录', 'info')
            }}
          >
            <span className="pm-row-icon">
              <LogOut size={14} />
            </span>
            退出登录
          </button>
        </div>
      </Popover>

      {settingsOpen && <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
    </>
  )
}

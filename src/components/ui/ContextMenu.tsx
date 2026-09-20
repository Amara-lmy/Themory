import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'

export interface CtxSubItem {
  key: string
  label: string
  icon?: ReactNode
  onSelect: () => void
}

export interface CtxMenuItem {
  key: string
  label: string
  icon?: ReactNode
  danger?: boolean
  separatorBefore?: boolean
  /** 悬停展开的二级菜单（如分类列表） */
  children?: CtxSubItem[]
  onSelect: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: CtxMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [openSub, setOpenSub] = useState<string | null>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // 用 mousedown + click 后触发，避免与打开用的 contextmenu 冲突
    const t = setTimeout(() => {
      window.addEventListener('mousedown', close)
      window.addEventListener('resize', onClose)
    }, 0)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  // 边界修正
  let left = x
  let top = y
  const el = ref.current
  if (el) {
    const rect = el.getBoundingClientRect()
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8
    if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8
  }
  // 靠近右边缘时，子菜单向左展开
  const subLeft = left > window.innerWidth - 280

  return createPortal(
    <div ref={ref} className="ctx-menu" style={{ left, top }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item) => (
        <div key={item.key} className="ctx-item-wrap">
          {item.separatorBefore && <div className="ctx-sep" />}
          <button
            className={`ctx-item ${item.danger ? 'danger' : ''}`}
            onClick={() => {
              if (item.children && item.children.length > 0) return
              item.onSelect()
              onClose()
            }}
            onMouseEnter={() => setOpenSub(item.children && item.children.length > 0 ? item.key : null)}
          >
            {item.icon && <span className="ctx-icon">{item.icon}</span>}
            {item.label}
            {item.children && item.children.length > 0 && (
              <span className="ctx-arrow">
                <ChevronRight size={13} />
              </span>
            )}
          </button>
          {item.children && openSub === item.key && item.children.length > 0 && (
            <div className={`ctx-submenu ${subLeft ? 'left' : ''}`}>
              {item.children.map((sub) => (
                <button
                  key={sub.key}
                  className="ctx-item"
                  onClick={() => {
                    sub.onSelect()
                    onClose()
                  }}
                >
                  {sub.icon && <span className="ctx-icon">{sub.icon}</span>}
                  {sub.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>,
    document.body,
  )
}

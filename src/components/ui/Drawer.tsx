import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface DrawerProps {
  open: boolean
  side?: 'left' | 'right'
  onClose: () => void
  /** 自定义宽度，默认 min(400px, 88vw) */
  width?: string
  children: ReactNode
}

export function Drawer({ open, side = 'right', onClose, width, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      <div className="drawer-overlay" onMouseDown={onClose} />
      <div
        className={`drawer ${side === 'right' ? 'drawer-right' : 'drawer-left'}`}
        style={width ? { width: `min(${width}, 100vw)` } : undefined}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '10px 12px 0',
          }}
        >
          <button className="btn-icon" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </>,
    document.body,
  )
}

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface PopoverProps {
  x: number
  y: number
  onClose: () => void
  children: ReactNode
  width?: number
  className?: string
}

/** 轻量锚点浮层：坐标由调用方计算（通常为触发元素右下角） */
export function Popover({ x, y, onClose, children, width, className }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const t = setTimeout(() => window.addEventListener('mousedown', close), 0)
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  let left = x
  let top = y
  const el = ref.current
  if (el) {
    const rect = el.getBoundingClientRect()
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8
    if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8
  }

  return createPortal(
    <div ref={ref} className={`popover ${className || ''}`} style={{ left, top, width }}>
      {children}
    </div>,
    document.body,
  )
}

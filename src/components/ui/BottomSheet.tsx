import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { GripHorizontal, X } from 'lucide-react'

interface BottomSheetProps {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
}

const HALF_VH = 55
const EXPANDED_VH = 86
const CLOSE_THRESHOLD = 32

/**
 * 底部抽屉（无遮罩，背景页面仍可操作）：
 * - 拖动把手调整高度
 * - 向下拖过阈值关闭
 * - 点击把手在半高 / 全高之间切换
 */
export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  const [heightVh, setHeightVh] = useState(HALF_VH)
  const [dragging, setDragging] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const startRef = useRef({ y: 0, h: HALF_VH, moved: false })

  useEffect(() => {
    if (open) setHeightVh(HALF_VH)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    startRef.current = { y: e.clientY, h: heightVh, moved: false }
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const dy = e.clientY - startRef.current.y
    if (Math.abs(dy) > 4) startRef.current.moved = true
    const vhPx = window.innerHeight / 100
    const next = Math.min(EXPANDED_VH, Math.max(10, startRef.current.h - dy / vhPx))
    setHeightVh(next)
  }
  const onPointerUp = () => {
    if (!dragging) return
    setDragging(false)
    if (heightVh < CLOSE_THRESHOLD) {
      onClose()
      return
    }
    if (!startRef.current.moved) {
      // 点击把手：半高 / 全高切换
      setHeightVh(heightVh > 70 ? HALF_VH : EXPANDED_VH)
    } else {
      setHeightVh(heightVh > 70 ? EXPANDED_VH : HALF_VH)
    }
  }

  return createPortal(
    <div
      ref={sheetRef}
      className="bottom-sheet"
      style={{
        height: `${heightVh}vh`,
        transition: dragging ? 'none' : 'height 240ms cubic-bezier(0.25, 0.7, 0.3, 1)',
      }}
    >
      <div
        className="bs-handle-area"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="拖动调整高度，向下拖关闭"
      >
        <div className="bs-handle" />
      </div>
      <div className="bs-header">
        <span
          className="bs-grabber"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <GripHorizontal size={16} />
        </span>
        <span className="bs-title">{title}</span>
        <button className="btn-icon" onClick={onClose} aria-label="关闭详情">
          <X size={16} />
        </button>
      </div>
      <div className="bs-body">{children}</div>
    </div>,
    document.body,
  )
}

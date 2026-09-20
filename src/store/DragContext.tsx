import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * 全局拖拽状态：标签 / 论文
 * 同时写入 dataTransfer（text/自定义 MIME），这里仅用于渲染 drop 高亮
 */

export type DragPayload =
  | { kind: 'tag'; name: string }
  | { kind: 'paper'; id: string }
  | null

interface DragContextValue {
  drag: DragPayload
  startDrag: (p: Exclude<DragPayload, null>) => void
  endDrag: () => void
}

const DragContext = createContext<DragContextValue | null>(null)

export const DRAG_MIME = 'application/x-themory-drag'

export function DragProvider({ children }: { children: ReactNode }) {
  const [drag, setDrag] = useState<DragPayload>(null)

  const startDrag = useCallback((p: Exclude<DragPayload, null>) => setDrag(p), [])
  const endDrag = useCallback(() => setDrag(null), [])

  // 接受来自 dragSourceProps 的 window 事件桥接
  useEffect(() => {
    const onStart = (e: Event) => setDrag((e as CustomEvent<Exclude<DragPayload, null>>).detail)
    const onEnd = () => setDrag(null)
    window.addEventListener('themory-drag-start', onStart)
    window.addEventListener('themory-drag-end', onEnd)
    return () => {
      window.removeEventListener('themory-drag-start', onStart)
      window.removeEventListener('themory-drag-end', onEnd)
    }
  }, [])

  const value = useMemo(() => ({ drag, startDrag, endDrag }), [drag, startDrag, endDrag])

  return <DragContext.Provider value={value}>{children}</DragContext.Provider>
}

export function useDrag(): DragContextValue {
  const ctx = useContext(DragContext)
  if (!ctx) throw new Error('useDrag 必须在 DragProvider 内使用')
  return ctx
}

/** 绑定到可拖拽元素：draggable + dragstart/dragend */
export function dragSourceProps(payload: Exclude<DragPayload, null>) {
  const encoded = JSON.stringify(payload)
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      // 自定义 MIME 用于 drop 时取数；text/plain 用于兼容（Firefox 要求至少一个已知类型才能发起拖拽）
      e.dataTransfer.setData(DRAG_MIME, encoded)
      e.dataTransfer.setData('text/plain', encoded)
      e.dataTransfer.effectAllowed = 'copy'
      // 通过 window 事件桥接到 context（避免每个调用点都 useDrag）
      window.dispatchEvent(new CustomEvent('themory-drag-start', { detail: payload }))
    },
    onDragEnd: () => {
      window.dispatchEvent(new CustomEvent('themory-drag-end'))
    },
  }
}

/**
 * 读取 dataTransfer 中的拖拽载荷（仅在 drop 时能拿到完整数据）
 */
export function readDragPayload(e: React.DragEvent): Exclude<DragPayload, null> | null {
  try {
    const raw = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')
    return raw ? (JSON.parse(raw) as Exclude<DragPayload, null>) : null
  } catch {
    return null
  }
}

/**
 * dragover / dragenter 阶段判断拖入的载荷类型。
 * 浏览器安全限制：dragover 期间 getData() 对自定义 MIME 返回空（Chrome/Edge），
 * 只有 dataTransfer.types 数组可读，因此放置可行性必须用 types 判断，
 * 否则不调用 preventDefault，浏览器会一直显示“禁止放置”且无法触发 drop。
 */
export function hasDragKind(
  e: React.DragEvent,
  kind?: 'tag' | 'paper',
): boolean {
  const types = Array.from(e.dataTransfer.types || [])
  if (!types.includes(DRAG_MIME)) return false
  // types 里无法区分具体载荷，用 window 桥接的当前拖拽状态判断
  if (!kind) return true
  return currentDrag?.kind === kind
}

/** 供 hasDragKind 在 dragover 阶段读取当前拖拽载荷（drop 前 getData 不可用） */
let currentDrag: DragPayload = null
if (typeof window !== 'undefined') {
  window.addEventListener('themory-drag-start', ((e: CustomEvent) => {
    currentDrag = e.detail
  }) as EventListener)
  window.addEventListener('themory-drag-end', () => {
    currentDrag = null
  })
}

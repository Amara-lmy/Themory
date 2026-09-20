import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'

/** 轻量 Toast */
interface ToastItem {
  id: number
  text: string
  kind: 'info' | 'success' | 'error'
}

const ToastContext = createContext<(text: string, kind?: ToastItem['kind']) => void>(() => {})

let toastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((text: string, kind: ToastItem['kind'] = 'info') => {
    const id = ++toastId
    setItems((prev) => [...prev, { id, text, kind }])
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 2600)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

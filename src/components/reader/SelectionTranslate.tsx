import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Languages, Loader2, X } from 'lucide-react'
import { translateTextAi } from '../../lib/ai'
import { useSettings } from '../../store/SettingsContext'

const CARD_W = 300
const CARD_H = 230

/**
 * 划词翻译：在论文阅读区选中文本后，浮出翻译卡片（英 → 中）
 * - 仅响应论文面板（.reader-pane 且非笔记面板）内的选区
 * - 请求序号防竞态：关闭/重新划词即取消旧请求的渲染
 */
export function SelectionTranslate() {
  const { settings } = useSettings()
  const [pos, setPos] = useState<{ x: number; y: number; above?: boolean } | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const reqIdRef = useRef(0)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const close = useCallback(() => {
    reqIdRef.current++ // 使在途请求失效
    setPos(null)
    setResult(null)
    setError(null)
    setCopied(false)
  }, [])

  const doTranslate = (raw: string, myId: number) => {
    setLoading(true)
    translateTextAi(raw)
      .then((out) => {
        if (reqIdRef.current !== myId) return
        setResult(out)
        setError(null)
      })
      .catch((e) => {
        if (reqIdRef.current !== myId) return
        setError((e as Error)?.message || '翻译失败，请稍后重试')
      })
      .finally(() => {
        if (reqIdRef.current === myId) setLoading(false)
      })
  }

  useEffect(() => {
    if (!settings.translateEnabled) {
      close()
      return
    }
    // 按下即关闭旧卡片（开始新选区时立即消失）
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('.sel-translate-card')) return
      close()
    }

    // 抬起时若在论文区有有效选区 → 打开卡片并翻译
    const onMouseUp = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('.sel-translate-card')) return
      // 等浏览器完成选区更新
      window.setTimeout(() => {
        const sel = window.getSelection()
        const raw = sel?.toString().trim() ?? ''
        if (!sel || sel.isCollapsed || !raw) return
        // 仅论文阅读区（排除笔记面板）
        const anchor = sel.anchorNode
        const el = anchor instanceof Element ? anchor : anchor?.parentElement
        const pane = el?.closest('.reader-pane')
        if (!pane || pane.classList.contains('note-pane')) return
        if (!sel.rangeCount) return
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        if (!rect || (rect.width === 0 && rect.height === 0)) return

        const x = Math.min(Math.max(rect.left + rect.width / 2, CARD_W / 2 + 8), window.innerWidth - CARD_W / 2 - 8)
        let y = rect.bottom + 10
        let above = false
        if (y + CARD_H > window.innerHeight - 8 && rect.top > CARD_H + 24) {
          above = true
          y = rect.top - 10
        }

        const myId = ++reqIdRef.current
        setPos({ x, y, above })
        setResult(null)
        setError(null)
        setCopied(false)
        doTranslate(raw, myId)
      }, 0)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [close, settings.translateEnabled])

  useEffect(() => () => clearTimeout(copyTimerRef.current), [])

  const copyResult = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = result
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
  }

  if (!pos) return null

  return createPortal(
    <div
      className="sel-translate-card"
      style={{
        left: pos.x,
        top: pos.y,
        transform: pos.above ? 'translate(-50%, -100%)' : 'translateX(-50%)',
      }}
    >
      <div className="sel-translate-head">
        <span className="sel-translate-label">
          <Languages size={12} /> 翻译
        </span>
        <button className="sel-translate-close" title="关闭" onClick={close}>
          <X size={12} />
        </button>
      </div>
      <div className="sel-translate-body">
        {loading && (
          <div className="sel-translate-loading">
            <Loader2 size={14} className="spin" /> 翻译中…
          </div>
        )}
        {!loading && error && <div className="sel-translate-error">{error}</div>}
        {!loading && !error && result && <div className="sel-translate-result">{result}</div>}
      </div>
      {!loading && !error && result && (
        <div className="sel-translate-foot">
          <button className="sel-translate-copy" onClick={copyResult}>
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? '已复制' : '复制译文'}
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}

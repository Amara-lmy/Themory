import { useEffect, useRef } from 'react'

export type EditorAction =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'foreColor'
  | 'hiliteColor'
  | 'fontSize'
  | 'block'
  | 'ul'
  | 'ol'
  | 'link'

export interface EditorHandle {
  exec: (action: EditorAction, value?: string) => void
  focus: () => void
}

interface RichEditorProps {
  html: string
  onChange: (html: string) => void
  placeholder?: string
  register?: (handle: EditorHandle | null) => void
  onFocus?: () => void
}

/**
 * 轻量富文本编辑器（contentEditable）
 * 支持：加粗 / 倾斜 / 下划线 / 文字颜色 / 高亮 / 字号 / H1 H2 / 列表 / 超链接
 */
export function RichEditor({ html, onChange, placeholder, register, onFocus }: RichEditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  const lastEmitted = useRef(html)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // 初始化 + 外部内容同步（仅在内容确实来自外部时）
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (html !== lastEmitted.current) {
      el.innerHTML = html
      lastEmitted.current = html
    }
  }, [html])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = html
    lastEmitted.current = html
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emit = () => {
    const el = ref.current
    if (!el) return
    let value = el.innerHTML
    if (value === '<br>' || value === '<div><br></div>') value = ''
    lastEmitted.current = value
    onChangeRef.current(value)
  }

  const exec = (action: EditorAction, value?: string) => {
    const el = ref.current
    if (!el) return
    el.focus()
    try {
      switch (action) {
        case 'bold':
        case 'italic':
        case 'underline':
        case 'ul':
        case 'ol': {
          const cmd = action === 'ul' ? 'insertUnorderedList' : action === 'ol' ? 'insertOrderedList' : action
          document.execCommand(cmd)
          break
        }
        case 'foreColor':
        case 'hiliteColor':
          document.execCommand('styleWithCSS', false, 'true')
          document.execCommand(action, false, value)
          break
        case 'fontSize': {
          // 通过 font[size=7] 生成后转换为精确 px
          document.execCommand('styleWithCSS', false, 'false')
          document.execCommand('fontSize', false, '7')
          el.querySelectorAll('font[size="7"]').forEach((f) => {
            const span = document.createElement('span')
            span.style.fontSize = `${value || 14}px`
            while (f.firstChild) span.appendChild(f.firstChild)
            f.replaceWith(span)
          })
          break
        }
        case 'block':
          document.execCommand('formatBlock', false, value || '<p>')
          break
        case 'link':
          document.execCommand('createLink', false, value)
          break
      }
    } catch (e) {
      console.warn('execCommand failed', e)
    }
    emit()
  }

  useEffect(() => {
    if (!register) return
    const handle: EditorHandle = { exec, focus: () => ref.current?.focus() }
    register(handle)
    return () => register(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={ref}
      className="rich-editor"
      data-placeholder={placeholder}
      contentEditable
      suppressContentEditableWarning
      onInput={emit}
      onBlur={emit}
      onFocus={onFocus}
      onClick={(e) => {
        // 让编辑器中的链接在新标签页打开
        const a = (e.target as HTMLElement).closest('a')
        if (a && a.href) {
          e.preventDefault()
          window.open(a.href, '_blank', 'noreferrer')
        }
      }}
    />
  )
}

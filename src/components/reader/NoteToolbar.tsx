import { useEffect, useRef, useState } from 'react'
import {
  Bold,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Palette,
  Underline,
  Unlink,
} from 'lucide-react'
import { Popover } from '../ui/Popover'
import type { EditorHandle } from './RichEditor'

const TEXT_COLORS = ['#191d2b', '#4f7cff', '#8b5cf6', '#e5484d', '#d97706', '#30a46c', '#64748b']
const HIGHLIGHT_COLORS = ['#fff3ad', '#ffd6e0', '#d3f2de', '#dbe8ff', '#ece5ff', '#e2e8f0']
const FONT_SIZES: { value: number; label: string }[] = [
  { value: 12, label: '小' },
  { value: 14, label: '正文' },
  { value: 18, label: '大' },
  { value: 24, label: '特大' },
]

interface NoteToolbarProps {
  getActive: () => EditorHandle | null
  /** 渲染在工具栏最右侧的内容（如 AI 一键填充按钮） */
  right?: React.ReactNode
}

/** 笔记富文本工具栏：加粗/倾斜/下划线/颜色/高亮/字号/标题/列表/链接 */
export function NoteToolbar({ getActive, right }: NoteToolbarProps) {
  const [states, setStates] = useState({ bold: false, italic: false, underline: false, ul: false, ol: false })
  const [colorPop, setColorPop] = useState<{ x: number; y: number } | null>(null)
  const [hlPop, setHlPop] = useState<{ x: number; y: number } | null>(null)
  const [linkPop, setLinkPop] = useState<{ x: number; y: number } | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const savedRange = useRef<Range | null>(null)
  const linkInputRef = useRef<HTMLInputElement>(null)

  // 跟踪选区加粗等状态
  useEffect(() => {
    const onSel = () => {
      try {
        setStates({
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
          ul: document.queryCommandState('insertUnorderedList'),
          ol: document.queryCommandState('insertOrderedList'),
        })
      } catch {
        /* ignore */
      }
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  const saveRange = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange()
  }

  const restoreRange = () => {
    const sel = window.getSelection()
    if (savedRange.current && sel) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
  }

  const run = (fn: (h: EditorHandle) => void) => {
    const h = getActive()
    if (h) fn(h)
  }

  const posOf = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: r.left, y: r.bottom + 6 }
  }

  const btn = (
    title: string,
    active: boolean,
    onMouseDown: (e: React.MouseEvent) => void,
    icon: React.ReactNode,
  ) => (
    <button
      className={`tb-btn ${active ? 'active' : ''}`}
      title={title}
      onMouseDown={(e) => {
        e.preventDefault()
        onMouseDown(e)
      }}
    >
      {icon}
    </button>
  )

  return (
    <div className="note-toolbar">
      {btn('加粗', states.bold, () => run((h) => h.exec('bold')), <Bold size={15} />)}
      {btn('倾斜', states.italic, () => run((h) => h.exec('italic')), <Italic size={15} />)}
      {btn('下划线', states.underline, () => run((h) => h.exec('underline')), <Underline size={15} />)}

      <div className="tb-sep" />

      {btn(
        '文字颜色',
        false,
        (e) => {
          saveRange()
          setColorPop(posOf(e))
        },
        <Palette size={15} />,
      )}
      {btn(
        '高亮',
        false,
        (e) => {
          saveRange()
          setHlPop(posOf(e))
        },
        <Highlighter size={15} />,
      )}

      <div className="tb-sep" />

      <select
        className="tb-select"
        title="文字大小"
        defaultValue=""
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) => {
          const v = e.target.value
          if (v) run((h) => h.exec('fontSize', v))
          e.target.value = ''
        }}
      >
        <option value="" disabled>
          字号
        </option>
        {FONT_SIZES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <select
        className="tb-select"
        title="标题样式"
        defaultValue=""
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) => {
          const v = e.target.value
          if (v) run((h) => h.exec('block', v))
          e.target.value = ''
        }}
      >
        <option value="" disabled>
          样式
        </option>
        <option value="<p>">正文</option>
        <option value="<h1>">H1 标题</option>
        <option value="<h2>">H2 标题</option>
      </select>

      <div className="tb-sep" />

      {btn('无序列表', states.ul, () => run((h) => h.exec('ul')), <List size={15} />)}
      {btn('有序列表', states.ol, () => run((h) => h.exec('ol')), <ListOrdered size={15} />)}

      <div className="tb-sep" />

      {btn(
        '超链接',
        false,
        (e) => {
          saveRange()
          setLinkUrl('')
          setLinkPop(posOf(e))
          setTimeout(() => linkInputRef.current?.focus(), 30)
        },
        <Link2 size={15} />,
      )}

      {/* 工具栏最右侧区域（AI 一键填充等） */}
      {right && <div className="tb-right">{right}</div>}

      {/* 文字颜色弹层 */}
      {colorPop && (
        <Popover x={colorPop.x} y={colorPop.y} onClose={() => setColorPop(null)}>
          <div onMouseDown={(e) => e.preventDefault()} style={{ padding: 6, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, width: 190 }}>
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                title={c}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, borderRadius: 6 }}
                onClick={() => {
                  run((h) => h.exec('foreColor', c))
                  setColorPop(null)
                }}
              >
                <span className="color-dot" style={{ ['--dot' as string]: c }} />
              </button>
            ))}
          </div>
        </Popover>
      )}

      {/* 高亮弹层 */}
      {hlPop && (
        <Popover x={hlPop.x} y={hlPop.y} onClose={() => setHlPop(null)}>
          <div onMouseDown={(e) => e.preventDefault()} style={{ padding: 6, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5, width: 170 }}>
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                title={c}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, borderRadius: 6 }}
                onClick={() => {
                  run((h) => h.exec('hiliteColor', c))
                  setHlPop(null)
                }}
              >
                <span className="color-dot" style={{ ['--dot' as string]: c }} />
              </button>
            ))}
          </div>
        </Popover>
      )}

      {/* 链接弹层 */}
      {linkPop && (
        <Popover x={linkPop.x} y={linkPop.y} onClose={() => setLinkPop(null)} width={260}>
          <div style={{ padding: 6 }} onMouseDown={(e) => e.stopPropagation()}>
            <input
              ref={linkInputRef}
              className="input"
              placeholder="https://…"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmLink(false)
                if (e.key === 'Escape') setLinkPop(null)
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                style={{ flex: 1 }}
                onClick={() => confirmLink(false)}
              >
                插入链接
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => confirmLink(true)}>
                <Unlink size={12} /> 移除
              </button>
            </div>
          </div>
        </Popover>
      )}
    </div>
  )

  function confirmLink(remove: boolean) {
    restoreRange()
    run((h) => h.exec('link', remove ? '' : normalizeUrl(linkUrl)))
    setLinkPop(null)
  }
}

function normalizeUrl(u: string): string {
  const t = u.trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

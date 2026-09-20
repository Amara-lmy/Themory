import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Loader2, Sparkles, X } from 'lucide-react'
import type { Note, NoteSection, Paper } from '../../types'
import { DEFAULT_SECTION_TITLES } from '../../types'
import { RichEditor } from './RichEditor'
import type { EditorHandle } from './RichEditor'
import { Modal } from '../ui/Modal'
import { generateSection } from '../../lib/ai'
import { uid } from '../../lib/utils'

/** 供外部（工具栏 AI 一键填充按钮）调用的章节操作接口 */
export interface StructuredFillApi {
  getSections: () => NoteSection[]
  applySections: (next: NoteSection[]) => void
}

interface StructuredNoteEditorProps {
  note: Note
  paper: Paper
  onChange: (content: string) => void
  registerHandle: (id: string, handle: EditorHandle | null) => void
  onFocusSection: (id: string) => void
  registerFillApi?: (api: StructuredFillApi | null) => void
}

function parseSections(content: string): NoteSection[] {
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed) && parsed.every((s) => typeof s.title === 'string')) {
      return parsed.map((s) => ({ id: s.id || uid(), title: s.title, html: s.html || '' }))
    }
  } catch {
    /* fallthrough */
  }
  return DEFAULT_SECTION_TITLES.map((title) => ({ id: uid(), title, html: '' }))
}

/**
 * 结构化笔记：默认模板章节，可新增 / 删除 / 重命名 / 调整顺序
 */
export function StructuredNoteEditor({
  note,
  paper,
  onChange,
  registerHandle,
  onFocusSection,
  registerFillApi,
}: StructuredNoteEditorProps) {
  const [sections, setSections] = useState<NoteSection[]>(() => parseSections(note.content))
  const dragIndexRef = useRef<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  // 单栏 AI 填充：null = 空闲；sectionId = 生成中
  const [filling, setFilling] = useState<string | null>(null)
  // 单栏覆盖确认弹窗
  const [confirmOverwrite, setConfirmOverwrite] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  // 始终指向最新 sections / emit，供对外 API 使用
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections
  const emitRef = useRef<(next: NoteSection[]) => void>(() => {})

  // 对外暴露章节读取/写入能力（一键填充由 NotePanel 编排）
  useEffect(() => {
    if (!registerFillApi) return
    registerFillApi({
      getSections: () => sectionsRef.current,
      applySections: (next) => emitRef.current(next),
    })
    return () => registerFillApi(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切换笔记时重新加载内容
  useEffect(() => {
    setSections(parseSections(note.content))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  const emit = (next: NoteSection[]) => {
    setSections(next)
    onChange(JSON.stringify(next))
  }
  emitRef.current = emit

  const updateSection = (id: string, patch: Partial<NoteSection>) => {
    emit(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const addSection = () => {
    emit([...sections, { id: uid(), title: '新章节', html: '' }])
  }

  const removeSection = (id: string) => {
    emit(sections.filter((s) => s.id !== id))
  }

  const moveSection = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= sections.length) return
    const next = [...sections]
    ;[next[index], next[target]] = [next[target], next[index]]
    emit(next)
  }

  // 拖拽排序
  const reorder = (from: number, to: number) => {
    if (from === to) return
    const next = [...sections]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    emit(next)
  }

  /* ===== 单栏 AI 填充（Mock，接口见 src/lib/ai.ts） ===== */
  const aiContext = {
    title: paper.title,
    authors: paper.authors,
    venue: paper.venue,
    year: paper.year,
    paperId: paper.id,
  }

  const doFillSection = async (id: string) => {
    const section = sections.find((s) => s.id === id)
    if (!section) return
    setFilling(id)
    setAiError(null)
    try {
      const html = await generateSection(section.title, aiContext)
      updateSection(id, { html })
    } catch {
      setAiError('AI 生成失败，请稍后重试。')
    } finally {
      setFilling(null)
      setConfirmOverwrite(null)
    }
  }

  // 单栏填充：该栏已有内容先弹确认
  const requestFillSection = (id: string) => {
    if (filling) return
    const section = sections.find((s) => s.id === id)
    if (section?.html.trim()) setConfirmOverwrite(id)
    else doFillSection(id)
  }

  return (
    <div className="note-editor-body">
      {aiError && (
        <div className="ai-fill-error" style={{ padding: '0 14px 6px', textAlign: 'right' }}>
          {aiError}
        </div>
      )}
      {sections.map((s, i) => (
        <div
          className={`section-card ${dragIndex === i ? 'section-dragging' : ''} ${overIndex === i && dragIndex !== i ? 'section-over' : ''}`}
          key={s.id}
          onDragOver={(e) => {
            if (dragIndexRef.current === null) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (overIndex !== i) setOverIndex(i)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node) && overIndex === i) setOverIndex(null)
          }}
          onDrop={(e) => {
            e.preventDefault()
            const from = dragIndexRef.current
            setOverIndex(null)
            setDragIndex(null)
            dragIndexRef.current = null
            if (from !== null) reorder(from, i)
          }}
        >
          <div className="section-head">
            <span
              className="section-grip"
              title="拖拽调整章节顺序"
              draggable
              onDragStart={(e) => {
                dragIndexRef.current = i
                setDragIndex(i)
                e.dataTransfer.effectAllowed = 'move'
                try {
                  e.dataTransfer.setData('text/plain', String(i))
                } catch {
                  /* ignore */
                }
              }}
              onDragEnd={() => {
                dragIndexRef.current = null
                setDragIndex(null)
                setOverIndex(null)
              }}
            >
              <GripVertical size={13} />
            </span>
            <span className="section-index">{i + 1}</span>
            <input
              className="section-title-input"
              value={s.title}
              placeholder="章节名称"
              onChange={(e) => updateSection(s.id, { title: e.target.value })}
            />
            <div className="section-ops">
              <button
                className="btn-icon"
                style={{ width: 24, height: 24 }}
                title="上移"
                disabled={i === 0}
                onClick={() => moveSection(i, -1)}
              >
                <ArrowUp size={13} />
              </button>
              <button
                className="btn-icon"
                style={{ width: 24, height: 24 }}
                title="下移"
                disabled={i === sections.length - 1}
                onClick={() => moveSection(i, 1)}
              >
                <ArrowDown size={13} />
              </button>
              <button
                className="btn-icon"
                style={{ width: 24, height: 24 }}
                title="删除章节"
                onClick={() => removeSection(s.id)}
              >
                <X size={13} />
              </button>
            </div>
          </div>
          <div className="section-body">
            <RichEditor
              html={s.html}
              placeholder={s.title === '新章节' ? '记录这一部分的内容…' : `在「${s.title}」下记录…`}
              onFocus={() => onFocusSection(s.id)}
              register={(h) => registerHandle(s.id, h)}
              onChange={(html) => updateSection(s.id, { html })}
            />
          </div>
          {/* 右下角单栏 AI 填充标识 */}
          <button
            className="section-ai-badge"
            title={filling === s.id ? 'AI 生成中…' : `AI 填充「${s.title}」`}
            disabled={filling !== null}
            onClick={() => requestFillSection(s.id)}
          >
            {filling === s.id ? <Loader2 size={11} className="spin" /> : <Sparkles size={11} />}
          </button>
        </div>
      ))}
      <button className="add-section-btn" onClick={addSection}>
        ＋ 新增章节
      </button>

      {/* 覆盖确认弹窗 */}
      {confirmOverwrite !== null && (
        <Modal
          open
          title="覆盖已有内容？"
          onClose={() => setConfirmOverwrite(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmOverwrite(null)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={() => doFillSection(confirmOverwrite)}
              >
                覆盖填充
              </button>
            </>
          }
        >
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
            您已创建笔记，是否覆盖已有内容？
          </div>
        </Modal>
      )}
    </div>
  )
}

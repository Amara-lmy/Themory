import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, FileText, Loader2, Plus, Sparkles, StickyNote } from 'lucide-react'
import type { NoteSection, NoteType, Paper } from '../../types'
import { useLibrary } from '../../store/LibraryContext'
import { Popover } from '../ui/Popover'
import { Modal } from '../ui/Modal'
import { NoteToolbar } from './NoteToolbar'
import { StructuredNoteEditor } from './StructuredNoteEditor'
import type { StructuredFillApi } from './StructuredNoteEditor'
import { FreeNoteEditor } from './FreeNoteEditor'
import { CreateNoteDialog } from '../dialogs/CreateNoteDialog'
import { generateSection } from '../../lib/ai'
import { formatHM } from '../../lib/utils'
import type { EditorHandle } from './RichEditor'

interface NotePanelProps {
  paper: Paper
  activeType: NoteType
  onActiveTypeChange: (t: NoteType) => void
  aiOpen: boolean
  onToggleAi: () => void
}

type SaveState = { kind: 'idle' | 'saving' | 'saved'; at?: number }

/** 我的阅读笔记面板 */
export function NotePanel({ paper, activeType, onActiveTypeChange, aiOpen, onToggleAi }: NotePanelProps) {
  const { getNote, createNote, saveNote } = useLibrary()
  const structured = getNote(paper.id, 'structured')
  const free = getNote(paper.id, 'free')
  const note = activeType === 'structured' ? structured : free

  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [switcherPos, setSwitcherPos] = useState({ x: 0, y: 0 })
  const [createOpen, setCreateOpen] = useState(false)

  const pendingRef = useRef<{ id: string; content: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const handlesRef = useRef<Map<string, EditorHandle>>(new Map())
  const activeIdRef = useRef<string | null>(null)

  /* ===== AI 一键填充（结构化笔记，Mock，接口见 src/lib/ai.ts） ===== */
  const fillApiRef = useRef<StructuredFillApi | null>(null)
  const [fillState, setFillState] = useState<'all' | null>(null)
  const [fillError, setFillError] = useState<string | null>(null)
  const [confirmFillAll, setConfirmFillAll] = useState(false)

  const doFillAll = async () => {
    const api = fillApiRef.current
    if (!api) return
    setFillState('all')
    setFillError(null)
    try {
      const sections: NoteSection[] = api.getSections()
      const results = await Promise.all(
        sections.map(async (s) => [s.id, await generateSection(s.title, {
          title: paper.title,
          authors: paper.authors,
          venue: paper.venue,
          year: paper.year,
          paperId: paper.id,
        })] as const),
      )
      const htmlById = new Map(results)
      api.applySections(sections.map((s) => ({ ...s, html: htmlById.get(s.id) ?? s.html })))
    } catch {
      setFillError('AI 生成失败，请稍后重试。')
    } finally {
      setFillState(null)
      setConfirmFillAll(false)
    }
  }

  // 一键填充：已有内容先弹确认
  const requestFillAll = () => {
    if (fillState) return
    const sections = fillApiRef.current?.getSections() ?? []
    if (sections.some((s) => s.html.trim())) setConfirmFillAll(true)
    else doFillAll()
  }

  const flush = () => {
    if (pendingRef.current) {
      saveNote(pendingRef.current.id, pendingRef.current.content)
      pendingRef.current = null
      setSaveState({ kind: 'saved', at: Date.now() })
    }
    clearTimeout(timerRef.current)
  }

  // 卸载 / 关闭页面前落盘
  useEffect(() => {
    return () => flush()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.id])

  useEffect(() => {
    const onUnload = () => flush()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 当前类型没有笔记但另一种存在 → 自动切换
  useEffect(() => {
    if (!note && (structured || free)) {
      onActiveTypeChange(structured ? 'structured' : 'free')
    }
  }, [note, structured, free]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (content: string) => {
    if (!note) return
    pendingRef.current = { id: note.id, content }
    setSaveState({ kind: 'saving' })
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, 700)
  }

  const switchTo = (t: NoteType) => {
    if (t === activeType) return
    flush() // 切换前自动保存
    setSaveState({ kind: 'idle' })
    onActiveTypeChange(t)
  }

  const ensureNote = (t: NoteType) => {
    if (!getNote(paper.id, t)) createNote(paper.id, t)
    switchTo(t)
  }

  const getActive = (): EditorHandle | null => {
    const active = activeIdRef.current ? handlesRef.current.get(activeIdRef.current) : null
    if (active) return active
    return handlesRef.current.values().next().value ?? null
  }

  const registerHandle = (id: string, handle: EditorHandle | null) => {
    if (handle) handlesRef.current.set(id, handle)
    else handlesRef.current.delete(id)
  }

  const noteLabel = (t: NoteType) => (t === 'structured' ? '结构化笔记' : '自由笔记')
  const typeIcon = (t: NoteType) =>
    t === 'structured' ? <FileText size={14} /> : <StickyNote size={14} />

  return (
    <div className="reader-pane note-pane">
      <div className="pane-header">
        <span className="pane-title">我的阅读笔记</span>

        <div className="note-head-right">
          {/* 自动保存状态 */}
          <span className={`save-status ${saveState.kind === 'saved' ? 'saved' : ''}`}>
            {saveState.kind === 'saving' && '正在保存…'}
            {saveState.kind === 'saved' && `✓ 已保存 · ${formatHM(saveState.at ?? Date.now())}`}
          </span>

          {/* 笔记切换热区 */}
          {(structured || free) && (
            <button
              className="note-switcher"
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setSwitcherPos({ x: r.right - 190, y: r.bottom + 6 })
                setSwitcherOpen(true)
              }}
            >
              {note ? noteLabel(note.type) : noteLabel(activeType)}
              <ChevronDown size={13} />
            </button>
          )}
        </div>
      </div>

      {/* 没有任何笔记：空状态 */}
      {!structured && !free && (
        <div className="note-empty">
          <div className="empty-icon" style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--brand-grad-soft)', color: 'var(--brand-a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <StickyNote size={19} />
          </div>
          <div className="empty-title" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}>
            尚未建立笔记
          </div>
          <div className="empty-desc">
            记录你对这篇论文的理解，
            <br />
            方便下次快速恢复阅读记忆。
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Plus size={13} /> 新建笔记
          </button>
        </div>
      )}

      {/* 有笔记：工具栏 + 编辑器 */}
      {note && (
        <>
          <NoteToolbar
            getActive={getActive}
            right={
              note.type === 'structured' ? (
                <>
                  {fillError && (
                    <span className="ai-fill-error" title={fillError}>
                      {fillError}
                    </span>
                  )}
                  <button className="btn-ai-fill" onClick={requestFillAll} disabled={fillState !== null}>
                    {fillState === 'all' ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
                    {fillState === 'all' ? '生成中…' : 'AI 一键填充'}
                  </button>
                </>
              ) : null
            }
          />
          {note.type === 'structured' ? (
            <StructuredNoteEditor
              key={note.id}
              note={note}
              paper={paper}
              onChange={handleChange}
              registerHandle={registerHandle}
              onFocusSection={(id) => (activeIdRef.current = id)}
              registerFillApi={(api) => (fillApiRef.current = api)}
            />
          ) : (
            <div key={note.id} onFocus={() => (activeIdRef.current = 'free')}>
              <FreeNoteEditor note={note} onChange={handleChange} />
            </div>
          )}
        </>
      )}

      {/* AI 助手悬浮按钮（窗口停靠在左侧论文区域下方） */}
      <button
        className={`ai-fab ${aiOpen ? 'active' : ''}`}
        title={aiOpen ? '收起 AI 助手' : 'AI 研究助手'}
        onClick={onToggleAi}
      >
        <Sparkles size={16} />
      </button>

      {/* 笔记切换下拉 */}
      {switcherOpen && (
        <Popover x={switcherPos.x} y={switcherPos.y} onClose={() => setSwitcherOpen(false)} width={190}>
          {(['structured', 'free'] as NoteType[]).map((t) => {
            const exists = t === 'structured' ? Boolean(structured) : Boolean(free)
            if (!exists) return null
            return (
              <button key={t} className="popover-item" onClick={() => switchTo(t)}>
                <span className="check">{activeType === t && <Check size={14} />}</span>
                {typeIcon(t)}
                {noteLabel(t)}
              </button>
            )
          })}
          {!structured && (
            <button className="popover-item" onClick={() => ensureNote('structured')}>
              <span className="check" />
              <Plus size={14} />
              新建结构化笔记
            </button>
          )}
          {!free && (
            <button className="popover-item" onClick={() => ensureNote('free')}>
              <span className="check" />
              <Plus size={14} />
              新建自由笔记
            </button>
          )}
        </Popover>
      )}

      {/* 一键填充覆盖确认 */}
      {confirmFillAll && (
        <Modal
          open
          title="覆盖已有内容？"
          onClose={() => setConfirmFillAll(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmFillAll(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={doFillAll}>
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

      <CreateNoteDialog open={createOpen} paperId={paper.id} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

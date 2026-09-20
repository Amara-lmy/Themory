import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlignLeft,
  BookOpen,
  Building2,
  Calendar,
  Check,
  Copy,
  Hash,
  Link2,
  NotebookPen,
  Plus,
  Quote,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Paper } from '../types'
import { copyText } from '../lib/utils'
import { useLibrary } from '../store/LibraryContext'
import { useToast } from '../store/ToastContext'

interface LiteratureDetailProps {
  paper: Paper | null
  onEdit: () => void
  onAddTag: () => void
}

/* ---------------- 可双击编辑的信息卡 ---------------- */

interface InfoCardProps {
  paperId: string
  icon: ReactNode
  label: string
  value: string
  placeholder: string
  multiline?: boolean
  copyable?: boolean
  removable?: boolean
  onSave: (v: string) => void
  onRemove?: () => void
}

function InfoCard({
  paperId,
  icon,
  label,
  value,
  placeholder,
  multiline = false,
  copyable = false,
  removable = false,
  onSave,
  onRemove,
}: InfoCardProps) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)

  // 切换论文时退出编辑
  useEffect(() => {
    setEditing(false)
    setDraft(value)
  }, [paperId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editing) {
      const el = inputRef.current
      el?.focus()
      if (el && !multiline) el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editing, multiline])

  const startEdit = () => {
    setDraft(value)
    setEditing(true)
  }
  const commit = () => {
    const v = draft.trim()
    if (v !== value.trim()) onSave(v)
    setEditing(false)
  }
  const cancel = () => {
    setDraft(value)
    setEditing(false)
  }

  const doCopy = async () => {
    if (!value) return toast(`请先填写${label}`, 'error')
    const ok = await copyText(value)
    ok ? toast(`${label}已复制`, 'success') : toast('复制失败，请手动复制', 'error')
  }

  return (
    <div className="info-card" onDoubleClick={startEdit} title="双击编辑">
      <div className="info-card-head">
        <span className="info-card-label">
          {icon}
          {label}
        </span>
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {copyable && (
            <button className="card-copy" title={`复制${label}`} onClick={doCopy}>
              <Copy size={12} />
            </button>
          )}
          {removable && (
            <button className="card-remove btn-icon" style={{ width: 22, height: 22 }} title="删除该信息" onClick={onRemove}>
              <Trash2 size={12} />
            </button>
          )}
        </span>
      </div>

      {editing ? (
        <>
          {multiline ? (
            <textarea
              ref={(el) => {
                inputRef.current = el
              }}
              className="info-edit"
              rows={4}
              value={draft}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit()
                if (e.key === 'Escape') cancel()
              }}
            />
          ) : (
            <input
              ref={(el) => {
                inputRef.current = el
              }}
              className="info-edit"
              value={draft}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') cancel()
              }}
            />
          )}
          <div className="info-edit-hint">{multiline ? 'Ctrl + Enter 保存 · Esc 取消' : 'Enter 保存 · Esc 取消'}</div>
        </>
      ) : label === '论文链接' && value ? (
        <div className="info-card-value">
          <a
            href={/^https?:\/\//i.test(value) ? value : `https://${value}`}
            target="_blank"
            rel="noreferrer"
          >
            {value}
          </a>
        </div>
      ) : (
        <div className={`info-card-value ${multiline ? 'clamped' : ''} ${value ? '' : 'muted'}`}>
          {value || placeholder}
        </div>
      )}
    </div>
  )
}

/* ---------------- 论文详情 ---------------- */

export function LiteratureDetail({ paper, onEdit, onAddTag }: LiteratureDetailProps) {
  const {
    removePaperTag,
    categories,
    getNote,
    updatePaper,
    addCustomField,
    updateCustomField,
    removeCustomField,
  } = useLibrary()
  const toast = useToast()
  const navigate = useNavigate()
  const [addingField, setAddingField] = useState(false)
  const [fieldLabel, setFieldLabel] = useState('')

  useEffect(() => setAddingField(false), [paper?.id])

  if (!paper) {
    return (
      <div className="lit-detail">
        <div className="empty-state" style={{ flex: 1 }}>
          <div className="empty-icon">
            <NotebookPen size={20} />
          </div>
          <div className="empty-title">尚未选择论文</div>
          <div className="empty-desc">
            单击论文查看详情，双击进入阅读工作台。
            <br />
            右键论文可以快速创建笔记。
          </div>
        </div>
      </div>
    )
  }

  const paperCategories = categories.filter((c) => paper.categories.includes(c.id))
  const hasNote = Boolean(getNote(paper.id, 'structured') || getNote(paper.id, 'free'))

  const metaRows: { key: keyof Paper; icon: ReactNode; keyName: string; placeholder: string }[] = [
    { key: 'authors', keyName: '作者', icon: <User size={13} />, placeholder: '双击填写作者' },
    { key: 'venue', keyName: '期刊', icon: <Building2 size={13} />, placeholder: '双击填写期刊 / 会议' },
    { key: 'year', keyName: '年份', icon: <Calendar size={13} />, placeholder: '双击填写年份' },
  ]
  // 未识别出来的字段不显示（仅展示已自动提取的信息）
  const visibleMetaRows = metaRows.filter((row) =>
    String(paper[row.key] || '').trim(),
  )

  const confirmAddField = () => {
    const label = fieldLabel.trim()
    if (!label) {
      setAddingField(false)
      return
    }
    addCustomField(paper.id, label)
    setFieldLabel('')
    setAddingField(false)
    toast('已添加信息项', 'success')
  }

  return (
    <div className="lit-detail">
      <div className="lit-detail-body">
        {/* 1. 论文名称（双击编辑） */}
        <TitleEditor
          paper={paper}
          onSave={(title) => {
            updatePaper(paper.id, { title })
          }}
        />

        {/* 2. 三行基本信息：仅显示已自动识别的字段 */}
        {visibleMetaRows.length > 0 && (
          <div className="detail-meta-rows">
            {visibleMetaRows.map((row) => (
              <MetaRow
                key={row.key}
                icon={row.icon}
                label={row.keyName}
                value={String(paper[row.key] || '')}
                placeholder={row.placeholder}
                onSave={(v) => updatePaper(paper.id, { [row.key]: v } as Partial<Paper>)}
              />
            ))}
          </div>
        )}

        {/* 3. 标签 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <button className="tag tag-plain tag-clickable" onClick={onAddTag} title="添加标签">
            <Plus size={11} /> 添加标签
          </button>
          {paper.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
              <button
                className="tag-x"
                title="移除标签"
                onClick={() => removePaperTag(paper.id, t)}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {paperCategories.map((c) => (
            <span key={c.id} className="tag tag-violet" title="所属分类">
              {c.name}
            </span>
          ))}
        </div>

        {/* 4. 分隔线 */}
        <div className="detail-divider" />

        {/* 5. 四个信息框 */}
        <InfoCard
          paperId={paper.id}
          icon={<AlignLeft size={12} />}
          label="摘要"
          value={paper.abstract}
          placeholder="双击编辑论文摘要"
          multiline
          onSave={(v) => updatePaper(paper.id, { abstract: v })}
        />
        <InfoCard
          paperId={paper.id}
          icon={<Quote size={12} />}
          label="引文"
          value={paper.citation}
          placeholder="双击编辑完整引文"
          multiline
          copyable
          onSave={(v) => updatePaper(paper.id, { citation: v })}
        />
        <InfoCard
          paperId={paper.id}
          icon={<Link2 size={12} />}
          label="论文链接"
          value={paper.url}
          placeholder="双击编辑论文链接"
          copyable
          onSave={(v) => updatePaper(paper.id, { url: v })}
        />
        <InfoCard
          paperId={paper.id}
          icon={<Hash size={12} />}
          label="DOI"
          value={paper.doi}
          placeholder="双击编辑 DOI"
          copyable
          onSave={(v) => updatePaper(paper.id, { doi: v })}
        />

        {/* 6. 自定义信息 */}
        {paper.customFields.map((f) => (
          <InfoCard
            key={f.id}
            paperId={paper.id}
            icon={<Plus size={12} />}
            label={f.label}
            value={f.value}
            placeholder={`双击编辑「${f.label}」`}
            multiline
            removable
            onSave={(v) => updateCustomField(paper.id, f.id, { value: v })}
            onRemove={() => removeCustomField(paper.id, f.id)}
          />
        ))}

        {addingField ? (
          <div className="add-field-form">
            <input
              className="input"
              autoFocus
              placeholder="信息名称，如：关键词 / 样本量 / 数据来源"
              value={fieldLabel}
              maxLength={16}
              onChange={(e) => setFieldLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmAddField()
                if (e.key === 'Escape') setAddingField(false)
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAddingField(false)}>
                取消
              </button>
              <button className="btn btn-primary btn-sm" onClick={confirmAddField} disabled={!fieldLabel.trim()}>
                <Check size={13} /> 添加
              </button>
            </div>
          </div>
        ) : (
          <button className="add-info-btn" onClick={() => setAddingField(true)}>
            <Plus size={14} /> 添加信息
          </button>
        )}
      </div>

      <div className="detail-actions">
        <button
          className="btn btn-primary btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={() => navigate(`/reader/${paper.id}`)}
        >
          <BookOpen size={13} /> {hasNote ? '继续阅读' : '开始阅读'}
        </button>
      </div>
    </div>
  )
}

/* 标题行内编辑 */
function TitleEditor({ paper, onSave }: { paper: Paper; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(paper.title)

  useEffect(() => {
    setEditing(false)
    setDraft(paper.title)
  }, [paper.id, paper.title])

  if (editing) {
    return (
      <input
        className="input title-edit"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim()) onSave(draft.trim())
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setDraft(paper.title)
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <h3 className="detail-title" title="双击编辑标题" onDoubleClick={() => setEditing(true)} style={{ cursor: 'text' }}>
      {paper.title}
    </h3>
  )
}

/* 元信息行内编辑 */
function MetaRow({
  icon,
  label,
  value,
  placeholder,
  onSave,
}: {
  icon: ReactNode
  label: string
  value: string
  placeholder: string
  onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setEditing(false)
    setDraft(value)
  }, [value])

  if (editing) {
    return (
      <div className="meta-row is-edit">
        <span className="meta-icon">{icon}</span>
        <input
          className="input meta-edit"
          value={draft}
          autoFocus
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            onSave(draft.trim())
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="meta-row" title="双击编辑" onDoubleClick={() => setEditing(true)} style={{ cursor: 'text' }}>
      <span className="meta-icon">{icon}</span>
      <span className="meta-key">{label}</span>
      <span className={`meta-val ${value ? '' : 'muted'}`}>{value || placeholder}</span>
    </div>
  )
}

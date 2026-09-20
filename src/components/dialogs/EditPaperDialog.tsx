import { useEffect, useState } from 'react'
import { X, Plus } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useLibrary } from '../../store/LibraryContext'
import type { Paper } from '../../types'

interface EditPaperDialogProps {
  open: boolean
  paper: Paper | null
  onClose: () => void
}

/** 论文信息编辑：所有修改即时保存 */
export function EditPaperDialog({ open, paper, onClose }: EditPaperDialogProps) {
  const { updatePaper, tags, categories, addTag, addPaperTag, removePaperTag, togglePaperCategory } =
    useLibrary()
  const [draft, setDraft] = useState<Paper | null>(paper)
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    setDraft(paper)
    setNewTag('')
  }, [paper, open])

  if (!paper || !draft) return null

  const patch = (p: Partial<Paper>) => {
    setDraft((d) => (d ? { ...d, ...p } : d))
    updatePaper(paper.id, p)
  }

  const onAddTag = () => {
    if (!newTag.trim()) return
    addPaperTag(paper.id, newTag)
    addTag(newTag)
    setNewTag('')
  }

  return (
    <Modal
      open={open}
      title="编辑论文信息"
      onClose={onClose}
      large
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          完成
        </button>
      }
    >
      <label className="field-label" style={{ marginTop: 4 }}>
        标题
      </label>
      <input
        className="input"
        value={draft.title}
        onChange={(e) => patch({ title: e.target.value })}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: 10 }}>
        <div>
          <label className="field-label">作者</label>
          <input
            className="input"
            placeholder="多个作者用逗号分隔"
            value={draft.authors}
            onChange={(e) => patch({ authors: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label">期刊 / 会议</label>
          <input
            className="input"
            value={draft.venue}
            onChange={(e) => patch({ venue: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label">年份</label>
          <input
            className="input"
            value={draft.year}
            onChange={(e) => patch({ year: e.target.value })}
          />
        </div>
      </div>

      <label className="field-label">论文简介 / Abstract</label>
      <textarea
        className="textarea"
        rows={3}
        value={draft.abstract}
        onChange={(e) => patch({ abstract: e.target.value })}
      />

      <label className="field-label">引文</label>
      <textarea
        className="textarea"
        rows={3}
        placeholder="填写完整引文，便于日后复制引用"
        value={draft.citation}
        onChange={(e) => patch({ citation: e.target.value })}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label className="field-label">DOI</label>
          <input
            className="input"
            placeholder="10.xxxx/xxxxx"
            value={draft.doi}
            onChange={(e) => patch({ doi: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label">原文链接</label>
          <input
            className="input"
            placeholder="https://…"
            value={draft.url}
            onChange={(e) => patch({ url: e.target.value })}
          />
        </div>
      </div>

      <label className="field-label">标签</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
        {draft.tags.map((t) => (
          <span key={t} className="tag">
            #{t}
            <button className="tag-x" onClick={() => removePaperTag(paper.id, t)} title="移除标签">
              <X size={11} />
            </button>
          </span>
        ))}
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <input
            className="input"
            style={{ width: 130, height: 26, padding: '2px 9px', fontSize: 12, borderRadius: 999 }}
            placeholder="新标签"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onAddTag()
              }
            }}
          />
          <button className="btn-icon" style={{ width: 26, height: 26 }} onClick={onAddTag}>
            <Plus size={13} />
          </button>
        </span>
      </div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {tags
            .filter((t) => !draft.tags.includes(t.name))
            .map((t) => (
              <button
                key={t.id}
                className="tag tag-clickable tag-plain"
                onClick={() => addPaperTag(paper.id, t.name)}
              >
                + #{t.name}
              </button>
            ))}
        </div>
      )}

      <label className="field-label">分类</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {categories.map((c) => {
          const on = draft.categories.includes(c.id)
          return (
            <button
              key={c.id}
              className={`tag tag-clickable ${on ? 'tag-active' : 'tag-plain'}`}
              onClick={() => togglePaperCategory(paper.id, c.id)}
            >
              {c.name}
            </button>
          )
        })}
        {categories.length === 0 && (
          <span className="t-meta">暂无分类，可在左侧新建类别</span>
        )}
      </div>
    </Modal>
  )
}

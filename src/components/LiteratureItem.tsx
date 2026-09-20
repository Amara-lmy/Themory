import { memo, useState } from 'react'
import { Star, StickyNote, NotebookPen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Paper } from '../types'
import { shortAuthors } from '../lib/utils'
import { useLibrary } from '../store/LibraryContext'
import { useToast } from '../store/ToastContext'
import { dragSourceProps, readDragPayload, hasDragKind } from '../store/DragContext'

interface LiteratureItemProps {
  paper: Paper
  selected: boolean
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export const LiteratureItem = memo(function LiteratureItem({
  paper,
  selected,
  onSelect,
  onContextMenu,
}: LiteratureItemProps) {
  const { toggleFavorite, getNote, addPaperTag } = useLibrary()
  const toast = useToast()
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const [dropHot, setDropHot] = useState(false)

  const structured = getNote(paper.id, 'structured')
  const free = getNote(paper.id, 'free')
  const hasNote = Boolean(structured || free)

  const meta = [shortAuthors(paper.authors), paper.venue, paper.year].filter(Boolean).join(' · ')

  const onDragOver = (e: React.DragEvent) => {
    // dragover 阶段 getData() 受限，用 types + 全局拖拽状态判断（见 DragContext.hasDragKind）
    if (hasDragKind(e, 'tag')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      if (!dropHot) setDropHot(true)
    }
  }
  const onDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropHot(false)
  }
  const onDrop = (e: React.DragEvent) => {
    const payload = readDragPayload(e)
    setDropHot(false)
    if (payload?.kind === 'tag') {
      e.preventDefault()
      e.stopPropagation()
      if (paper.tags.some((t) => t.toLowerCase() === payload.name.toLowerCase())) {
        toast(`该论文已带有 #${payload.name}`, 'info')
      } else {
        addPaperTag(paper.id, payload.name)
        toast(`已添加标签 #${payload.name}`, 'success')
      }
    }
  }

  return (
    <div
      className={`lit-item ${selected ? 'selected' : ''} ${dragging ? 'drag-source' : ''} ${dropHot ? 'drop-hot' : ''}`}
      onClick={onSelect}
      onDoubleClick={() => navigate(`/reader/${paper.id}`)}
      onContextMenu={onContextMenu}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      {...dragSourceProps({ kind: 'paper', id: paper.id })}
      onDragStartCapture={() => setDragging(true)}
      onDragEndCapture={() => {
        setDragging(false)
        setDropHot(false)
      }}
    >
      <div className="lit-item-title" title={paper.title}>
        {paper.title}
      </div>
      {meta && <div className="lit-item-meta">{meta}</div>}
      {paper.tags.length > 0 && (
        <div className="lit-item-tags">
          {paper.tags.slice(0, 4).map((t) => (
            <span key={t} className="tag tag-plain">
              #{t}
            </span>
          ))}
          {paper.tags.length > 4 && (
            <span className="tag tag-plain">+{paper.tags.length - 4}</span>
          )}
        </div>
      )}
      <div className="lit-item-foot">
        <button
          className={`lit-note-badge ${hasNote ? 'has-note' : ''}`}
          title={hasNote ? '打开阅读笔记' : '前往阅读工作台'}
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/reader/${paper.id}`)
          }}
        >
          {hasNote ? <NotebookPen size={13} /> : <StickyNote size={13} />}
          {hasNote ? '已有笔记' : '暂无笔记'}
        </button>
        <button
          className={`lit-fav ${paper.favorite ? 'faved' : ''}`}
          title={paper.favorite ? '取消收藏' : '收藏'}
          onClick={(e) => {
            e.stopPropagation()
            toggleFavorite(paper.id)
          }}
        >
          <Star size={15} fill={paper.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>
  )
})

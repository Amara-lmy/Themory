import { useNavigate } from 'react-router-dom'
import { FileText, StickyNote } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useLibrary } from '../../store/LibraryContext'
import { useToast } from '../../store/ToastContext'

interface CreateNoteDialogProps {
  open: boolean
  onClose: () => void
  paperId: string | null
}

/** 新建阅读笔记：选择结构化 / 自由 */
export function CreateNoteDialog({ open, onClose, paperId }: CreateNoteDialogProps) {
  const { getNote, createNote } = useLibrary()
  const toast = useToast()
  const navigate = useNavigate()

  if (!paperId) return null

  const structuredNote = getNote(paperId, 'structured')
  const freeNote = getNote(paperId, 'free')

  const choose = (type: 'structured' | 'free') => {
    const existing = getNote(paperId, type)
    if (existing) {
      // 已存在：直接打开已有笔记
      onClose()
      navigate(`/reader/${paperId}?note=${type}`)
      return
    }
    createNote(paperId, type)
    onClose()
    navigate(`/reader/${paperId}?note=${type}`)
  }

  return (
    <Modal open={open} title="新建阅读笔记" onClose={onClose}>
      <div className="t-meta" style={{ marginBottom: 4 }}>
        为当前选中的论文创建笔记
      </div>
      <div className="choice-cards">
        <button className="choice-card" onClick={() => choose('structured')}>
          <span className="cc-icon">
            <FileText size={17} />
          </span>
          <span className="cc-title">结构化笔记</span>
          <span className="cc-desc">
            按照研究目的、方法、发现、局限等维度整理论文内容。
            {structuredNote && '（已存在，将直接打开）'}
          </span>
        </button>
        <button className="choice-card" onClick={() => choose('free')}>
          <span className="cc-icon">
            <StickyNote size={17} />
          </span>
          <span className="cc-title">自由笔记</span>
          <span className="cc-desc">
            自由记录阅读过程中产生的想法、理解和灵感。
            {freeNote && '（已存在，将直接打开）'}
          </span>
        </button>
      </div>
      {structuredNote && freeNote && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--danger)' }}>
          该论文已存在结构化笔记和自由笔记，不能再创建第三篇。
        </div>
      )}
    </Modal>
  )
}

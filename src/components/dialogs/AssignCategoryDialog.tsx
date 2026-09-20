import { Check } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useLibrary } from '../../store/LibraryContext'

interface AssignCategoryDialogProps {
  open: boolean
  paperId: string | null
  onClose: () => void
}

/** 将论文纳入分类（可多选） */
export function AssignCategoryDialog({ open, paperId, onClose }: AssignCategoryDialogProps) {
  const { categories, papers, togglePaperCategory } = useLibrary()
  const paper = papers.find((p) => p.id === paperId)
  if (!paper) return null

  return (
    <Modal open={open} title="将论文纳入分类" onClose={onClose}>
      {categories.length === 0 && (
        <div className="empty-state">
          <div className="empty-title">还没有分类</div>
          <div className="empty-desc">请在左侧「我的分类」中先新建类别。</div>
        </div>
      )}
      {categories.map((c) => {
        const on = paper.categories.includes(c.id)
        return (
          <div
            key={c.id}
            className={`check-row ${on ? 'on' : ''}`}
            onClick={() => togglePaperCategory(paper.id, c.id)}
          >
            <span className="checkbox">{on && <Check size={12} />}</span>
            {c.name}
          </div>
        )
      })}
      <div className="t-meta" style={{ marginTop: 6 }}>
        可选择一个或多个分类，修改立即生效。
      </div>
    </Modal>
  )
}

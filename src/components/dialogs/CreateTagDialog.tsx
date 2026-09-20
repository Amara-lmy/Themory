import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { useLibrary } from '../../store/LibraryContext'

interface CreateTagDialogProps {
  open: boolean
  onClose: () => void
  /** 若提供，则在创建/选择标签时同时为该论文添加标签 */
  paperId?: string
}

/** 新建标签 / 给论文添加标签 */
export function CreateTagDialog({ open, onClose, paperId }: CreateTagDialogProps) {
  const { tags, addTag, addPaperTag } = useLibrary()
  const [name, setName] = useState('')

  useEffect(() => {
    if (open) setName('')
  }, [open])

  const apply = (tagName: string) => {
    const trimmed = tagName.trim().replace(/^#/, '')
    if (!trimmed) return
    if (paperId) addPaperTag(paperId, trimmed)
    else addTag(trimmed)
    onClose()
  }

  // 未关联论文时（侧栏新增标签），显示已有标签可点击删除
  const { deleteTag } = useLibrary()

  return (
    <Modal
      open={open}
      title={paperId ? '添加标签' : '新增标签'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => apply(name)} disabled={!name.trim()}>
            确定
          </button>
        </>
      }
    >
      <label className="field-label" style={{ marginTop: 4 }}>
        输入标签
      </label>
      <input
        className="input"
        autoFocus
        placeholder="例如：定性研究"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply(name)
        }}
      />
      {tags.length > 0 && (
        <>
          <label className="field-label">已有标签{paperId ? '，点击直接添加' : ''}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {tags.map((t) =>
              paperId ? (
                <button
                  key={t.id}
                  className="tag tag-clickable"
                  onClick={() => apply(t.name)}
                  title={`添加 #${t.name}`}
                >
                  #{t.name}
                </button>
              ) : (
                <button
                  key={t.id}
                  className="tag tag-clickable tag-plain"
                  onClick={() => deleteTag(t.id)}
                  title="点击删除该标签"
                >
                  #{t.name} ×
                </button>
              ),
            )}
          </div>
        </>
      )}
    </Modal>
  )
}

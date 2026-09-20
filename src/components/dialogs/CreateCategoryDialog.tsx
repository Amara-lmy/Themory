import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { useLibrary } from '../../store/LibraryContext'

interface CreateCategoryDialogProps {
  open: boolean
  onClose: () => void
}

export function CreateCategoryDialog({ open, onClose }: CreateCategoryDialogProps) {
  const { addCategory } = useLibrary()
  const [name, setName] = useState('')

  useEffect(() => {
    if (open) setName('')
  }, [open])

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    addCategory(trimmed)
    onClose()
  }

  return (
    <Modal
      open={open}
      title="新建类别"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!name.trim()}>
            创建
          </button>
        </>
      }
    >
      <label className="field-label" style={{ marginTop: 4 }}>
        类别名称
      </label>
      <input
        className="input"
        autoFocus
        placeholder="例如：AI辅助研究"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
      />
    </Modal>
  )
}

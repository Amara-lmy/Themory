import { AlertTriangle } from 'lucide-react'
import { Modal } from '../ui/Modal'

interface DeleteConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}

export function DeleteConfirmDialog({ open, onClose, onConfirm }: DeleteConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title="删除论文？"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            删除
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'var(--danger-tint)',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 36px',
          }}
        >
          <AlertTriangle size={18} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
          删除后，该论文及其关联笔记将从文献库中移除。
        </div>
      </div>
    </Modal>
  )
}

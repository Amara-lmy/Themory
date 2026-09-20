import { useRef, useState } from 'react'
import { FileUp, CheckCircle2, XCircle, Link2, Loader2, Sparkles } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useLibrary } from '../../store/LibraryContext'
import { useToast } from '../../store/ToastContext'

interface ImportResult {
  name: string
  ok: boolean
  message?: string
}

interface ImportFileDialogProps {
  open: boolean
  onClose: () => void
  onImported?: () => void
}

type Tab = 'file' | 'link'

export function ImportFileDialog({ open, onClose, onImported }: ImportFileDialogProps) {
  const { uploadPaper, importFromUrl } = useLibrary()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('file')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<ImportResult[]>([])
  const [url, setUrl] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)

  const reset = () => {
    setResults([])
    setDragging(false)
    setUrl('')
    setTab('file')
  }

  const close = () => {
    reset()
    onClose()
  }

  const importFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const supported = ['pdf', 'doc', 'docx']
    if (!supported.includes(ext)) {
      setResults((prev) => [...prev, { name: file.name, ok: false, message: '仅支持 PDF / DOC / DOCX 文件' }])
      return
    }
    setUploading(true)
    try {
      const paper = await uploadPaper(file)
      if (paper) {
        const auto: string[] = []
        if (paper.authors) auto.push('作者')
        if (paper.venue) auto.push('期刊')
        if (paper.year) auto.push('年份')
        setResults((prev) => [
          ...prev,
          {
            name: paper.title || file.name,
            ok: true,
            message: auto.length ? `已自动识别：${auto.join('、')}` : '已导入（未识别到元数据）',
          },
        ])
        if (auto.length) toast(`已自动识别 ${auto.join('、')}`, 'success')
        onImported?.()
      } else {
        setResults((prev) => [...prev, { name: file.name, ok: false, message: '上传失败' }])
      }
    } catch {
      setResults((prev) => [...prev, { name: file.name, ok: false, message: '上传失败，请重试' }])
    } finally {
      setUploading(false)
    }
  }

  const importFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      await importFile(f)
    }
  }

  const handleImportUrl = async () => {
    const u = url.trim()
    if (!u || linkLoading) return
    setLinkLoading(true)
    const result = await importFromUrl(u)
    setLinkLoading(false)
    if (result.paper) {
      const p = result.paper
      const auto: string[] = []
      if (p.authors) auto.push('作者')
      if (p.venue) auto.push('期刊')
      if (p.year) auto.push('年份')
      setResults((prev) => [
        ...prev,
        {
          name: p.title,
          ok: true,
          message: auto.length ? `已自动识别：${auto.join('、')}` : '已导入',
        },
      ])
      toast('链接导入成功', 'success')
      setUrl('')
      onImported?.()
    } else {
      toast(result.error || '识别失败', 'error')
    }
  }

  return (
    <Modal
      open={open}
      title="导入文献"
      onClose={close}
      footer={
        <>
          <button className="btn btn-secondary" onClick={close}>
            完成
          </button>
        </>
      }
    >
      {/* Tab 切换 */}
      <div className="import-tabs">
        <button
          className={`import-tab ${tab === 'file' ? 'active' : ''}`}
          onClick={() => setTab('file')}
        >
          <FileUp size={14} /> 上传文档
        </button>
        <button
          className={`import-tab ${tab === 'link' ? 'active' : ''}`}
          onClick={() => setTab('link')}
        >
          <Link2 size={14} /> 链接导入
        </button>
      </div>

      {tab === 'file' ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) importFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <div
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onClick={() => !uploading && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              setDragging(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              if (e.dataTransfer.files?.length) importFiles(e.dataTransfer.files)
            }}
          >
            <div className="dz-icon">
              {uploading ? <Loader2 size={22} className="spin" /> : <FileUp size={22} />}
            </div>
            <div className="dz-main">{uploading ? '正在上传并识别…' : '选择 PDF / Word 文件或拖拽到此处'}</div>
            <div className="dz-sub">
              <Sparkles size={11} style={{ verticalAlign: '-1px', marginRight: 3 }} />
              PDF 自动识别元数据；上传后可在阅读器中 AI 问答
            </div>
          </div>
        </>
      ) : (
        <div className="import-link-box">
          <div className="login-field" style={{ marginBottom: 12 }}>
            <Link2 size={16} className="login-field-icon" />
            <input
              className="login-input"
              style={{ padding: '12px 0' }}
              placeholder="粘贴论文链接、DOI（如 10.xxxx/xxxx）或 arXiv 链接"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleImportUrl()
              }}
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={!url.trim() || linkLoading}
            onClick={handleImportUrl}
          >
            {linkLoading ? (
              <>
                <Loader2 size={14} className="spin" /> 正在识别论文信息…
              </>
            ) : (
              <>
                <Sparkles size={14} /> 识别并导入
              </>
            )}
          </button>
          <div className="t-meta" style={{ marginTop: 10, fontSize: 12, textAlign: 'center' }}>
            支持 DOI 链接、arXiv、ACM / IEEE / Springer 等期刊会议页面
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {results.map((r, i) => (
            <div className="import-result" key={i}>
              {r.ok ? (
                <span className="ir-ok">
                  <CheckCircle2 size={15} />
                </span>
              ) : (
                <span className="ir-err">
                  <XCircle size={15} />
                </span>
              )}
              <span className="ir-name" title={r.name}>
                {r.name}
              </span>
              <span className="t-meta">{r.message || (r.ok ? '已导入' : '导入失败')}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

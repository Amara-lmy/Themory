import { useEffect, useRef, useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import type { Paper } from '../../types'
import { copyText } from '../../lib/utils'
import { useLibrary } from '../../store/LibraryContext'
import { useToast } from '../../store/ToastContext'

interface SourcePanelProps {
  paper: Paper
}

/** 文献来源：引文 / DOI / 原文链接，全部可编辑、自动保存 */
export function SourcePanel({ paper }: SourcePanelProps) {
  const { updatePaper } = useLibrary()
  const toast = useToast()

  const [citation, setCitation] = useState(paper.citation)
  const [doi, setDoi] = useState(paper.doi)
  const [url, setUrl] = useState(paper.url)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // 外部变化（如编辑弹窗修改）同步进来
  useEffect(() => setCitation(paper.citation), [paper.citation])
  useEffect(() => setDoi(paper.doi), [paper.doi])
  useEffect(() => setUrl(paper.url), [paper.url])

  const scheduleSave = (patch: Partial<Paper>) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => updatePaper(paper.id, patch), 400)
  }

  const copyCitation = async () => {
    if (!paper.citation) return toast('请先填写引文。', 'error')
    ;(await copyText(paper.citation))
      ? toast('引文已复制到剪贴板', 'success')
      : toast('复制失败，请手动复制', 'error')
  }

  const copyDoi = async () => {
    if (!paper.doi) return toast('请先填写 DOI。', 'error')
    ;(await copyText(paper.doi))
      ? toast('DOI 已复制到剪贴板', 'success')
      : toast('复制失败，请手动复制', 'error')
  }

  const openUrl = () => {
    if (!paper.url) return toast('请先填写原文链接。', 'error')
    const full = /^https?:\/\//i.test(paper.url) ? paper.url : `https://${paper.url}`
    window.open(full, '_blank', 'noreferrer')
  }

  return (
    <div className="source-body">
      <div className="source-block">
        <div className="source-block-head">
          <span className="source-label">引文 Citation</span>
          <button className="mini-btn" onClick={copyCitation}>
            <Copy size={11} /> 复制引文
          </button>
        </div>
        <textarea
          className="source-input"
          rows={4}
          placeholder="粘贴或撰写这条文献的完整引文…"
          value={citation}
          onChange={(e) => {
            setCitation(e.target.value)
            scheduleSave({ citation: e.target.value })
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
          }}
        />
      </div>

      <div className="source-block">
        <div className="source-block-head">
          <span className="source-label">DOI</span>
          <button className="mini-btn" onClick={copyDoi}>
            <Copy size={11} /> 复制 DOI
          </button>
        </div>
        <input
          className="source-input"
          placeholder="10.xxxx/xxxxx"
          value={doi}
          onChange={(e) => {
            setDoi(e.target.value)
            scheduleSave({ doi: e.target.value })
          }}
        />
      </div>

      <div className="source-block">
        <div className="source-block-head">
          <span className="source-label">原文链接 URL</span>
          <button className="mini-btn" onClick={openUrl}>
            <ExternalLink size={11} /> 打开原文
          </button>
        </div>
        <input
          className="source-input"
          placeholder="https://doi.org/…"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            scheduleSave({ url: e.target.value })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') openUrl()
          }}
        />
      </div>

      <div className="t-meta" style={{ padding: '0 2px' }}>
        以上信息由你自己维护，修改会自动保存。
      </div>
    </div>
  )
}

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import type { Paper } from '../../types'
import { copyText } from '../../lib/utils'
import { useToast } from '../../store/ToastContext'

/** PDF 阅读区右下角：复制引文悬浮图标（悬停显示引文详情） */
export function CiteBar({ paper }: { paper: Paper }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  const doCopy = async () => {
    if (!paper.citation) {
      toast('尚未填写引文，可在首页论文详情中补充', 'error')
      return
    }
    const ok = await copyText(paper.citation)
    if (ok) {
      setCopied(true)
      toast('引文已复制', 'success')
      setTimeout(() => setCopied(false), 1600)
    } else {
      toast('复制失败，请手动复制', 'error')
    }
  }

  return (
    <div className="cite-fab-wrap">
      {/* 悬停显示引文详情 */}
      <div className="cite-pop" role="tooltip">
        <div className="cite-pop-head">引文</div>
        {paper.citation ? (
          <div className="cite-pop-text">{paper.citation}</div>
        ) : (
          <div className="cite-pop-empty">尚未填写引文，可在首页论文详情中补充</div>
        )}
      </div>
      <button className={`cite-fab ${copied ? 'copied' : ''}`} onClick={doCopy} title="复制引文">
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  )
}

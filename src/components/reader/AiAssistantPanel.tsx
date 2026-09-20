import { useEffect, useRef, useState } from 'react'
import { Send, Sparkles, X, ImagePlus, Loader2 } from 'lucide-react'
import type { Paper } from '../../types'
import { chatWithAi, analyzeChartWithAi } from '../../lib/ai'
import { uid } from '../../lib/utils'

interface AiAssistantPanelProps {
  paper: Paper
  onClose: () => void
}

interface ChatItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** 用户消息附带的图表（data URI），存在时该轮走 qwen-vl-plus 多模态分析 */
  image?: string
}

interface PendingImage {
  dataUrl: string
  name: string
}

/** 将图片文件压缩到最长边 1280 的 JPEG data URI，控制视觉 token 与上传体积 */
function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件（PNG / JPG / WebP / GIF）'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('图片解析失败'))
      img.onload = () => {
        const MAX_EDGE = 1280
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('图片处理失败'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/** AI 研究助手窗口（论文问答走 qwen-plus；附图分析图表时才走 qwen-vl-plus） */
export function AiAssistantPanel({ paper, onClose }: AiAssistantPanelProps) {
  const [items, setItems] = useState<ChatItem[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const aliveRef = useRef(true)

  // 打开窗口时弹出欢迎消息
  useEffect(() => {
    aliveRef.current = true
    setItems([{ id: uid(), role: 'assistant', content: '我是你的AI研究助手，有什么疑问都可以尽管问我；点击下方图片图标上传图表，我可以帮你分析图表。' }])
    return () => {
      aliveRef.current = false
    }
  }, [])

  // 新消息 / 加载时滚到底部
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items, loading])

  const pickImageFile = async (file: File | undefined | null) => {
    if (!file) return
    try {
      const dataUrl = await fileToCompressedDataUrl(file)
      setPendingImage({ dataUrl, name: file.name || '剪贴板图片' })
    } catch (e) {
      setItems((cur) => [
        ...cur,
        { id: uid(), role: 'assistant', content: (e as Error)?.message || '图片处理失败，请换一张试试' },
      ])
    }
  }

  const send = async () => {
    const text = input.trim()
    const image = pendingImage?.dataUrl
    if ((!text && !image) || loading) return
    const next: ChatItem[] = [
      ...items,
      { id: uid(), role: 'user', content: text, ...(image ? { image } : {}) },
    ]
    setItems(next)
    setInput('')
    setPendingImage(null)
    setLoading(true)
    try {
      let reply: string
      if (image) {
        // 仅附图时调用多模态 qwen-vl-plus
        reply = await analyzeChartWithAi({ paperId: paper.id, image, question: text || undefined })
      } else {
        reply = await chatWithAi(
          next.map(({ role, content }) => ({ role, content })),
          {
            title: paper.title,
            authors: paper.authors,
            venue: paper.venue,
            year: paper.year,
            paperId: paper.id,
          },
        )
      }
      if (aliveRef.current) {
        setItems((cur) => [...cur, { id: uid(), role: 'assistant', content: reply }])
      }
    } catch (e) {
      if (aliveRef.current) {
        setItems((cur) => [
          ...cur,
          {
            id: uid(),
            role: 'assistant',
            content: (e as Error)?.message || '抱歉，回答生成失败，请稍后再试。',
          },
        ])
      }
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }

  return (
    <div className="ai-panel">
      <div className="ai-head">
        <span className="ai-head-icon">
          <Sparkles size={14} />
        </span>
        <div className="ai-head-text">
          <span className="ai-head-title">AI 研究助手</span>
          <span className="ai-head-sub" title={paper.title}>
            当前论文：{paper.title}
          </span>
        </div>
        <button className="btn-icon" title="关闭" onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      <div className="ai-msgs" ref={listRef}>
        {items.map((m) => (
          <div key={m.id} className={`ai-msg ${m.role === 'user' ? 'ai-msg-user' : 'ai-msg-ai'}`}>
            {m.image && <img className="ai-msg-image" src={m.image} alt="待分析图表" />}
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="ai-msg ai-msg-ai ai-typing" title="AI 正在思考…">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      {pendingImage && (
        <div className="ai-image-preview">
          <img src={pendingImage.dataUrl} alt="待发送图表" />
          <span className="ai-image-preview-name" title={pendingImage.name}>{pendingImage.name}</span>
          <span className="ai-image-preview-badge">图表分析 · qwen-vl</span>
          <button
            className="ai-image-preview-remove"
            title="移除图片"
            onClick={() => setPendingImage(null)}
            disabled={loading}
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="ai-input-row">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={(e) => {
            pickImageFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <button
          className="ai-attach"
          title="上传图表截图进行分析（也可直接粘贴图片）"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
        >
          <ImagePlus size={15} />
        </button>
        <input
          className="ai-input"
          placeholder={pendingImage ? '问点关于这张图表的问题（可不填），回车发送…' : '针对当前论文提问，回车发送；可粘贴/上传图表…'}
          value={input}
          disabled={loading}
          onChange={(e) => setInput(e.target.value)}
          onPaste={(e) => {
            const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith('image/'))
            if (f) {
              e.preventDefault()
              pickImageFile(f)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) send()
          }}
        />
        <button
          className="ai-send"
          title="发送"
          disabled={loading || (!input.trim() && !pendingImage)}
          onClick={send}
        >
          {loading ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  ChevronLeft,
  ChevronRight,
  FileWarning,
  Loader2,
  Maximize2,
  Minus,
  Plus,
} from 'lucide-react'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

interface PdfViewerProps {
  url: string
  lastReadPage: number
  onPageChange: (page: number) => void
}

interface PageDim {
  w: number
  h: number
}

export function PdfViewer({ url, lastReadPage, onPageChange }: PdfViewerProps) {
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [currentPage, setCurrentPage] = useState(lastReadPage)
  const [dims, setDims] = useState<PageDim[]>([])

  const scrollRef = useRef<HTMLDivElement>(null)
  const restoredRef = useRef(false)

  // 加载文档
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setDoc(null)
    setDims([])
    restoredRef.current = false

    const task = pdfjsLib.getDocument({ url })
    task.promise
      .then(async (d) => {
        if (cancelled) return
        setDoc(d)
        // 读取每页尺寸（用于占位布局，保证滚动位置稳定）
        const list: PageDim[] = []
        for (let i = 1; i <= d.numPages; i++) {
          const page = await d.getPage(i)
          const vp = page.getViewport({ scale: 1 })
          list.push({ w: vp.width, h: vp.height })
        }
        if (!cancelled) {
          setDims(list)
          setLoading(false)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const err = e as { name?: string; message?: string }
          console.error('PDF load error:', err?.name, err?.message, e)
          setError(`PDF 加载失败（${err?.name || '未知错误'}），请重新导入文件。`)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      task.destroy()
    }
  }, [url])

  // 适应宽度基准
  const [containerW, setContainerW] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth))
    ro.observe(el)
    setContainerW(el.clientWidth)
    return () => ro.disconnect()
  }, [doc])

  const baseScale = useMemo(() => {
    if (!dims.length || !containerW) return 1
    const avail = containerW - 48
    return avail / dims[0].w
  }, [dims, containerW])

  // 恢复上次阅读位置
  useEffect(() => {
    if (!doc || !dims.length || restoredRef.current || !scrollRef.current) return
    const target = Math.min(Math.max(lastReadPage, 1), doc.numPages)
    const slot = scrollRef.current.querySelector(`[data-page="${target}"]`) as HTMLElement | null
    if (slot) {
      scrollRef.current.scrollTop = Math.max(slot.offsetTop - 12, 0)
      setCurrentPage(target)
      restoredRef.current = true
    }
  }, [doc, dims, lastReadPage])

  // 滚动跟踪当前页：同步计算 + 轻量轮询兜底（部分环境 scroll 事件不派发）
  const computeCurrent = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const slots = el.querySelectorAll<HTMLElement>('[data-page]')
    let current = 1
    for (const s of slots) {
      if (s.offsetTop <= el.scrollTop + 90) {
        current = Number(s.dataset.page)
      } else break
    }
    setCurrentPage((prev) => (prev === current ? prev : current))
  }, [])

  const onScroll = computeCurrent

  useEffect(() => {
    const id = setInterval(computeCurrent, 600)
    return () => clearInterval(id)
  }, [computeCurrent])

  useEffect(() => {
    onPageChange(currentPage)
  }, [currentPage]) // eslint-disable-line react-hooks/exhaustive-deps

  const jumpTo = (page: number) => {
    const el = scrollRef.current
    if (!el || !doc) return
    const target = Math.min(Math.max(page, 1), doc.numPages)
    const slot = el.querySelector(`[data-page="${target}"]`) as HTMLElement | null
    if (slot) el.scrollTop = Math.max(slot.offsetTop - 12, 0)
  }

  if (error) {
    return (
      <div className="pdf-wrap">
        <div className="pdf-error">
          <div className="empty-state">
            <div className="empty-icon">
              <FileWarning size={20} />
            </div>
            <div className="empty-title">无法加载 PDF</div>
            <div className="empty-desc">{error}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pdf-wrap">
      <div className="pdf-toolbar">
        <button className="btn-icon" onClick={() => jumpTo(currentPage - 1)} disabled={!doc || currentPage <= 1} title="上一页">
          <ChevronLeft size={16} />
        </button>
        <span className="pdf-page-ind">
          {loading ? '加载中…' : `${currentPage} / ${doc?.numPages ?? '—'}`}
        </span>
        <button
          className="btn-icon"
          onClick={() => jumpTo(currentPage + 1)}
          disabled={!doc || !doc || currentPage >= doc.numPages}
          title="下一页"
        >
          <ChevronRight size={16} />
        </button>
        <input
          className="pdf-page-input"
          title="跳转到指定页"
          placeholder="页"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = parseInt((e.target as HTMLInputElement).value, 10)
              if (!Number.isNaN(v)) jumpTo(v)
              ;(e.target as HTMLInputElement).value = ''
            }
          }}
        />
        <div style={{ flex: 1 }} />
        <button className="btn-icon" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} title="缩小">
          <Minus size={15} />
        </button>
        <span className="pdf-page-ind" style={{ minWidth: 46, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button className="btn-icon" onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))} title="放大">
          <Plus size={15} />
        </button>
        <button className="btn-icon" onClick={() => setZoom(1)} title="适应宽度">
          <Maximize2 size={14} />
        </button>
      </div>

      {loading && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: 'var(--text-3)',
            fontSize: 13,
          }}
        >
          <Loader2 size={16} className="spin" />
          正在加载 PDF…
        </div>
      )}

      <div
        ref={scrollRef}
        className="pdf-scroll"
        onScroll={onScroll}
        style={{ display: loading ? 'none' : 'block' }}
      >
        {doc &&
          Array.from({ length: doc.numPages }, (_, i) => i + 1).map((num) => {
            const dim = dims[num - 1]
            const w = dim ? dim.w * baseScale * zoom : 640
            const h = dim ? dim.h * baseScale * zoom : 860
            return (
              <PageItem
                key={num}
                doc={doc}
                num={num}
                width={Math.floor(w)}
                height={Math.floor(h)}
              />
            )
          })}
      </div>
    </div>
  )
}

function PageItem({
  doc,
  num,
  width,
  height,
}: {
  doc: pdfjsLib.PDFDocumentProxy
  num: number
  width: number
  height: number
}) {
  const [visible, setVisible] = useState(false)
  const slotRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = slotRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true)
      },
      { rootMargin: '700px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let layerEl: HTMLDivElement | null = null
    const render = async () => {
      const page = await doc.getPage(num)
      if (cancelled) return
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width })
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      await page.render({
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      }).promise
      if (cancelled) return

      // 文本层：叠在画布上方提供可选中/可划词的真实文字
      layerEl = document.createElement('div')
      layerEl.className = 'pdf-text-layer'
      layerEl.style.setProperty('--scale-factor', String(viewport.scale))
      slotRef.current?.appendChild(layerEl)
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: page.streamTextContent(),
        container: layerEl,
        viewport,
      })
      await textLayer.render()
    }
    render().catch((e) => {
      console.warn('page render failed', e)
      layerEl?.remove()
      layerEl = null
    })
    return () => {
      cancelled = true
      layerEl?.remove()
      layerEl = null
    }
  }, [visible, doc, num, width])

  return (
    <div ref={slotRef} data-page={num} className="pdf-page-slot" style={{ width, height }}>
      <canvas ref={canvasRef} />
      {!visible && <div className="pdf-loading">第 {num} 页</div>}
    </div>
  )
}

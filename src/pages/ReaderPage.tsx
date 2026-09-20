import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, ExternalLink, FileText } from 'lucide-react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useLibrary } from '../store/LibraryContext'
import { getFile } from '../lib/filedb'
import { api } from '../lib/api'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { Drawer } from '../components/ui/Drawer'
import { PdfViewer } from '../components/reader/PdfViewer'
import { CiteBar } from '../components/reader/CiteBar'
import { NotePanel } from '../components/reader/NotePanel'
import { AiAssistantPanel } from '../components/reader/AiAssistantPanel'
import { SelectionTranslate } from '../components/reader/SelectionTranslate'
import { useSettings } from '../store/SettingsContext'
import type { NoteType } from '../types'

export function ReaderPage() {
  const { paperId } = useParams()
  const navigate = useNavigate()
  const { papers, getNote, updatePaper } = useLibrary()
  const [searchParams] = useSearchParams()
  const isSmall = useMediaQuery('(max-width: 1100px)')
  const [noteDrawerOpen, setNoteDrawerOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const { settings } = useSettings()

  const paper = useMemo(() => papers.find((p) => p.id === paperId), [papers, paperId])

  // 当前展示的笔记类型
  const activeType: NoteType = useMemo(() => {
    const param = searchParams.get('note')
    if (param === 'structured' || param === 'free') return param
    if (paperId) {
      if (getNote(paperId, 'structured')) return 'structured'
      if (getNote(paperId, 'free')) return 'free'
    }
    return 'structured'
  }, [searchParams, paperId]) // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveType = (t: NoteType) => {
    navigate(`/reader/${paperId}?note=${t}`, { replace: true })
  }

  // PDF 文件对象 URL
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setFileUrl(null)
    setFileError(null)
    if (!paper) return

    const useBlob = (blob: Blob) => {
      if (cancelled) return
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setFileUrl(url)
    }

    // 1. 先找本地 IndexedDB（兼容旧数据 / 本地模式）
    getFile(paper.fileKey)
      .then(async (file) => {
        if (cancelled) return
        if (file) {
          useBlob(file)
          return
        }
        // 2. 本地没有且有关联文件 → 从服务器鉴权拉取
        if (paper.fileKey) {
          const blob = await api.fetchBlob(`/api/papers/${paper.id}/file`)
          if (cancelled) return
          if (blob) {
            useBlob(blob)
          } else {
            setFileError('文件加载失败，可能已被删除，请重新导入。')
          }
        } else if (paper.url) {
          // 3. 链接导入、无本地文件
          setFileError('__LINK_ONLY__')
        } else {
          setFileError('该论文没有关联的 PDF 文件。')
        }
      })
      .catch(() => {
        if (!cancelled) setFileError('文件读取失败，请重新导入。')
      })
    return () => {
      cancelled = true
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [paper?.fileKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // 阅读位置记忆（防抖保存，可在设置中关闭）
  const pageTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const handlePageChange = (page: number) => {
    if (!paper || !settings.rememberPosition) return
    clearTimeout(pageTimer.current)
    pageTimer.current = setTimeout(() => {
      if (paper.lastReadPage !== page) updatePaper(paper.id, { lastReadPage: page })
    }, 800)
  }

  if (!paper) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <div className="empty-title" style={{ fontWeight: 600 }}>
          论文不存在或已被删除
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          返回文献库
        </button>
      </div>
    )
  }

  // PDF 阅读面板：返回按钮 + 文件信息 + PDF + 下方固定引文条
  const pdfPane = (
    <div className="reader-pane">
      <div className="pane-header">
        <button className="btn-icon reader-back" title="返回文献库" onClick={() => navigate('/')}>
          <ArrowLeft size={16} />
        </button>
        <span className="pane-title">
          <FileText size={14} />
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={paper.fileName}
          >
            {paper.fileName}
          </span>
        </span>
        {settings.rememberPosition && paper.lastReadPage > 1 && (
          <span className="t-meta" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            上次读到第 {paper.lastReadPage} 页
          </span>
        )}
        {isSmall && (
          <button
            className="btn btn-primary btn-sm"
            style={{ marginLeft: settings.rememberPosition && paper.lastReadPage > 1 ? 8 : 'auto' }}
            onClick={() => setNoteDrawerOpen(true)}
          >
            <BookOpen size={14} />
            笔记
          </button>
        )}
      </div>
      {fileError ? (
        <div className="pdf-error">
          <div className="empty-state">
            {fileError === '__LINK_ONLY__' ? (
              <>
                <div className="empty-title">该文献通过链接导入</div>
                <div className="empty-desc">平台未保存 PDF 文件，请前往原文页面阅读。</div>
                {paper.url && (
                  <a
                    className="btn btn-primary btn-sm"
                    style={{ marginTop: 12 }}
                    href={/^https?:\/\//i.test(paper.url) ? paper.url : `https://${paper.url}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={13} /> 打开原文链接
                  </a>
                )}
              </>
            ) : (
              <>
                <div className="empty-title">无法加载 PDF</div>
                <div className="empty-desc">{fileError}</div>
              </>
            )}
          </div>
          <CiteBar paper={paper} />
        </div>
      ) : fileUrl ? (
        <>
          <PdfViewer
            url={fileUrl}
            lastReadPage={settings.rememberPosition ? paper.lastReadPage : 1}
            onPageChange={handlePageChange}
          />
          <CiteBar paper={paper} />
        </>
      ) : (
        <div className="pdf-error">
          <div className="t-meta">正在读取本地文件…</div>
        </div>
      )}
    </div>
  )

  const notePanelNode = (
    <NotePanel paper={paper} activeType={activeType} onActiveTypeChange={setActiveType} aiOpen={aiOpen} onToggleAi={() => setAiOpen((v) => !v)} />
  )

  // 左侧区域：PDF 在上，AI 助手窗口可停靠在下方（上下拖拽调整高度，默认 45%）
  const leftRegion = (
    <PanelGroup direction="vertical">
      <Panel defaultSize={aiOpen ? 55 : 100} minSize={30}>
        {pdfPane}
      </Panel>
      {aiOpen && (
        <>
          <PanelResizeHandle className="resizer resizer-vertical" />
          <Panel defaultSize={45} minSize={15} maxSize={70}>
            <AiAssistantPanel paper={paper} onClose={() => setAiOpen(false)} />
          </Panel>
        </>
      )}
    </PanelGroup>
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 划词翻译浮动卡片（portal 至 body，仅论文阅读区生效） */}
      <SelectionTranslate />
      {isSmall ? (
        <div style={{ flex: 1, minHeight: 0 }}>{leftRegion}</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <PanelGroup direction="horizontal" autoSaveId="themory-reader-h">
            <Panel defaultSize={50} minSize={25}>
              {leftRegion}
            </Panel>
            <PanelResizeHandle className="resizer" />
            <Panel defaultSize={50} minSize={28}>{notePanelNode}</Panel>
          </PanelGroup>
        </div>
      )}

      {/* 小屏：笔记以 Drawer 呈现，PDF 与引文条始终可见 */}
      {isSmall && (
        <Drawer open={noteDrawerOpen} onClose={() => setNoteDrawerOpen(false)} width="min(640px, 100vw)">
          {notePanelNode}
        </Drawer>
      )}
    </div>
  )
}

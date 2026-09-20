import { useMemo, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { FolderInput, FolderPlus, ScrollText, StickyNote, Tag, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { Sidebar } from '../components/Sidebar'
import { LiteratureList } from '../components/LiteratureList'
import { LiteratureDetail } from '../components/LiteratureDetail'
import { ImportFileDialog } from '../components/dialogs/ImportFileDialog'
import { CreateCategoryDialog } from '../components/dialogs/CreateCategoryDialog'
import { CreateTagDialog } from '../components/dialogs/CreateTagDialog'
import { DeleteConfirmDialog } from '../components/dialogs/DeleteConfirmDialog'
import { CreateNoteDialog } from '../components/dialogs/CreateNoteDialog'
import { SettingsDialog } from '../components/dialogs/SettingsDialog'
import { ContextMenu } from '../components/ui/ContextMenu'
import { Drawer } from '../components/ui/Drawer'
import { BottomSheet } from '../components/ui/BottomSheet'
import { useLibrary } from '../store/LibraryContext'
import { useToast } from '../store/ToastContext'
import { useMediaQuery } from '../hooks/useMediaQuery'

export type Scope =
  | { type: 'all' }
  | { type: 'fav' }
  | { type: 'category'; id: string }
  | { type: 'tag'; id: string }

export function LibraryPage() {
  const { papers, categories, getNote, createNote, deletePaper, assignPaperCategory } = useLibrary()
  const toast = useToast()
  const navigate = useNavigate()
  const isSmall = useMediaQuery('(max-width: 1100px)')

  const [scope, setScope] = useState<Scope>({ type: 'all' })
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [tagDialog, setTagDialog] = useState<{ open: boolean; paperId?: string }>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; paperId: string } | null>(null)
  const [sidebarDrawer, setSidebarDrawer] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  // 下方三栏百分比 [sideSize, listSize, detailSize]，初始值匹配 PanelGroup 默认比例
  const [layoutSizes, setLayoutSizes] = useState<[number, number, number]>([20, 55, 25])

  const selectedPaper = useMemo(
    () => papers.find((p) => p.id === selectedId) || null,
    [papers, selectedId],
  )

  const handleSelect = (paperId: string) => {
    setSelectedId(paperId)
    if (isSmall) setSheetOpen(true)
  }

  // ---------- 新建笔记（顶栏） ----------
  const openCreateNote = () => {
    if (!selectedId) {
      toast('请先选择一篇论文。', 'error')
      return
    }
    const hasStructured = Boolean(getNote(selectedId, 'structured'))
    const hasFree = Boolean(getNote(selectedId, 'free'))
    if (hasStructured && hasFree) {
      toast('该论文已存在结构化笔记和自由笔记。', 'error')
      return
    }
    setNoteDialogOpen(true)
  }

  // ---------- 右键菜单 ----------
  const openNoteOfType = (paperId: string, type: 'structured' | 'free') => {
    if (getNote(paperId, type)) {
      navigate(`/reader/${paperId}?note=${type}`)
    } else {
      createNote(paperId, type)
      navigate(`/reader/${paperId}?note=${type}`)
    }
  }

  const assignChildren = (paperId: string) =>
    categories.length > 0
      ? categories.map((c) => ({
          key: c.id,
          label: c.name,
          icon: <FolderInput size={14} />,
          onSelect: () => {
            const added = assignPaperCategory(paperId, c.id)
            if (added) toast(`已将论文加入「${c.name}」`, 'success')
            else toast(`该论文已在「${c.name}」中`, 'info')
          },
        }))
      : [
          {
            key: '__none__',
            label: '暂无分类，点击新建',
            icon: <FolderPlus size={14} />,
            onSelect: () => setCategoryOpen(true),
          },
        ]

  const ctxItems = ctxMenu
    ? [
        {
          key: 'structured',
          label: getNote(ctxMenu.paperId, 'structured') ? '打开结构化笔记' : '新建结构化笔记',
          icon: <ScrollText size={14} />,
          onSelect: () => openNoteOfType(ctxMenu.paperId, 'structured'),
        },
        {
          key: 'free',
          label: getNote(ctxMenu.paperId, 'free') ? '打开自由笔记' : '新建自由笔记',
          icon: <StickyNote size={14} />,
          onSelect: () => openNoteOfType(ctxMenu.paperId, 'free'),
        },
        {
          key: 'tag',
          label: '新建标签',
          icon: <Tag size={14} />,
          onSelect: () => setTagDialog({ open: true, paperId: ctxMenu.paperId }),
        },
        {
          key: 'category',
          label: '将论文纳入分类',
          icon: <FolderInput size={14} />,
          children: assignChildren(ctxMenu.paperId),
          onSelect: () => undefined,
        },
        {
          key: 'delete',
          label: '删除',
          icon: <Trash2 size={14} />,
          danger: true,
          separatorBefore: true,
          onSelect: () => setDeleteTarget(ctxMenu.paperId),
        },
      ]
    : []

  const sidebar = (
    <Sidebar
      scope={scope}
      onScopeChange={(s) => {
        setScope(s)
        setSidebarDrawer(false)
      }}
      onNewCategory={() => setCategoryOpen(true)}
      onNewTag={() => setTagDialog({ open: true })}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  )

  const detail = (
    <LiteratureDetail
      paper={selectedPaper}
      onEdit={() => undefined}
      onAddTag={() => selectedPaper && setTagDialog({ open: true, paperId: selectedPaper.id })}
    />
  )

  const list = (
    <LiteratureList
      scope={scope}
      search={search}
      selectedId={selectedId}
      onSelect={(p) => handleSelect(p.id)}
      onContextMenu={(e, p) => {
        e.preventDefault()
        setCtxMenu({ x: e.clientX, y: e.clientY, paperId: p.id })
      }}
      onOpenImport={() => setImportOpen(true)}
    />
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        search={search}
        onSearchChange={setSearch}
        onOpenImport={() => setImportOpen(true)}
        onOpenCreateNote={openCreateNote}
        onToggleSidebar={isSmall ? () => setSidebarDrawer(true) : undefined}
        layoutSizes={isSmall ? null : layoutSizes}
      />

      {isSmall ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          {list}
          {/* 小屏：左侧抽屉显示分类与标签 */}
          <Drawer open={sidebarDrawer} side="left" onClose={() => setSidebarDrawer(false)}>
            {sidebar}
          </Drawer>
          {/* 小屏：底部抽屉显示论文详情，不遮挡顶部导航 */}
          <BottomSheet
            open={sheetOpen && selectedPaper !== null}
            title={
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedPaper?.title}
              </span>
            }
            onClose={() => setSheetOpen(false)}
          >
            {detail}
          </BottomSheet>
        </div>
      ) : (
        <PanelGroup
          direction="horizontal"
          autoSaveId="themory-home-h"
          style={{ flex: 1 }}
          onLayout={(sizes) => setLayoutSizes(sizes as [number, number, number])}
        >
          <Panel defaultSize={20} minSize={14} maxSize={40}>
            {sidebar}
          </Panel>
          <PanelResizeHandle className="resizer" />
          <Panel defaultSize={55} minSize={30}>
            {list}
          </Panel>
          <PanelResizeHandle className="resizer" />
          <Panel defaultSize={25} minSize={20} maxSize={45}>
            {detail}
          </Panel>
        </PanelGroup>
      )}

      {/* 弹窗集合 */}
      <ImportFileDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <CreateCategoryDialog open={categoryOpen} onClose={() => setCategoryOpen(false)} />
      <CreateTagDialog
        open={tagDialog.open}
        paperId={tagDialog.paperId}
        onClose={() => setTagDialog({ open: false })}
      />
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deletePaper(deleteTarget)
            if (selectedId === deleteTarget) {
              setSelectedId(null)
              setSheetOpen(false)
            }
            toast('论文已删除', 'success')
          }
        }}
      />
      <CreateNoteDialog open={noteDialogOpen} paperId={selectedId} onClose={() => setNoteDialogOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onClose={() => setCtxMenu(null)} />
      )}
    </div>
  )
}

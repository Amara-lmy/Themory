import { Search, Plus, Menu, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface TopBarProps {
  search: string
  onSearchChange: (v: string) => void
  onOpenImport: () => void
  onOpenCreateNote: () => void
  onToggleSidebar?: () => void
  /**
   * 下方三栏百分比 [sideSize, listSize, detailSize]
   * 用于让顶栏中段宽度与下方「文献列表」宽度对齐。
   * 小屏（不使用 PanelGroup）时为 null，顶栏中段自适应。
   */
  layoutSizes?: [number, number, number] | null
}

export function TopBar({
  search,
  onSearchChange,
  onOpenImport,
  onOpenCreateNote,
  onToggleSidebar,
  layoutSizes,
}: TopBarProps) {
  const navigate = useNavigate()

  // 左侧 brand 区 flex-basis = 侧栏百分比；右侧区 flex-basis = 详情栏百分比。
  // 中段宽度 = 文献列表百分比，使其与下方论文列表左右端对齐。
  const sideFlexBasis = layoutSizes ? `${layoutSizes[0]}%` : 'auto'
  const detailFlexBasis = layoutSizes ? `${layoutSizes[2]}%` : '0'

  return (
    <header className="topbar">
      {onToggleSidebar && (
        <button className="btn-icon topbar-menu-btn" onClick={onToggleSidebar} aria-label="打开侧栏">
          <Menu size={17} />
        </button>
      )}

      {/* 左：品牌区，宽度对齐下方侧栏 */}
      <div
        className="topbar-left"
        style={{ flex: `0 0 ${sideFlexBasis}`, minWidth: 0 }}
      >
        <div
          className="brand"
          style={{ cursor: 'pointer', flex: '0 0 auto' }}
          onClick={() => navigate('/')}
        >
          <div className="brand-logo">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={20} height={20} style={{ borderRadius: 5 }} />
          </div>
          <div className="brand-name">
            <span className="brand-cn">研忆</span>
            <span className="brand-en">THEMORY · RESEARCH MEMORY</span>
          </div>
        </div>
      </div>

      {/* 中：宽度对齐下方文献列表。搜索框贴左（左端=论文列表左端），按钮组贴右（右端=论文列表右端） */}
      <div className="topbar-center">
        <div className="searchbox">
          <span className="search-icon">
            <Search size={15} />
          </span>
          <input
            className="input"
            placeholder="搜索文章名、作者或标签"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {search && (
            <button
              className="btn-icon search-clear"
              onClick={() => onSearchChange('')}
              aria-label="清空搜索"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* 两个按钮作为整体右对齐；无共同外框，仅用透明容器控制位置 */}
        <div className="topbar-btn-group">
          <button className="btn btn-primary" onClick={onOpenImport}>
            <Plus size={15} />
            <span className="btn-label">导入文献</span>
          </button>
          <button className="btn btn-primary" onClick={onOpenCreateNote}>
            <Plus size={15} />
            <span className="btn-label">新建笔记</span>
          </button>
        </div>
      </div>

      {/* 右：宽度对齐下方详情栏（个人中心已移至侧栏左下角） */}
      <div
        className="topbar-right"
        style={{ flex: `0 0 ${detailFlexBasis}`, minWidth: 0 }}
      />
    </header>
  )
}

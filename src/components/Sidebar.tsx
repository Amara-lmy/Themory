import { useState } from 'react'
import { BookOpen, Folder, FolderOpen, Star, Plus, Hash, Settings } from 'lucide-react'
import { useLibrary } from '../store/LibraryContext'
import { useToast } from '../store/ToastContext'
import { dragSourceProps, readDragPayload, hasDragKind } from '../store/DragContext'
import { ProfileMenu } from './ProfileMenu'
import type { Scope } from '../pages/LibraryPage'

interface SidebarProps {
  scope: Scope
  onScopeChange: (s: Scope) => void
  onNewCategory: () => void
  onNewTag: () => void
  onOpenSettings: () => void
}

export function Sidebar({ scope, onScopeChange, onNewCategory, onNewTag, onOpenSettings }: SidebarProps) {
  const { papers, categories, tags, profile, applyTagToCategory, assignPaperCategory, addPaperTag } = useLibrary()
  const toast = useToast()

  // 个人中心浮窗（左下角向上弹出）
  const [profileOpen, setProfileOpen] = useState(false)
  const [profilePos, setProfilePos] = useState({ x: 0, y: 0 })

  const allCount = papers.length
  const favCount = papers.filter((p) => p.favorite).length

  // 放置高亮：分类 / 标签
  const [hotCat, setHotCat] = useState<string | null>(null)
  const [hotTag, setHotTag] = useState<string | null>(null)

  const onCatDragOver = (e: React.DragEvent, catId: string) => {
    if (hasDragKind(e, 'tag') || hasDragKind(e, 'paper')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      if (hotCat !== catId) setHotCat(catId)
    }
  }
  const onCatDragLeave = (e: React.DragEvent, catId: string) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node) && hotCat === catId) setHotCat(null)
  }
  const onCatDrop = (e: React.DragEvent, catId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const payload = readDragPayload(e)
    setHotCat(null)
    const catName = categories.find((c) => c.id === catId)?.name || '该分类'
    if (payload?.kind === 'tag') {
      const n = applyTagToCategory(catId, payload.name)
      if (n > 0) toast(`已将 #${payload.name} 应用到「${catName}」的 ${n} 篇论文`, 'success')
      else toast(`「${catName}」中的论文已全部带有 #${payload.name}`, 'info')
    } else if (payload?.kind === 'paper') {
      const added = assignPaperCategory(payload.id, catId)
      if (added) {
        toast(`已将论文加入「${catName}」`, 'success')
        onScopeChange({ type: 'category', id: catId })
      } else {
        toast(`该论文已在「${catName}」中`, 'info')
      }
    }
  }

  // 标签作为放置目标：把论文拖到标签上 = 给该论文打标签
  const onTagDragOver = (e: React.DragEvent, tagName: string) => {
    if (hasDragKind(e, 'paper')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      if (hotTag !== tagName) setHotTag(tagName)
    }
  }
  const onTagDragLeave = (e: React.DragEvent, tagName: string) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node) && hotTag === tagName) setHotTag(null)
  }
  const onTagDrop = (e: React.DragEvent, tagName: string) => {
    e.preventDefault()
    e.stopPropagation()
    const payload = readDragPayload(e)
    setHotTag(null)
    if (payload?.kind !== 'paper') return
    const target = papers.find((p) => p.id === payload.id)
    if (!target) return
    if (target.tags.some((t) => t.toLowerCase() === tagName.toLowerCase())) {
      toast(`该论文已带有 #${tagName}`, 'info')
      return
    }
    addPaperTag(payload.id, tagName)
    toast(`已给论文添加 #${tagName}`, 'success')
    onScopeChange({ type: 'tag', id: tagName })
  }

  return (
    <div className="sidebar">
      <div className="side-group">
        <div className="side-group-title">我的文献</div>
        <button
          className={`side-item ${scope.type === 'all' ? 'active' : ''}`}
          onClick={() => onScopeChange({ type: 'all' })}
        >
          <span className="side-icon">
            <BookOpen size={15} />
          </span>
          全部文献
          <span className="side-count">{allCount}</span>
        </button>
        <button
          className={`side-item ${scope.type === 'fav' ? 'active' : ''}`}
          onClick={() => onScopeChange({ type: 'fav' })}
        >
          <span className="side-icon">
            <Star size={15} />
          </span>
          收藏
          <span className="side-count">{favCount}</span>
        </button>
      </div>

      <div className="side-group">
        <div className="side-group-title">
          我的分类
          <button className="side-add" style={{ width: 'auto', padding: '2px 6px' }} onClick={onNewCategory} title="新建类别">
            <Plus size={13} />
          </button>
        </div>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`side-item ${scope.type === 'category' && scope.id === c.id ? 'active' : ''} ${hotCat === c.id ? 'drop-hot' : ''}`}
            onClick={() => onScopeChange({ type: 'category', id: c.id })}
            onDragOver={(e) => onCatDragOver(e, c.id)}
            onDragLeave={(e) => onCatDragLeave(e, c.id)}
            onDrop={(e) => onCatDrop(e, c.id)}
          >
            <span className="side-icon">
              {hotCat === c.id || (scope.type === 'category' && scope.id === c.id) ? (
                <FolderOpen size={15} />
              ) : (
                <Folder size={15} />
              )}
            </span>
            <span
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {c.name}
            </span>
            <span className="side-count">
              {papers.filter((p) => p.categories.includes(c.id)).length}
            </span>
          </button>
        ))}
        <button className="side-add" onClick={onNewCategory}>
          <Plus size={13} />
          新建类别
        </button>
      </div>

      <div className="side-group">
        <div className="side-group-title">标签</div>
        {tags.map((t) => (
          <button
            key={t.id}
            className={`side-item tag-draggable ${scope.type === 'tag' && scope.id === t.name ? 'active' : ''} ${hotTag === t.name ? 'drop-hot' : ''}`}
            title={`#${t.name}（可拖出到论文/分类，也可把论文拖到此标签）`}
            onClick={() =>
              onScopeChange(
                scope.type === 'tag' && scope.id === t.name
                  ? { type: 'all' }
                  : { type: 'tag', id: t.name },
              )
            }
            onDragOver={(e) => onTagDragOver(e, t.name)}
            onDragLeave={(e) => onTagDragLeave(e, t.name)}
            onDrop={(e) => onTagDrop(e, t.name)}
            {...dragSourceProps({ kind: 'tag', name: t.name })}
          >
            <span className="side-icon">
              <Hash size={14} />
            </span>
            <span
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {t.name}
            </span>
            <span className="side-count">
              {papers.filter((p) => p.tags.includes(t.name)).length}
            </span>
          </button>
        ))}
        <button className="side-add" onClick={onNewTag}>
          <Plus size={13} />
          新增标签
        </button>
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-settings-btn" onClick={onOpenSettings} title="偏好设置">
          <Settings size={15} />
          <span>偏好设置</span>
        </button>
        <button
          className="sidebar-profile-btn"
          title="个人中心"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            // 浮窗高约 340px，从按钮上方弹出
            setProfilePos({ x: r.left - 4, y: Math.max(8, r.top - 346) })
            setProfileOpen(true)
          }}
        >
          <span className="avatar sidebar-profile-avatar">{profile.name.slice(0, 1)}</span>
          <span className="sidebar-profile-name">{profile.name}</span>
          <span className="sidebar-profile-tag">个人中心</span>
        </button>
      </div>

      {profileOpen && <ProfileMenu x={profilePos.x} y={profilePos.y} onClose={() => setProfileOpen(false)} />}
    </div>
  )
}

import { FileText } from 'lucide-react'
import { useLibrary } from '../store/LibraryContext'
import { LiteratureItem } from './LiteratureItem'
import type { Scope } from '../pages/LibraryPage'
import type { Paper } from '../types'

interface LiteratureListProps {
  scope: Scope
  search: string
  selectedId: string | null
  onSelect: (paper: Paper) => void
  onContextMenu: (e: React.MouseEvent, paper: Paper) => void
  onOpenImport: () => void
}

function matchSearch(p: Paper, q: string): boolean {
  if (!q) return true
  const query = q.toLowerCase()
  return (
    p.title.toLowerCase().includes(query) ||
    p.authors.toLowerCase().includes(query) ||
    p.tags.some((t) => t.toLowerCase().includes(query))
  )
}

export function LiteratureList({
  scope,
  search,
  selectedId,
  onSelect,
  onContextMenu,
  onOpenImport,
}: LiteratureListProps) {
  const { papers, categories } = useLibrary()

  const scopePapers = papers.filter((p) => {
    if (scope.type === 'fav') return p.favorite
    if (scope.type === 'category') return p.categories.includes(scope.id)
    if (scope.type === 'tag') return p.tags.includes(scope.id)
    return true
  })

  const filtered = scopePapers.filter((p) => matchSearch(p, search.trim()))

  const scopeName =
    scope.type === 'all'
      ? '全部文献'
      : scope.type === 'fav'
        ? '收藏'
        : scope.type === 'category'
          ? categories.find((c) => c.id === scope.id)?.name || '分类'
          : `# ${scope.id}`

  return (
    <div className="lit-list">
      <div className="lit-list-header">
        <h2>{scopeName}</h2>
        <span className="lit-count">{filtered.length} 篇论文</span>
      </div>
      <div className="lit-items">
        {filtered.length === 0 && (
          <div className="empty-state" style={{ paddingTop: 80 }}>
            <div className="empty-icon">
              <FileText size={20} />
            </div>
            <div className="empty-title">
              {papers.length === 0 ? '文献库还是空的' : search ? '没有匹配的论文' : '这里还没有论文'}
            </div>
            <div className="empty-desc">
              {papers.length === 0
                ? '导入你的第一篇 PDF，开始建立属于你的研究记忆。'
                : search
                  ? '试试其他关键词，支持标题、作者和标签。'
                  : '换一个分类或标签看看。'}
            </div>
            {papers.length === 0 && (
              <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={onOpenImport}>
                ＋ 导入文件
              </button>
            )}
          </div>
        )}
        {filtered.map((p) => (
          <LiteratureItem
            key={p.id}
            paper={p}
            selected={p.id === selectedId}
            onSelect={() => onSelect(p)}
            onContextMenu={(e) => onContextMenu(e, p)}
          />
        ))}
      </div>
    </div>
  )
}

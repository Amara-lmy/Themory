/** 通用工具 */

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function now(): number {
  return Date.now()
}

export function formatHM(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

/** 作者列表缩略：Takaffolli et al. */
export function shortAuthors(authors: string): string {
  const list = authors
    .split(/[,;，；]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (list.length === 0) return ''
  if (list.length <= 2) return list.join(' & ')
  return `${list[0]} et al.`
}

/** 去除 HTML 标签，得到纯文本 */
export function stripHtml(html: string): string {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || ''
}

/** 研究等级：根据积分计算当前等级、下一等级及进度 */
export function getLevelInfo(points: number, levels: { level: number; name: string; min: number }[]) {
  let current = levels[0]
  for (const lv of levels) {
    if (points >= lv.min) current = lv
  }
  const idx = levels.findIndex((l) => l.level === current.level)
  const next = idx >= 0 && idx < levels.length - 1 ? levels[idx + 1] : null
  const progress = next
    ? Math.min(100, Math.round(((points - current.min) / (next.min - current.min)) * 100))
    : 100
  return { current, next, progress }
}

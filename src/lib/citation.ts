/**
 * 引文格式化：根据论文元数据生成 5 种常用引用格式
 * 输入均为可选字段，缺失部分自动省略；标题与作者都为空时返回空串。
 * 作者名启发式拆分（Given Family → Family, G.）；无空格的中文名原样保留。
 */

export type CitationStyle = 'apa7' | 'mla9' | 'chicago' | 'gbt7714' | 'ieee'

export interface CitableMeta {
  authors?: string
  year?: string
  title?: string
  venue?: string
  doi?: string
  url?: string
}

export const CITATION_STYLES: { id: CitationStyle; label: string; desc: string }[] = [
  { id: 'apa7', label: 'APA 第 7 版', desc: '心理 / 教育 / 社科常用' },
  { id: 'mla9', label: 'MLA 第 9 版', desc: '文学 / 人文常用' },
  { id: 'chicago', label: 'Chicago', desc: '历史 / 艺术 / 出版常用' },
  { id: 'gbt7714', label: 'GB/T 7714', desc: '中国国家标准，学位论文常用' },
  { id: 'ieee', label: 'IEEE', desc: '工程 / 计算机 / 电子常用' },
]

/** 拆分作者字符串：支持逗号、分号、and / & 分隔 */
function splitAuthors(s?: string): string[] {
  if (!s) return []
  return s
    .split(/\s*(?:;|,(?![A-Z]\.)|\s+and\s+|\s*&\s*)\s*/i)
    .map((x) => x.trim())
    .filter(Boolean)
}

function isCJK(s: string): boolean {
  return /[\u4e00-\u9fff\u3000-\u303f]/.test(s)
}

/** 把 "Shengdi Xiao" 拆成 { family: "Xiao", given: "Shengdi" }；中文名 / 单词名返回 null */
function splitName(name: string): { family: string; given: string } | null {
  if (isCJK(name) || !/\s/.test(name)) return null
  const parts = name.replace(/\s+/g, ' ').trim().split(' ')
  if (parts.length < 2) return null
  return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') }
}

/** Given name → 首字母缩写，"Jingjing Li" 场景给 "J."；多词给 "J. J." */
function initialsOf(given: string): string {
  return given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + '.')
    .join(' ')
}

/** Xiao, S.（APA / GB/T 大写族裔名场景） */
function apaName(name: string): string {
  const n = splitName(name)
  if (!n) return name
  return `${n.family}, ${initialsOf(n.given)}`
}

/** XIAO S（GB/T 7714 西文作者：姓全大写 + 名首字母） */
function gbtName(name: string): string {
  const n = splitName(name)
  if (!n) return isCJK(name) ? name : name.toUpperCase()
  return `${n.family.toUpperCase()} ${initialsOf(n.given).replace(/\./g, '')}`
}

/** S. Xiao（IEEE） */
function ieeeName(name: string): string {
  const n = splitName(name)
  if (!n) return name
  return `${initialsOf(n.given)} ${n.family}`
}

/** Xiao, Shengdi（MLA / Chicago 第一作者倒序） */
function surnameFirst(name: string): string {
  const n = splitName(name)
  if (!n) return name
  return `${n.family}, ${n.given}`
}

function joinApa(names: string[]): string {
  if (names.length === 0) return ''
  const body = names.map(apaName)
  if (body.length === 1) return body[0]
  return body.slice(0, -1).join(', ') + ', & ' + body[body.length - 1]
}

function joinMla(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return surnameFirst(names[0])
  if (names.length === 2) return `${surnameFirst(names[0])}, and ${names[1]}`
  return `${surnameFirst(names[0])}, et al.`
}

function joinChicago(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return surnameFirst(names[0])
  const rest = names.slice(1, -1)
  const tail = names[names.length - 1]
  return [surnameFirst(names[0]), ...rest, 'and ' + tail].join(', ')
}

function joinIeee(names: string[]): string {
  if (names.length === 0) return ''
  const list = names.map(ieeeName)
  if (list.length === 1) return list[0]
  if (list.length > 6) return list.slice(0, 3).join(', ') + ', et al.'
  return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1]
}

function joinGbt(names: string[]): string {
  const list = names.slice(0, 3).map(gbtName)
  return names.length > 3 ? list.join(', ') + ', et al' : list.join(', ')
}

/** 按所选格式生成引文；信息不足时尽力而为 */
export function formatCitation(m: CitableMeta, style: CitationStyle): string {
  const authors = splitAuthors(m.authors)
  const year = m.year?.trim()
  const title = m.title?.trim().replace(/[.。]\s*$/, '')
  const venue = m.venue?.trim()
  const link = m.doi?.trim()
    ? `https://doi.org/${m.doi.trim()}`
    : m.url?.trim() && /^https?:\/\//i.test(m.url.trim())
      ? m.url.trim()
      : ''

  switch (style) {
    case 'apa7': {
      const parts: string[] = []
      const a = joinApa(authors)
      parts.push([a, year ? `(${year})` : ''].filter(Boolean).join(' '))
      if (title) parts.push(`${title}.`)
      if (venue) parts.push(`${venue}.`)
      if (link) parts.push(link)
      return parts.join(' ').trim()
    }
    case 'mla9': {
      const parts: string[] = []
      if (joinMla(authors)) parts.push(`${joinMla(authors)}.`)
      if (title) parts.push(`“${title}.”`)
      const tail = [venue, year].filter(Boolean).join(', ')
      if (tail) parts.push(tail + '.')
      if (link) parts.push(link + '.')
      return parts.join(' ').trim()
    }
    case 'chicago': {
      const parts: string[] = []
      if (joinChicago(authors)) parts.push(`${joinChicago(authors)}.`)
      if (year) parts.push(`${year}.`)
      if (title) parts.push(`“${title}.”`)
      if (venue) parts.push(`${venue}.`)
      if (link) parts.push(link + '.')
      return parts.join(' ').trim()
    }
    case 'gbt7714': {
      const parts: string[] = []
      if (joinGbt(authors)) parts.push(`${joinGbt(authors)}.`)
      if (title) parts.push(`${title}${venue ? '[J]' : link ? '[EB/OL]' : ''}.`)
      const tail = [venue, year].filter(Boolean).join(', ')
      if (tail) parts.push(tail + '.')
      if (link) parts.push(link + '.')
      return parts.join(' ').trim()
    }
    case 'ieee': {
      const parts: string[] = []
      if (joinIeee(authors)) parts.push(`${joinIeee(authors)},`)
      if (title) parts.push(`“${title},”`)
      const tail = [venue, year].filter(Boolean).join(', ')
      if (tail) parts.push(tail + '.')
      if (m.doi?.trim()) parts.push(`doi: ${m.doi.trim()}.`)
      else if (link) parts.push(link + '.')
      return parts.join(' ').trim()
    }
  }
}

/** 设置面板用的示例预览 */
export const CITATION_SAMPLE: CitableMeta = {
  authors: 'Shengdi Xiao, Jingjing Li, Tatsuki Fushimi, Yoichi Ochiai',
  year: '2025',
  title: 'Generative Artificial Intelligence-Guided User Studies: An Application for Air Taxi Services',
  venue: 'Proceedings of the 2025 CHI Conference on Human Factors in Computing Systems',
  doi: '10.1145/3706598.3714200',
}

/**
 * 文献元数据自动提取
 * 优先级：
 *   PDF: DOI(CrossRef) > PDF 内嵌信息 > 首页文本启发式
 *   链接: DOI 链接(CrossRef) > arXiv API > 网页 citation_* meta 标签
 * 任何环节失败都静默降级，绝不阻塞导入。
 */
import { pdfTextFromBuffer } from './extract.js'

export interface ExtractedMeta {
  title?: string
  authors?: string
  venue?: string
  year?: string
  doi?: string
  url?: string
  abstract?: string
}

const FETCH_TIMEOUT = 8000

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/* ---------------- DOI ---------------- */

export function extractDoi(text: string): string | null {
  const m = text.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/)
  if (!m) return null
  return m[0].replace(/[).,;:'"\]]+$/, '').toLowerCase()
}

function stripJats(html: string): string {
  return html
    .replace(/<jats:[^>]*>/g, '')
    .replace(/<\/jats:[^>]*>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim()
}

async function fetchCrossref(doi: string): Promise<ExtractedMeta | null> {
  try {
    const res = await fetchWithTimeout(
      `https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=themory@research.local`,
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) return null
    const json = (await res.json()) as { message: any }
    const m = json.message
    const meta: ExtractedMeta = { doi: m.DOI?.toLowerCase() }

    if (Array.isArray(m.title) && m.title[0]?.trim()) meta.title = m.title[0].trim()

    if (Array.isArray(m.author) && m.author.length) {
      const names = m.author
        .map((a: any) => [a.given, a.family].filter(Boolean).join(' ').trim())
        .filter(Boolean)
      if (names.length) meta.authors = names.join(', ')
    }

    const venue =
      m['container-title']?.[0] ||
      m['event']?.name ||
      (m['publisher-name'] ? undefined : undefined)
    if (venue) meta.venue = venue

    const year =
      m.issued?.['date-parts']?.[0]?.[0] ||
      m['published-print']?.['date-parts']?.[0]?.[0] ||
      m['published-online']?.['date-parts']?.[0]?.[0] ||
      m.created?.['date-parts']?.[0]?.[0]
    if (year) meta.year = String(year)

    if (typeof m.abstract === 'string') {
      const abs = stripJats(m.abstract)
      if (abs) meta.abstract = abs
    }

    if (m.URL) meta.url = m.URL
    return meta
  } catch {
    return null
  }
}

/* ---------------- arXiv ---------------- */

function parseArxiv(xml: string): ExtractedMeta | null {
  try {
    const entries = xml.split('<entry>')
    if (entries.length < 2) return null
    const entry = entries[1]
    const get = (tag: string) => {
      const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))
      return m ? m[1].replace(/<[^>]+>/g, '').trim() : ''
    }
    const title = get('title').replace(/\s+/g, ' ')
    const year = get('published').slice(0, 4)
    const names = [...entry.matchAll(/<name>\s*<name>([\s\S]*?)<\/name>/g)].map((x) =>
      x[1].trim(),
    )
    // arXiv Atom: <name> 内直接是文本
    const nameMatches = [...entry.matchAll(/<author>([\s\S]*?)<\/author>/g)]
      .map((block) => {
        const n = block[1].match(/<name>([\s\S]*?)<\/name>/)
        return n ? n[1].trim() : ''
      })
      .filter(Boolean)
      // arXiv 可能返回 "Family, Given"，统一为 "Given Family"
      .map((n) => (/^[^,]+,\s*.+$/.test(n) ? n.split(/,\s*/).reverse().join(' ') : n))
    const summary = get('summary').replace(/\s+/g, ' ')
    const idm = entry.match(/<id>([\s\S]*?)<\/id>/)
    const meta: ExtractedMeta = {
      title: title || undefined,
      authors: (nameMatches.length ? nameMatches : names).join(', ') || undefined,
      venue: 'arXiv',
      year: year || undefined,
      url: idm ? idm[1].trim() : undefined,
      abstract: summary || undefined,
    }
    return Object.keys(meta).length ? meta : null
  } catch {
    return null
  }
}

async function fetchArxiv(arxivId: string): Promise<ExtractedMeta | null> {
  try {
    const res = await fetchWithTimeout(
      `http://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`,
    )
    if (!res.ok) return null
    return parseArxiv(await res.text())
  } catch {
    return null
  }
}

/* ---------------- 网页 citation_* meta 标签 ---------------- */

function parseCitationMeta(html: string, pageUrl: string): ExtractedMeta | null {
  const getMeta = (name: string): string | null => {
    const re = new RegExp(
      `<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']+)["']`,
      'i',
    )
    const m = html.match(re)
    return m ? m[1].trim() : null
  }
  const getMulti = (name: string): string[] => {
    const re = new RegExp(
      `<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']+)["']`,
      'gi',
    )
    return [...html.matchAll(re)].map((m) => m[1].trim())
  }

  const meta: ExtractedMeta = {}
  const title = getMeta('citation_title')
  if (title) meta.title = title
  const authors = getMulti('citation_author')
  if (authors.length) meta.authors = authors.join(', ')
  const venue = getMeta('citation_journal_title') || getMeta('citation_conference')
  if (venue) meta.venue = venue
  const date = getMeta('citation_publication_date') || getMeta('citation_date')
  if (date) {
    const y = date.match(/(19|20)\d{2}/)
    if (y) meta.year = y[0]
  }
  const doi = getMeta('citation_doi')
  if (doi) meta.doi = doi.toLowerCase()
  const abs = getMeta('citation_abstract')
  if (abs) meta.abstract = abs
  meta.url = pageUrl

  return meta.title || meta.doi || authors.length ? meta : null
}

/* ---------------- URL 解析入口 ---------------- */

export async function extractFromUrl(inputUrl: string): Promise<ExtractedMeta | null> {
  const raw = inputUrl.trim()

  // 0. 裸 DOI（如 10.1145/xxxx.xxxx）
  if (raw.startsWith('10.')) {
    const doi = extractDoi(raw)
    if (doi) {
      const cr = await fetchCrossref(doi)
      if (cr) return cr
    }
  }

  let url = raw
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url

  // 1. DOI 链接或裸 DOI
  const doiFromUrl =
    url.match(/doi\.org\/(10\.[^?#\s]+)/i)?.[1] ||
    (url.startsWith('10.') ? extractDoi(url) : null)
  if (doiFromUrl) {
    const doi = decodeURIComponent(doiFromUrl.replace(/[).,;:'"\]]+$/, ''))
    const cr = await fetchCrossref(doi)
    if (cr) return cr
  }

  // 2. arXiv
  const arxivMatch =
    url.match(/arxiv\.org\/(?:abs|pdf)\/([\w.\-/]+?)(?:\.pdf)?(?:[?#]|$)/i) ||
    url.match(/^[\w.-]*(\d{4}\.\d{4,5})/)
  if (arxivMatch) {
    const ax = await fetchArxiv(arxivMatch[1])
    if (ax) return ax
  }

  // 3. 通用网页：抓取 citation_* meta
  try {
    const res = await fetchWithTimeout(url, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    })
    if (res.ok) {
      const html = await res.text()
      const meta = parseCitationMeta(html, url)
      if (meta?.doi) {
        // 网页里发现 DOI → 用 CrossRef 补全
        const cr = await fetchCrossref(meta.doi)
        if (cr) return { ...meta, ...cr }
      }
      if (meta) return meta
    }
  } catch {
    /* ignore */
  }
  return null
}

/* ---------------- PDF 首页文本启发式 ---------------- */

function cleanLine(s: string): string {
  return s
    .replace(/[*†‡§¶#∗†‡⋄♭♮]+/g, ' ')
    .replace(/[\u00b9\u00b2\u00b3\u2070-\u2079]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function guessAuthorsFromText(text: string): string | null {
  const lines = text
    .split(/\n| {3,}/)
    .map(cleanLine)
    .filter((l) => l.length >= 3 && l.length <= 160)

  const namePart = /^[A-ZÀ-Ÿ][A-Za-zÀ-ÿ'\-.]+(?:\s+[A-Za-zÀ-ÿ'\-.]+){0,3}$/
  for (const line of lines.slice(0, 14)) {
    // 去掉行末的机构上标数字 / 邮箱
    const cleaned = line.replace(/\d+/g, ' ').replace(/\S+@\S+/g, ' ')
    const parts = cleaned
      .split(/\s*,\s*|\s+and\s+|\s*;\s*/)
      .map((s) => s.trim())
      .filter((s) => s && !/^(the|a|an|abstract|introduction|university|department|college|institute)/i.test(s))
    if (parts.length < 1 || parts.length > 8) continue
    const valid = parts.filter((p) => namePart.test(p))
    if (valid.length >= 1 && valid.length / parts.length >= 0.7) {
      return valid.join(', ')
    }
  }
  return null
}

const VENUE_PATTERNS: RegExp[] = [
  /Proceedings of[^.\n|]{0,100}/i,
  /Proceedings\s+[A-Z][^.\n|]{0,80}/,
  /IEEE Transactions on[^.\n|]{0,80}/i,
  /ACM Transactions on[^.\n|]{0,80}/i,
  /Journal of [A-Z][^.\n|]{0,80}/,
  /International (?:Journal|Conference) [^.\n|]{0,80}/i,
  /(?:CHI|UIST|CSCW|UbiComp|DIS|IDC|TEI|ISWC|ASSETS)\s*'?\d{2}/,
  /(?:NeurIPS|NIPS|CVPR|ICCV|ECCV|ICML|ICLR|ACL|EMNLP|NAACL|AAAI|IJCAI|KDD|SIGGRAPH|WWW|SIGIR|CIKM)\s*'?\d{0,4}/i,
  /arXiv:\s*\d{4}\.\d{4,5}/i,
]

function guessVenueFromText(text: string): string | null {
  for (const re of VENUE_PATTERNS) {
    const m = text.match(re)
    if (m) {
      const v = m[0].replace(/\s+/g, ' ').trim().slice(0, 100)
      if (v) return v
    }
  }
  return null
}

function guessYearFromText(text: string): string | null {
  const years = text.match(/(?:19|20)\d{2}/g)
  if (!years || !years.length) return null
  const currentYear = new Date().getFullYear()
  const plausible = years
    .map(Number)
    .filter((y) => y >= 1990 && y <= currentYear + 1)
  if (!plausible.length) return null
  // 取出现频次最高的年份
  const freq = new Map<number, number>()
  plausible.forEach((y) => freq.set(y, (freq.get(y) || 0) + 1))
  let best = plausible[0]
  let bestCount = 0
  for (const [y, c] of freq) {
    if (c > bestCount || (c === bestCount && y > best)) {
      best = y
      bestCount = c
    }
  }
  return String(best)
}

/* ---------------- PDF 解析入口 ---------------- */

export async function extractFromPdf(
  filePath: string,
): Promise<{ meta: ExtractedMeta; firstPageText: string }> {
  let info: any = {}
  let firstPageText = ''
  try {
    // pdfjs-dist legacy 构建（pdf-parse v2 已封禁深层路径导入）
    const { getDocument } = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any
    const fs = await import('fs')
    const buffer = fs.readFileSync(filePath)
    const doc = await getDocument({
      data: new Uint8Array(buffer),
      verbosity: 0,
      isEvalSupported: false,
    }).promise
    try {
      const m = await doc.getMetadata()
      info = m?.info || {}
    } finally {
      await doc.destroy()
    }
    // 只取前 2 页文本（DOI / 标题启发式都在最前面）
    firstPageText = (await pdfTextFromBuffer(buffer, 2)).slice(0, 6000)
  } catch (e) {
    console.warn('[metadata] PDF 解析失败，跳过文本提取', (e as Error).message)
  }

  const heuristic: ExtractedMeta = {}

  // PDF 内嵌元信息
  if (typeof info.Title === 'string' && info.Title.trim().length >= 4) {
    heuristic.title = info.Title.trim()
  }
  if (typeof info.Author === 'string' && info.Author.trim()) {
    const a = info.Author.replace(/\s*and\s*/gi, ', ').replace(/;/g, ',').trim()
    if (a && !/^[\s,.-]+$/.test(a)) heuristic.authors = a
  }

  // DOI → CrossRef（最权威）
  const doi = extractDoi(firstPageText)
  if (doi) {
    const cr = await fetchCrossref(doi)
    if (cr) {
      // CrossRef 为主，启发式补缺
      return {
        meta: {
          doi,
          title: cr.title || heuristic.title,
          authors: cr.authors || heuristic.authors,
          venue: cr.venue,
          year: cr.year,
          abstract: cr.abstract,
          url: cr.url,
        },
        firstPageText,
      }
    }
    heuristic.doi = doi
  }

  // 启发式补缺
  if (!heuristic.authors) {
    const authors = guessAuthorsFromText(firstPageText)
    if (authors) heuristic.authors = authors
  }
  if (!heuristic.venue) {
    const venue = guessVenueFromText(firstPageText)
    if (venue) heuristic.venue = venue
  }
  if (!heuristic.year) {
    const year = guessYearFromText(firstPageText)
    if (year) heuristic.year = year
  }

  return { meta: heuristic, firstPageText }
}

/** 清理空字段，只保留有值的字段 */
export function compactMeta(meta: ExtractedMeta): ExtractedMeta {
  const out: ExtractedMeta = {}
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === 'string' && v.trim()) (out as any)[k] = v.trim()
  }
  return out
}

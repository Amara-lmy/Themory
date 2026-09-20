/**
 * 论文文件文本提取（供 AI 问答 / 笔记填充使用）
 * - pdf: pdfjs-dist legacy 构建（pdf-parse v2 已封禁深层路径导入）
 * - docx: mammoth
 * - doc: word-extractor
 * - 提取结果按 fileKey 内存缓存 30 分钟
 */
import { getFile } from './storage.js'

const MAX_TEXT = 24000
const CACHE_TTL = 30 * 60 * 1000
const cache = new Map<string, { text: string; at: number }>()

async function getPdfjs(): Promise<any> {
  return (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any
}

/**
 * 从 PDF Buffer 提取文本（可限定页数）
 * 按基线 y 变化启发式插入换行，便于 AI 阅读；行内 item 直接拼接
 */
export async function pdfTextFromBuffer(buffer: Buffer, maxPages = Infinity): Promise<string> {
  const { getDocument } = await getPdfjs()
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    verbosity: 0,
    isEvalSupported: false,
  }).promise
  try {
    let out = ''
    const total = Math.min(doc.numPages, maxPages)
    for (let n = 1; n <= total; n++) {
      const page = await doc.getPage(n)
      const tc = await page.getTextContent()
      let lastY: number | null = null
      for (const it of tc.items as any[]) {
        if (!('str' in it) || !it.str) continue
        if (lastY !== null && Math.abs(it.transform[5] - lastY) > 2) out += '\n'
        out += it.str
        lastY = it.transform[5]
      }
      out += '\n'
    }
    return out
  } finally {
    await doc.destroy()
  }
}

async function extractTextFromBuffer(buffer: Buffer, fileType: string): Promise<string> {
  if (fileType === 'pdf') {
    return pdfTextFromBuffer(buffer)
  }
  if (fileType === 'docx') {
    const mod: any = await import('mammoth')
    const mammoth = mod.default ?? mod
    const r = await mammoth.extractRawText({ buffer })
    return (r.value || '') as string
  }
  if (fileType === 'doc') {
    const mod: any = await import('word-extractor')
    const WordExtractor = mod.default ?? mod
    const we = new WordExtractor()
    const doc = await we.extract(buffer)
    return (doc.getBody() || '') as string
  }
  if (fileType === 'txt') return buffer.toString('utf8')
  return ''
}

/** 按论文 fileKey 下载并提取全文（带缓存），失败返回 null */
export async function getPaperText(paper: {
  fileKey: string
  fileType: string
}): Promise<string | null> {
  if (!paper.fileKey) return null

  const hit = cache.get(paper.fileKey)
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.text

  let buffer: Buffer
  try {
    buffer = await getFile(paper.fileKey)
  } catch (e) {
    console.warn('[extract] COS 下载失败', (e as Error).message)
    return null
  }

  let text = ''
  try {
    text = await extractTextFromBuffer(buffer, paper.fileType)
  } catch (e) {
    console.warn('[extract] 文本提取失败', (e as Error).message)
    return null
  }

  text = text.replace(/\s+\n/g, '\n').trim().slice(0, MAX_TEXT)

  // 简易容量控制
  if (cache.size >= 20) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(paper.fileKey, { text, at: Date.now() })
  return text || null
}

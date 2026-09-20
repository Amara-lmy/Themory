import { Router, Request, Response } from 'express'
import { AuthRequest, authRequired } from '../middleware.js'
import { rdb, T, unwrap } from '../lib/db.js'
import { aiConfigured, analyzeChart, chatAboutPaper, fillSection, translateText } from '../lib/aiService.js'
import { getPaperText } from '../lib/extract.js'

const router = Router()
router.use(authRequired)

/** 按论文 id 加载元信息与全文（须属于当前用户） */
async function loadPaperContext(userId: string, paperId?: string) {
  if (!paperId) return { meta: null, fullText: null }
  const paper = await unwrap(
    await rdb
      .from(T.papers)
      .select('title, authors, venue, year, abstract, fileKey, fileType')
      .eq('id', paperId)
      .eq('userId', userId)
      .maybeSingle(),
  )
  if (!paper) return { meta: null, fullText: null }
  const fullText = await getPaperText(paper)
  const meta = {
    title: paper.title,
    authors: paper.authors || undefined,
    venue: paper.venue || undefined,
    year: paper.year || undefined,
    abstract: paper.abstract || undefined,
  }
  return { meta, fullText }
}

function aiErrorRes(res: Response, e: unknown) {
  const err = e as Error & { code?: string }
  console.error('[ai]', err.message)
  const status = err.code === 'AI_NOT_CONFIGURED' ? 400 : 500
  res.status(status).json({ code: err.code || 'AI_ERROR', message: err.message })
}

// ====== POST /api/ai/chat ======
router.post('/chat', async (req: AuthRequest, res: Response) => {
  if (!aiConfigured()) {
    return res.status(400).json({ code: 'AI_NOT_CONFIGURED', message: 'AI 服务未配置（缺少 API Key）' })
  }
  try {
    const userId = req.userId!
    const { messages, paperId } = req.body as {
      messages?: { role: 'user' | 'assistant'; content: string }[]
      paperId?: string
    }
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ code: 'INVALID_PARAM', message: '缺少对话内容' })
    }
    const safeMessages = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-20)

    const { meta, fullText } = await loadPaperContext(userId, paperId)
    const reply = await chatAboutPaper(safeMessages, meta, fullText)
    res.json({ code: 'OK', data: reply })
  } catch (e) {
    aiErrorRes(res, e)
  }
})

// ====== POST /api/ai/fill-note ======
router.post('/fill-note', async (req: AuthRequest, res: Response) => {
  if (!aiConfigured()) {
    return res.status(400).json({ code: 'AI_NOT_CONFIGURED', message: 'AI 服务未配置（缺少 API Key）' })
  }
  try {
    const userId = req.userId!
    const { sectionTitle, paperId } = req.body as { sectionTitle?: string; paperId?: string }
    if (!sectionTitle?.trim()) {
      return res.status(400).json({ code: 'INVALID_PARAM', message: '缺少章节标题' })
    }

    const { meta, fullText } = await loadPaperContext(userId, paperId)
    const html = await fillSection(sectionTitle.trim(), meta, fullText)
    res.json({ code: 'OK', data: html })
  } catch (e) {
    aiErrorRes(res, e)
  }
})

// ====== POST /api/ai/translate ======
router.post('/translate', async (req: AuthRequest, res: Response) => {
  if (!aiConfigured()) {
    return res.status(400).json({ code: 'AI_NOT_CONFIGURED', message: 'AI 服务未配置（缺少 API Key）' })
  }
  try {
    const { text } = req.body as { text?: string }
    const trimmed = text?.trim()
    if (!trimmed) {
      return res.status(400).json({ code: 'INVALID_PARAM', message: '缺少翻译文本' })
    }
    if (trimmed.length > 2000) {
      return res.status(400).json({ code: 'TEXT_TOO_LONG', message: '单次翻译最多 2000 字符' })
    }
    const translated = await translateText(trimmed)
    res.json({ code: 'OK', data: translated })
  } catch (e) {
    aiErrorRes(res, e)
  }
})

// ====== POST /api/ai/analyze-chart（多模态：仅图表分析时调用 qwen-vl-plus） ======
router.post('/analyze-chart', async (req: AuthRequest, res: Response) => {
  if (!aiConfigured()) {
    return res.status(400).json({ code: 'AI_NOT_CONFIGURED', message: 'AI 服务未配置（缺少 API Key）' })
  }
  try {
    const userId = req.userId!
    const { image, question, paperId } = req.body as {
      image?: string
      question?: string
      paperId?: string
    }

    // 图片：data URI（base64）或公网 URL，大小/类型校验
    const img = image?.trim()
    if (!img) {
      return res.status(400).json({ code: 'INVALID_PARAM', message: '请上传需要分析的图表' })
    }
    const dataUriMatch = img.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i)
    if (!/^https:\/\//i.test(img) && !dataUriMatch) {
      return res.status(400).json({ code: 'INVALID_IMAGE', message: '仅支持 PNG/JPG/WebP/GIF 图片' })
    }
    // base64 部分上限约 7MB（二进制约 5.2MB），与 express 10mb body 上限留余量
    if (dataUriMatch && dataUriMatch[2].length > 7 * 1024 * 1024 * 1.37) {
      return res.status(400).json({ code: 'IMAGE_TOO_LARGE', message: '图片过大，请压缩到 5MB 以内' })
    }
    if (question && question.length > 1000) {
      return res.status(400).json({ code: 'QUESTION_TOO_LONG', message: '问题最多 1000 字' })
    }

    // 只取元信息（标题/作者等），不抽取全文，控制视觉调用成本
    let meta = null
    if (paperId) {
      const paper = await unwrap(
        await rdb
          .from(T.papers)
          .select('title, authors, venue, year')
          .eq('id', paperId)
          .eq('userId', userId)
          .maybeSingle(),
      )
      if (paper) {
        meta = {
          title: paper.title,
          authors: paper.authors || undefined,
          venue: paper.venue || undefined,
          year: paper.year || undefined,
        }
      }
    }

    const reply = await analyzeChart({ image: img, question: question?.trim(), meta })
    res.json({ code: 'OK', data: reply })
  } catch (e) {
    aiErrorRes(res, e)
  }
})

export default router

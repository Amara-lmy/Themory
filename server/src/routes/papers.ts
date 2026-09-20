import { Router, Response } from 'express'
import multer from 'multer'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { AuthRequest, authRequired } from '../middleware.js'
import { rdb, T, genId, nowIso, toMs, unwrap, RdbResult } from '../lib/db.js'
import { config } from '../config.js'
import { awardPoints } from '../points.js'
import { extractFromPdf, extractFromUrl, compactMeta } from '../lib/metadata.js'
import {
  FILE_TYPES,
  isSupportedExt,
  fileKeyFor,
  putFile,
  getFile,
  deleteFile,
} from '../lib/storage.js'

const router = Router()

// ====== 上传临时目录（上传后立即转存 COS，随后删除） ======
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'themory-upload-'))

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname)
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
      cb(null, name)
    },
  }),
  limits: { fileSize: config.maxFileSize },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).replace('.', '').toLowerCase()
    if (isSupportedExt(ext)) {
      cb(null, true)
    } else {
      cb(new Error(`仅支持 ${Object.keys(FILE_TYPES).join(' / ')} 文件`))
    }
  },
})

// ====== 论文归属校验 ======
async function findOwnedPaper(userId: string, id: string) {
  return unwrap(
    await rdb.from(T.papers).select('*').eq('id', id).eq('userId', userId).maybeSingle(),
  )
}

// ====== 批量格式化（论文 → API 响应，含标签/分类/自定义字段） ======
async function formatPapers(papers: any[]): Promise<any[]> {
  if (!papers.length) return []
  const ids = papers.map((p) => p.id)

  const [tagRels, catRels, fields] = await Promise.all([
    unwrap(await rdb.from(T.paperTags).select('paperId, tagId').in('paperId', ids)),
    unwrap(await rdb.from(T.paperCategories).select('paperId, categoryId').in('paperId', ids)),
    unwrap(await rdb.from(T.customFields).select('*').in('paperId', ids)),
  ])

  const tagIds = [...new Set(tagRels.map((r: any) => r.tagId))]
  const tagRows = tagIds.length
    ? await unwrap(await rdb.from(T.tags).select('id, name').in('id', tagIds))
    : []
  const tagName = new Map<string, string>(tagRows.map((t: any) => [t.id, t.name]))

  return papers.map((p) => ({
    id: p.id,
    title: p.title,
    authors: p.authors,
    venue: p.venue,
    year: p.year,
    abstract: p.abstract,
    citation: p.citation,
    doi: p.doi,
    url: p.url,
    fileName: p.fileName,
    fileKey: p.fileKey,
    fileType: p.fileType || '',
    fileSize: p.fileSize,
    favorite: p.favorite,
    lastReadPage: p.lastReadPage,
    tags: tagRels
      .filter((r: any) => r.paperId === p.id)
      .map((r: any) => tagName.get(r.tagId))
      .filter(Boolean),
    categories: catRels.filter((r: any) => r.paperId === p.id).map((r: any) => r.categoryId),
    customFields: fields
      .filter((f: any) => f.paperId === p.id)
      .map((f: any) => ({ id: f.id, label: f.label, value: f.value })),
    createdAt: toMs(p.createdAt),
    updatedAt: toMs(p.updatedAt),
  }))
}

async function formatPaper(p: any) {
  const [formatted] = await formatPapers([p])
  return formatted
}

// ====== GET /api/papers ======
router.get('/', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const favorite = req.query.favorite === 'true'

  let query = rdb.from(T.papers).select('*').eq('userId', userId)
  if (favorite) query = query.eq('favorite', true)

  const papers = await unwrap(await query.order('updatedAt', { ascending: false }))
  res.json({ code: 'OK', data: await formatPapers(papers) })
})

// ====== GET /api/papers/search?q=xxx ======
router.get('/search', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const q = String(req.query.q || '').trim()
  if (!q) return res.json({ code: 'OK', data: [] })

  // 题名/作者模糊匹配（去掉逗号避免破坏 PostgREST or() 语法）
  const safeQ = q.replace(/[,()]/g, ' ').replace(/%/g, '').replace(/_/g, '').trim()
  const pattern = `%${safeQ}%`

  // 匹配的标签 → 关联论文 id
  const tags = await unwrap(
    await rdb.from(T.tags).select('id').eq('userId', userId).ilike('name', pattern),
  )
  const tagIds = tags.map((t: any) => t.id)
  const rels = tagIds.length
    ? await unwrap(await rdb.from(T.paperTags).select('paperId').in('tagId', tagIds))
    : []
  const paperIds = [...new Set(rels.map((r: any) => r.paperId))]

  // 两条查询结果合并去重
  const byText = safeQ
    ? await unwrap(
        await rdb
          .from(T.papers)
          .select('*')
          .eq('userId', userId)
          .or(`title.ilike.${pattern},authors.ilike.${pattern}`),
      )
    : []
  const byTag = paperIds.length
    ? await unwrap(await rdb.from(T.papers).select('*').eq('userId', userId).in('id', paperIds))
    : []

  const merged = [...byText, ...byTag]
  const seen = new Set<string>()
  const unique = merged.filter((p: any) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
  unique.sort((a: any, b: any) => toMs(b.updatedAt) - toMs(a.updatedAt))

  res.json({ code: 'OK', data: await formatPapers(unique) })
})

// ====== POST /api/papers/upload ======
router.post(
  '/upload',
  authRequired,
  upload.single('file'),
  async (req: AuthRequest & { file?: Express.Multer.File }, res: Response) => {
    if (!req.file) return res.status(400).json({ code: 'NO_FILE', message: '请选择文件' })
    const userId = req.userId!
    const ext = path.extname(req.file.originalname).replace('.', '').toLowerCase()
    const fallbackTitle = (req.body.title as string) || req.file.originalname.replace(/\.\w+$/, '')

    try {
      // 1. 转存 COS
      const key = fileKeyFor(userId, ext)
      const buffer = fs.readFileSync(req.file.path)
      await putFile(key, buffer)

      // 2. 建库记录
      const ins: RdbResult = await rdb
        .from(T.papers)
        .insert({
          id: genId(),
          userId,
          title: fallbackTitle,
          fileName: req.file.originalname,
          fileKey: key,
          fileType: ext,
          fileSize: req.file.size,
        })
        .select()
        .single()
      if (ins.error) throw new Error(ins.error.message || '创建论文记录失败')
      const paper = ins.data

      // 3. 自动提取元数据（仅 PDF；失败不阻塞导入）
      let extracted: Record<string, string> = {}
      if (ext === 'pdf') {
        try {
          const { meta } = await extractFromPdf(req.file.path)
          const compact = compactMeta(meta)
          extracted = {
            ...(compact.title && compact.title.length >= 4 ? { title: compact.title } : {}),
            ...(compact.authors ? { authors: compact.authors } : {}),
            ...(compact.venue ? { venue: compact.venue } : {}),
            ...(compact.year ? { year: compact.year } : {}),
            ...(compact.doi ? { doi: compact.doi } : {}),
            ...(compact.url ? { url: compact.url } : {}),
            ...(compact.abstract ? { abstract: compact.abstract } : {}),
          }
          if (Object.keys(extracted).length) {
            await unwrap(
              rdb.from(T.papers).update({ ...extracted, updatedAt: nowIso() }).eq('id', paper.id),
            )
          }
        } catch (e) {
          console.warn('[upload] 元数据提取失败', (e as Error).message)
        }
      }

      // 4. 积分奖励
      await awardPoints(userId, 'import_paper', paper.id, 10)

      const finalPaper = await findOwnedPaper(userId, paper.id)
      res.json({
        code: 'OK',
        data: await formatPaper(finalPaper),
        meta: {
          extracted: Object.keys(extracted),
          missed: ['title', 'authors', 'venue', 'year', 'doi', 'url', 'abstract'].filter(
            (k) => !(k in extracted),
          ),
        },
      })
    } finally {
      fs.unlink(req.file.path, () => {})
    }
  },
)

// ====== POST /api/papers/import-url（通过链接 / DOI 导入） ======
router.post('/import-url', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const rawUrl = (req.body as { url?: string }).url?.trim()
  if (!rawUrl) return res.status(400).json({ code: 'INVALID_PARAM', message: '请输入论文链接或 DOI' })

  let meta
  try {
    meta = await extractFromUrl(rawUrl)
  } catch {
    meta = null
  }
  if (!meta || (!meta.title && !meta.doi)) {
    return res.status(422).json({
      code: 'EXTRACT_FAILED',
      message: '无法从该链接识别论文信息，请检查链接或稍后再试',
    })
  }

  const compact = compactMeta(meta)
  const ins = await rdb
    .from(T.papers)
    .insert({
      id: genId(),
      userId,
      title: compact.title || compact.doi || rawUrl,
      authors: compact.authors || '',
      venue: compact.venue || '',
      year: compact.year || '',
      doi: compact.doi || '',
      url: compact.url || rawUrl,
      abstract: compact.abstract || '',
      fileName: '',
      fileKey: '',
      fileType: '',
    })
    .select()
    .single()
  if (ins.error) {
    return res.status(500).json({ code: 'DB_ERROR', message: ins.error.message || '导入失败' })
  }

  await awardPoints(userId, 'import_paper', ins.data.id, 10)

  res.status(201).json({
    code: 'OK',
    data: await formatPaper(ins.data),
    meta: {
      extracted: Object.keys(compact),
      missed: ['title', 'authors', 'venue', 'year', 'doi', 'abstract'].filter(
        (k) => !(k in compact),
      ),
    },
  })
})

// ====== GET /api/papers/:id/file（鉴权下载文件） ======
router.get('/:id/file', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id } = req.params

  const paper = await findOwnedPaper(userId, id)
  if (!paper) return res.status(404).json({ code: 'NOT_FOUND', message: '论文不存在' })
  if (!paper.fileKey) return res.status(404).json({ code: 'NO_FILE', message: '该论文没有关联文件' })

  let buffer: Buffer
  try {
    buffer = await getFile(paper.fileKey)
  } catch (e) {
    console.warn('[file] COS 下载失败', (e as Error).message)
    return res.status(404).json({ code: 'FILE_MISSING', message: '文件不存在' })
  }

  const ft = FILE_TYPES[paper.fileType]
  res.setHeader('Content-Type', ft?.mime || 'application/octet-stream')
  res.setHeader(
    'Content-Disposition',
    `inline; filename*=UTF-8''${encodeURIComponent(paper.fileName || 'paper')}`,
  )
  res.send(buffer)
})

// ====== GET /api/papers/:id ======
router.get('/:id', authRequired, async (req: AuthRequest, res: Response) => {
  const paper = await findOwnedPaper(req.userId!, req.params.id)
  if (!paper) return res.status(404).json({ code: 'NOT_FOUND', message: '论文不存在' })
  res.json({ code: 'OK', data: await formatPaper(paper) })
})

// ====== PUT /api/papers/:id ======
router.put('/:id', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id } = req.params

  const existing = await findOwnedPaper(userId, id)
  if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: '论文不存在' })

  const updatable = [
    'title',
    'authors',
    'venue',
    'year',
    'abstract',
    'citation',
    'doi',
    'url',
    'lastReadPage',
  ] as const

  const data: Record<string, unknown> = { updatedAt: nowIso() }
  for (const key of updatable) {
    if (req.body[key] !== undefined) data[key] = req.body[key]
  }

  const updated = await rdb.from(T.papers).update(data).eq('id', id).select().single()
  if (updated.error) {
    return res.status(500).json({ code: 'DB_ERROR', message: updated.error.message || '更新失败' })
  }
  res.json({ code: 'OK', data: await formatPaper(updated.data) })
})

// ====== PATCH /api/papers/:id/favorite ======
router.patch('/:id/favorite', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id } = req.params

  const existing = await findOwnedPaper(userId, id)
  if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: '论文不存在' })

  const newFavorite = !existing.favorite
  await unwrap(rdb.from(T.papers).update({ favorite: newFavorite, updatedAt: nowIso() }).eq('id', id))

  if (newFavorite) {
    await awardPoints(userId, 'favorite', id, 2)
  }

  res.json({ code: 'OK', data: { favorite: newFavorite } })
})

// ====== PUT /api/papers/:id/reading-position ======
router.put('/:id/reading-position', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id } = req.params
  const { page } = req.body as { page?: number }
  if (typeof page !== 'number') return res.status(400).json({ code: 'INVALID_PARAM' })

  const existing = await findOwnedPaper(userId, id)
  if (!existing) return res.status(404).json({ code: 'NOT_FOUND' })

  await unwrap(rdb.from(T.papers).update({ lastReadPage: page, updatedAt: nowIso() }).eq('id', id))
  res.json({ code: 'OK' })
})

// ====== DELETE /api/papers/:id ======
router.delete('/:id', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id } = req.params

  const existing = await findOwnedPaper(userId, id)
  if (!existing) return res.status(404).json({ code: 'NOT_FOUND', message: '论文不存在' })

  // 删除 COS 物理文件（失败不阻塞）
  if (existing.fileKey) {
    try {
      await deleteFile(existing.fileKey)
    } catch (e) {
      console.warn('[delete] COS 删除失败', (e as Error).message)
    }
  }

  await unwrap(rdb.from(T.papers).delete().eq('id', id))
  res.json({ code: 'OK' })
})

// ====== Custom Fields ======
router.post('/:id/fields', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id } = req.params
  const { label } = req.body as { label?: string }
  if (!label?.trim()) return res.status(400).json({ code: 'INVALID_PARAM' })

  const existing = await findOwnedPaper(userId, id)
  if (!existing) return res.status(404).json({ code: 'NOT_FOUND' })

  const field = await rdb
    .from(T.customFields)
    .insert({ id: genId(), paperId: id, label: label.trim() })
    .select()
    .single()
  if (field.error) {
    return res.status(500).json({ code: 'DB_ERROR', message: field.error.message || '创建失败' })
  }
  res.json({ code: 'OK', data: field.data })
})

router.put('/:id/fields/:fieldId', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id, fieldId } = req.params

  const paper = await findOwnedPaper(userId, id)
  if (!paper) return res.status(404).json({ code: 'NOT_FOUND' })

  const data: Record<string, unknown> = {}
  if (req.body.label !== undefined) data.label = req.body.label
  if (req.body.value !== undefined) data.value = req.body.value

  const field = await rdb
    .from(T.customFields)
    .update(data)
    .eq('id', fieldId)
    .eq('paperId', id)
    .select()
    .single()
  if (field.error) {
    return res.status(500).json({ code: 'DB_ERROR', message: field.error.message || '更新失败' })
  }
  res.json({ code: 'OK', data: field.data })
})

router.delete('/:id/fields/:fieldId', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id, fieldId } = req.params

  const paper = await findOwnedPaper(userId, id)
  if (!paper) return res.status(404).json({ code: 'NOT_FOUND' })

  await unwrap(rdb.from(T.customFields).delete().eq('id', fieldId).eq('paperId', id))
  res.json({ code: 'OK' })
})

// ====== Tags on paper ======
router.post('/:id/tags', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id } = req.params
  const { name } = req.body as { name?: string }
  if (!name?.trim()) return res.status(400).json({ code: 'INVALID_PARAM' })

  const paper = await findOwnedPaper(userId, id)
  if (!paper) return res.status(404).json({ code: 'NOT_FOUND' })

  const trimmed = name.trim().replace(/^#/, '')

  // 找到或创建标签（唯一约束冲突时回读）
  let tag = await unwrap(
    await rdb.from(T.tags).select('*').eq('userId', userId).eq('name', trimmed).maybeSingle(),
  )
  if (!tag) {
    const ins: RdbResult = await rdb
      .from(T.tags)
      .insert({ id: genId(), userId, name: trimmed })
      .select()
      .single()
    if (ins.error) {
      tag = await unwrap(
        await rdb.from(T.tags).select('*').eq('userId', userId).eq('name', trimmed).maybeSingle(),
      )
      if (!tag) {
        return res
          .status(500)
          .json({ code: 'DB_ERROR', message: ins.error.message || '创建标签失败' })
      }
    } else {
      tag = ins.data
    }
  }

  // 检查是否已关联
  const rel = await unwrap(
    await rdb
      .from(T.paperTags)
      .select('paperId')
      .eq('paperId', id)
      .eq('tagId', tag.id)
      .maybeSingle(),
  )
  if (!rel) {
    await unwrap(rdb.from(T.paperTags).insert({ paperId: id, tagId: tag.id }))
    await awardPoints(userId, 'add_tag', `${id}:${tag.id}`, 2)
  }

  res.json({ code: 'OK', data: { tag: { id: tag.id, name: tag.name } } })
})

router.delete('/:paperId/tags/:tagId', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { paperId, tagId } = req.params

  const paper = await findOwnedPaper(userId, paperId)
  if (!paper) return res.status(404).json({ code: 'NOT_FOUND' })

  await unwrap(rdb.from(T.paperTags).delete().eq('paperId', paperId).eq('tagId', tagId))
  res.json({ code: 'OK' })
})

// ====== Categories on paper ======
router.post('/:id/categories', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id } = req.params
  const { categoryId } = req.body as { categoryId?: string }
  if (!categoryId) return res.status(400).json({ code: 'INVALID_PARAM' })

  const paper = await findOwnedPaper(userId, id)
  const category = await unwrap(
    await rdb
      .from(T.categories)
      .select('id')
      .eq('id', categoryId)
      .eq('userId', userId)
      .maybeSingle(),
  )
  if (!paper || !category) return res.status(404).json({ code: 'NOT_FOUND' })

  const rel = await unwrap(
    await rdb
      .from(T.paperCategories)
      .select('paperId')
      .eq('paperId', id)
      .eq('categoryId', categoryId)
      .maybeSingle(),
  )
  if (!rel) {
    await unwrap(rdb.from(T.paperCategories).insert({ paperId: id, categoryId }))
  }
  res.json({ code: 'OK' })
})

router.delete(
  '/:paperId/categories/:categoryId',
  authRequired,
  async (req: AuthRequest, res: Response) => {
    const userId = req.userId!
    const { paperId, categoryId } = req.params

    const paper = await findOwnedPaper(userId, paperId)
    if (!paper) return res.status(404).json({ code: 'NOT_FOUND' })

    await unwrap(
      rdb.from(T.paperCategories).delete().eq('paperId', paperId).eq('categoryId', categoryId),
    )
    res.json({ code: 'OK' })
  },
)

export default router

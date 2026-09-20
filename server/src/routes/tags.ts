import { Router, Response } from 'express'
import { AuthRequest, authRequired } from '../middleware.js'
import { rdb, T, genId, toMs, unwrap } from '../lib/db.js'

const router = Router()

// ====== GET /api/tags ======
router.get('/', authRequired, async (req: AuthRequest, res: Response) => {
  const tags = await unwrap(
    await rdb
      .from(T.tags)
      .select('*')
      .eq('userId', req.userId!)
      .order('name', { ascending: true }),
  )
  res.json({
    code: 'OK',
    data: tags.map((t: any) => ({
      id: t.id,
      name: t.name,
      createdAt: toMs(t.createdAt),
    })),
  })
})

// ====== POST /api/tags ======
router.post('/', authRequired, async (req: AuthRequest, res: Response) => {
  const { name } = req.body as { name?: string }
  const trimmed = name?.trim().replace(/^#/, '')
  if (!trimmed) return res.status(400).json({ code: 'INVALID_PARAM' })

  const userId = req.userId!
  const exists = await unwrap(
    await rdb.from(T.tags).select('id').eq('userId', userId).eq('name', trimmed).maybeSingle(),
  )
  if (exists) {
    return res.status(400).json({ code: 'DUPLICATE', message: '标签已存在' })
  }

  const tag = await rdb
    .from(T.tags)
    .insert({ id: genId(), userId, name: trimmed })
    .select()
    .single()
  if (tag.error) {
    return res.status(500).json({ code: 'DB_ERROR', message: tag.error.message || '创建失败' })
  }
  res.status(201).json({
    code: 'OK',
    data: { id: tag.data.id, name: tag.data.name, createdAt: toMs(tag.data.createdAt) },
  })
})

// ====== PUT /api/tags/:id ======
router.put('/:id', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id } = req.params
  const { name } = req.body as { name?: string }
  const trimmed = name?.trim().replace(/^#/, '')
  if (!trimmed) return res.status(400).json({ code: 'INVALID_PARAM' })

  const existing = await unwrap(
    await rdb.from(T.tags).select('id').eq('id', id).eq('userId', userId).maybeSingle(),
  )
  if (!existing) return res.status(404).json({ code: 'NOT_FOUND' })

  const tag = await rdb.from(T.tags).update({ name: trimmed }).eq('id', id).select().single()
  if (tag.error) {
    return res.status(500).json({ code: 'DB_ERROR', message: tag.error.message || '更新失败' })
  }
  res.json({
    code: 'OK',
    data: { id: tag.data.id, name: tag.data.name, createdAt: toMs(tag.data.createdAt) },
  })
})

// ====== DELETE /api/tags/:id ======
router.delete('/:id', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id } = req.params

  const existing = await unwrap(
    await rdb.from(T.tags).select('id').eq('id', id).eq('userId', userId).maybeSingle(),
  )
  if (!existing) return res.status(404).json({ code: 'NOT_FOUND' })

  await unwrap(rdb.from(T.paperTags).delete().eq('tagId', id))
  await unwrap(rdb.from(T.tags).delete().eq('id', id))

  res.json({ code: 'OK' })
})

export default router

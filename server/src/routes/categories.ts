import { Router, Response } from 'express'
import { AuthRequest, authRequired } from '../middleware.js'
import { rdb, T, genId, toMs, unwrap } from '../lib/db.js'

const router = Router()

// ====== GET /api/categories ======
router.get('/', authRequired, async (req: AuthRequest, res: Response) => {
  const categories = await unwrap(
    await rdb
      .from(T.categories)
      .select('*')
      .eq('userId', req.userId!)
      .order('createdAt', { ascending: true }),
  )
  res.json({
    code: 'OK',
    data: categories.map((c: any) => ({
      id: c.id,
      name: c.name,
      createdAt: toMs(c.createdAt),
    })),
  })
})

// ====== POST /api/categories ======
router.post('/', authRequired, async (req: AuthRequest, res: Response) => {
  const { name } = req.body as { name?: string }
  const trimmed = name?.trim()
  if (!trimmed) return res.status(400).json({ code: 'INVALID_PARAM' })

  const userId = req.userId!
  const exists = await unwrap(
    await rdb
      .from(T.categories)
      .select('id')
      .eq('userId', userId)
      .eq('name', trimmed)
      .maybeSingle(),
  )
  if (exists) {
    return res.status(400).json({ code: 'DUPLICATE', message: '分类已存在' })
  }

  const cat = await rdb
    .from(T.categories)
    .insert({ id: genId(), userId, name: trimmed })
    .select()
    .single()
  if (cat.error) {
    return res.status(500).json({ code: 'DB_ERROR', message: cat.error.message || '创建失败' })
  }
  res.status(201).json({
    code: 'OK',
    data: { id: cat.data.id, name: cat.data.name, createdAt: toMs(cat.data.createdAt) },
  })
})

// ====== PUT /api/categories/:id ======
router.put('/:id', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id } = req.params
  const { name } = req.body as { name?: string }
  const trimmed = name?.trim()
  if (!trimmed) return res.status(400).json({ code: 'INVALID_PARAM' })

  const existing = await unwrap(
    await rdb.from(T.categories).select('id').eq('id', id).eq('userId', userId).maybeSingle(),
  )
  if (!existing) return res.status(404).json({ code: 'NOT_FOUND' })

  const cat = await rdb
    .from(T.categories)
    .update({ name: trimmed })
    .eq('id', id)
    .select()
    .single()
  if (cat.error) {
    return res.status(500).json({ code: 'DB_ERROR', message: cat.error.message || '更新失败' })
  }
  res.json({
    code: 'OK',
    data: { id: cat.data.id, name: cat.data.name, createdAt: toMs(cat.data.createdAt) },
  })
})

// ====== DELETE /api/categories/:id ======
router.delete('/:id', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id } = req.params

  const existing = await unwrap(
    await rdb.from(T.categories).select('id').eq('id', id).eq('userId', userId).maybeSingle(),
  )
  if (!existing) return res.status(404).json({ code: 'NOT_FOUND' })

  // 删除关联 PaperCategory（论文变为未分类），不删论文
  await unwrap(rdb.from(T.paperCategories).delete().eq('categoryId', id))
  await unwrap(rdb.from(T.categories).delete().eq('id', id))

  res.json({ code: 'OK' })
})

export default router

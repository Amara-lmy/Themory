import { Router, Response } from 'express'
import { AuthRequest, authRequired } from '../middleware.js'
import { rdb, T, genId, nowIso, toMs, unwrap } from '../lib/db.js'
import { pickUserFields } from '../points.js'

const router = Router()

// ====== GET /api/profile ======
router.get('/', authRequired, async (req: AuthRequest, res: Response) => {
  const user = await unwrap(await rdb.from(T.users).select('*').eq('id', req.userId!).maybeSingle())
  if (!user) return res.status(404).json({ code: 'NOT_FOUND' })
  res.json({ code: 'OK', data: pickUserFields(user) })
})

// ====== PUT /api/profile ======
router.put('/', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { nickname, avatar } = req.body as { nickname?: string; avatar?: string }

  const data: Record<string, unknown> = { updatedAt: nowIso() }
  if (nickname !== undefined) {
    data.nickname = nickname.trim() || '研究者'
  }
  if (avatar !== undefined) data.avatar = avatar

  const updated = await rdb.from(T.users).update(data).eq('id', userId).select().single()
  if (updated.error) {
    return res.status(500).json({ code: 'DB_ERROR', message: updated.error.message || '更新失败' })
  }
  res.json({ code: 'OK', data: pickUserFields(updated.data) })
})

export default router

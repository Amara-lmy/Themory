import { Router, Response } from 'express'
import { AuthRequest, authRequired } from '../middleware.js'
import { rdb, T, genId, nowIso, toMs, unwrap } from '../lib/db.js'
import { awardPoints } from '../points.js'

const router = Router()

function formatNote(n: any) {
  return {
    id: n.id,
    paperId: n.paperId,
    type: n.type,
    content: n.content,
    createdAt: toMs(n.createdAt),
    updatedAt: toMs(n.updatedAt),
  }
}

async function findOwnedNote(userId: string, id: string) {
  return unwrap(
    await rdb.from(T.notes).select('*').eq('id', id).eq('userId', userId).maybeSingle(),
  )
}

// ====== GET /api/papers/:id/notes ======
router.get('/papers/:id/notes', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id } = req.params

  const paper = await unwrap(
    await rdb.from(T.papers).select('id').eq('id', id).eq('userId', userId).maybeSingle(),
  )
  if (!paper) return res.status(404).json({ code: 'NOT_FOUND' })

  const notes = await unwrap(
    await rdb.from(T.notes).select('*').eq('paperId', id).eq('userId', userId),
  )
  res.json({ code: 'OK', data: notes.map(formatNote) })
})

// ====== POST /api/papers/:id/notes ======
router.post('/papers/:id/notes', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id } = req.params
  const { type: rawType } = req.body as { type?: string }
  if (!['structured', 'free'].includes(rawType || '')) {
    return res.status(400).json({ code: 'INVALID_PARAM' })
  }
  const type = rawType as 'structured' | 'free'

  const paper = await unwrap(
    await rdb.from(T.papers).select('id').eq('id', id).eq('userId', userId).maybeSingle(),
  )
  if (!paper) return res.status(404).json({ code: 'NOT_FOUND' })

  // 每篇论文最多 1 结构化 + 1 自由
  const existing = await unwrap(
    await rdb.from(T.notes).select('id').eq('paperId', id).eq('type', type).maybeSingle(),
  )
  if (existing) {
    return res.status(400).json({ code: 'DUPLICATE', message: '该笔记类型已存在' })
  }

  const note = await rdb
    .from(T.notes)
    .insert({
      id: genId(),
      userId,
      paperId: id,
      type,
      content: type === 'structured' ? '[]' : '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    .select()
    .single()
  if (note.error) {
    return res.status(500).json({ code: 'DB_ERROR', message: note.error.message || '创建失败' })
  }

  await awardPoints(userId, 'create_note', note.data.id, 15)

  res.status(201).json({ code: 'OK', data: formatNote(note.data) })
})

// ====== GET /api/notes/:id ======
router.get('/:id', authRequired, async (req: AuthRequest, res: Response) => {
  const note = await findOwnedNote(req.userId!, req.params.id)
  if (!note) return res.status(404).json({ code: 'NOT_FOUND' })
  res.json({ code: 'OK', data: formatNote(note) })
})

// ====== PUT /api/notes/:id ======
router.put('/:id', authRequired, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!
  const { id } = req.params
  const { content } = req.body as { content?: string }
  if (content === undefined) return res.status(400).json({ code: 'INVALID_PARAM' })

  const note = await findOwnedNote(userId, id)
  if (!note) return res.status(404).json({ code: 'NOT_FOUND' })

  const updated = await rdb
    .from(T.notes)
    .update({ content, updatedAt: nowIso() })
    .eq('id', id)
    .select()
    .single()
  if (updated.error) {
    return res.status(500).json({ code: 'DB_ERROR', message: updated.error.message || '更新失败' })
  }

  // 结构化笔记完成奖励（任一章节有实质内容）
  if (note.type === 'structured') {
    try {
      const sections = JSON.parse(content) as { html?: string }[]
      const hasContent = sections.some(
        (s) => (s.html || '').replace(/<[^>]+>/g, '').trim().length > 0,
      )
      if (hasContent) {
        await awardPoints(userId, 'complete_structured', id, 20)
      }
    } catch {
      /* JSON 解析失败，跳过 */
    }
  }

  res.json({ code: 'OK', data: formatNote(updated.data) })
})

// ====== DELETE /api/notes/:id ======
router.delete('/:id', authRequired, async (req: AuthRequest, res: Response) => {
  const note = await findOwnedNote(req.userId!, req.params.id)
  if (!note) return res.status(404).json({ code: 'NOT_FOUND' })

  await unwrap(rdb.from(T.notes).delete().eq('id', note.id))
  res.json({ code: 'OK' })
})

export default router

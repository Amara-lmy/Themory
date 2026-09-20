import { rdb, T, genId, nowIso, unwrap, RdbResult } from './lib/db.js'
import { calcLevel } from './config.js'

/** 通用积分发放：带防重复校验（point_logs 三字段唯一约束兜底并发） */
export async function awardPoints(
  userId: string,
  action: string,
  targetId: string,
  delta: number,
): Promise<{ awarded: boolean; newPoints: number }> {
  // 检查是否已发过
  const exists = await unwrap(
    await rdb
      .from(T.pointLogs)
      .select('id')
      .eq('userId', userId)
      .eq('action', action)
      .eq('targetId', targetId)
      .maybeSingle(),
  )
  if (exists) return { awarded: false, newPoints: 0 }

  // 插入积分记录；唯一约束冲突视为已发过
  const ins: RdbResult = await rdb.from(T.pointLogs).insert({
    id: genId(),
    userId,
    action,
    targetId,
    delta,
  })
  if (ins.error) return { awarded: false, newPoints: 0 }

  // 更新用户积分与等级（读改写，开发阶段可接受）
  const user = await unwrap(
    await rdb.from(T.users).select('points, researchLevel').eq('id', userId).maybeSingle(),
  )
  if (!user) return { awarded: true, newPoints: 0 }

  const newPoints = (Number(user.points) || 0) + delta
  const { level } = calcLevel(newPoints)
  await unwrap(
    rdb
      .from(T.users)
      .update({ points: newPoints, researchLevel: level, updatedAt: nowIso() })
      .eq('id', userId),
  )

  return { awarded: true, newPoints }
}

export function pickUserFields(user: {
  id: string
  phone: string | null
  nickname: string
  avatar: string | null
  researchLevel: number
  points: number
}) {
  return {
    id: user.id,
    phone: user.phone,
    nickname: user.nickname,
    avatar: user.avatar,
    researchLevel: user.researchLevel,
    points: user.points,
  }
}

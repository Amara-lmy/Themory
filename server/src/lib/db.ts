/**
 * CloudBase rdb 数据访问层（PostgREST 风格）
 * - 服务端凭证访问（绕过 RLS），user_id 隔离由各 route 强制保证
 * - 统一响应 { error: {code, message}, data, count, status }
 * - 时间列 timestamptz：写入 ISO 字符串，读取用 toMs() 转毫秒时间戳
 */
import 'dotenv/config'
import crypto from 'crypto'
import cloudbase from '@cloudbase/node-sdk'

const app = cloudbase.init({
  env: process.env.CLOUDBASE_ENV_ID!,
  secretId: process.env.COS_SECRET_ID!,
  secretKey: process.env.COS_SECRET_KEY!,
})

// rdb 方法在当前 SDK 版本的类型声明中缺失，运行时可用（已实测）
export const rdb = (app as any).rdb({ database: 'public' })

/** 表名常量（PostgreSQL 实际表名，snake_case） */
export const T = {
  users: 'users',
  sessions: 'sessions',
  papers: 'papers',
  customFields: 'custom_fields',
  categories: 'categories',
  paperCategories: 'paper_categories',
  tags: 'tags',
  paperTags: 'paper_tags',
  notes: 'notes',
  pointLogs: 'point_logs',
} as const

export interface RdbError {
  code?: string
  message?: string
}

export interface RdbResult<T = any> {
  error: RdbError | null
  data: T
  count?: number | null
  status?: number
}

export class DbError extends Error {
  code: string
  status: number
  constructor(err: RdbError, status = 500) {
    super(err.message || '数据库操作失败')
    this.name = 'DbError'
    this.code = err.code || 'DB_ERROR'
    this.status = status
  }
}

/**
 * 解包 rdb 响应，出错时抛出 DbError
 * 注意：入参既可能是「已执行的结果对象」（链了 .select()/.single() 等终结方法），
 * 也可能是「thenable builder」（裸 insert/update/delete）。
 * 必须先 await —— 裸 builder 只有被 await（触发其 then）才会真正发起请求，
 * 否则会静默不执行、表现为「接口成功但数据没落库」。
 */
export async function unwrap<T = any>(
  res: RdbResult<T> | Promise<RdbResult<T>>,
): Promise<T> {
  const r = await res
  if (r.error) throw new DbError(r.error, r.status || 500)
  return r.data
}

/** 生成主键（text 类型，与 DB default gen_random_uuid 等价） */
export function genId(): string {
  return crypto.randomUUID()
}

/** 当前时间的 ISO 字符串（写入 updatedAt / createdAt 用） */
export function nowIso(): string {
  return new Date().toISOString()
}

/** timestamptz 值 → 毫秒时间戳（兼容 string / Date / number） */
export function toMs(v: unknown): number {
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const t = Date.parse(v)
    if (!Number.isNaN(t)) return t
  }
  return Date.now()
}

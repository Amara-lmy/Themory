/**
 * CloudBase PostgreSQL 数据访问层
 * - 使用 @cloudbase/node-sdk 零配置初始化：
 *   CloudBase Run 容器会自动注入 TCB_SECRETID/TCB_SECRETKEY 临时凭证，
 *   SDK 会自动读取这些凭证鉴权（临时凭证无 \r 控制字符，不会触发 ERR_INVALID_CHAR）
 * - 本地开发等非 CloudBase Run 环境才 fallback 到显式密钥
 */
import 'dotenv/config'
import crypto from 'crypto'
import cloudbase from '@cloudbase/node-sdk'

function createSdkApp() {
  const opts: Record<string, unknown> = { env: process.env.CLOUDBASE_ENV_ID!.trim() }
  // CloudBase Run 容器自动注入 TCB_SECRETID/TCB_SECRETKEY → 让 SDK 自动读取
  // 其他环境（本地）用 .env 里的 COS_SECRET_ID/KEY fallback
  const hasAutoCred = !!process.env.TCB_SECRETID && !!process.env.TCB_SECRETKEY
  if (!hasAutoCred && process.env.COS_SECRET_ID && process.env.COS_SECRET_KEY) {
    opts.secretId = process.env.COS_SECRET_ID.trim()
    opts.secretKey = process.env.COS_SECRET_KEY.trim()
  }
  console.log(`[db] CloudBase SDK init: env=${opts.env} autoCred=${hasAutoCred}`)
  return cloudbase.init(opts as any)
}

const app = createSdkApp()
export const rdb = (app as any).rdb({ database: 'public' })

/** 表名常量 */
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

export async function unwrap<T = any>(res: any): Promise<T> {
  const r: RdbResult<T> = await res
  if (r.error) throw new DbError(r.error, r.status || 500)
  return r.data
}

export function genId(): string { return crypto.randomUUID() }
export function nowIso(): string { return new Date().toISOString() }

export function toMs(v: unknown): number {
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const t = Date.parse(v)
    if (!Number.isNaN(t)) return t
  }
  return Date.now()
}

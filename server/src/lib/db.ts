/**
 * CloudBase PostgreSQL 数据访问层
 * - 优先用 CLOUDBASE_APIKEY（Publishable Key）鉴权：稳定、不会注入 \r 控制字符
 * - 回退：TENCENTCLOUD_SECRETID/SECRETKEY（云函数临时凭证）
 * - 最后：COS_SECRET_ID/SECRET_KEY（显式密钥，trim 去粘贴换行）
 */
import 'dotenv/config'
import crypto from 'crypto'
import cloudbase from '@cloudbase/node-sdk'

function createSdkApp() {
  const opts: Record<string, unknown> = { env: process.env.CLOUDBASE_ENV_ID!.trim() }

  // 鉴权优先级 1：Publishable Key（最稳，无控制字符问题）
  const apiKey = (process.env.CLOUDBASE_APIKEY || process.env.TCB_PUBLISHABLE_KEY || '').trim()
  if (apiKey) {
    opts.accessKey = apiKey
    console.log('[db] CloudBase SDK auth: accessKey (Publishable Key)')
  }
  // 鉴权优先级 2：腾讯云临时凭证（云函数注入）
  else if (process.env.TENCENTCLOUD_SECRETID && process.env.TENCENTCLOUD_SECRETKEY) {
    opts.secretId = process.env.TENCENTCLOUD_SECRETID.trim()
    opts.secretKey = process.env.TENCENTCLOUD_SECRETKEY.trim()
    if (process.env.TENCENTCLOUD_SESSIONTOKEN) {
      opts.sessionToken = process.env.TENCENTCLOUD_SESSIONTOKEN.trim()
    }
    console.log('[db] CloudBase SDK auth: TENCENTCLOUD temp creds')
  }
  // 鉴权优先级 3：显式 COS 子账号密钥（trim 去粘贴换行）
  else if (process.env.COS_SECRET_ID && process.env.COS_SECRET_KEY) {
    opts.secretId = process.env.COS_SECRET_ID.trim()
    opts.secretKey = process.env.COS_SECRET_KEY.trim()
    console.log('[db] CloudBase SDK auth: COS_SECRET_ID/SECRET_KEY (explicit)')
  } else {
    console.warn('[db] WARNING: no CloudBase auth credential found! Set CLOUDBASE_APIKEY or COS_SECRET_ID/KEY')
  }

  return cloudbase.init(opts as any)
}

const app = createSdkApp()
export const rdb = (app as any).rdb({ database: 'public' })

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

export interface RdbError { code?: string; message?: string }
export interface RdbResult<T = any> { error: RdbError | null; data: T; count?: number | null; status?: number }

export class DbError extends Error {
  code: string; status: number
  constructor(err: RdbError, status = 500) {
    super(err.message || '数据库操作失败')
    this.name = 'DbError'; this.code = err.code || 'DB_ERROR'; this.status = status
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
  if (typeof v === 'string') { const t = Date.parse(v); if (!Number.isNaN(t)) return t }
  return Date.now()
}

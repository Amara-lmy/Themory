/**
 * CloudBase PostgreSQL 数据访问层（pg 驱动直连）
 * - 绕过 @cloudbase/node-sdk 在 Node 20+ 下签名 Authorization header 时注入 \r 的 bug
 * - 提供与 CloudBase rdb().from() 兼容的 PostgREST 风格查询构建器
 * - route 代码零改动
 */
import 'dotenv/config'
import crypto from 'crypto'
import { Pool, PoolClient } from 'pg'

// ===== pg 连接池 =====

function createPool(): Pool {
  const host = (process.env.PG_HOST || process.env.POSTGRES_HOST || '').trim()
  const port = Number((process.env.PG_PORT || process.env.POSTGRES_PORT || '5432').trim())
  const database = (process.env.PG_DATABASE || process.env.POSTGRES_DATABASE || 'public').trim()
  const user = (process.env.PG_USER || process.env.POSTGRES_USER || 'postgres').trim()
  const password = (process.env.PG_PASSWORD || process.env.POSTGRES_PASSWORD || '').trim()

  return new Pool({
    host,
    port,
    database,
    user,
    password,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
  })
}

let _pool: Pool | null = null
export function getPool(): Pool {
  if (!_pool) _pool = createPool()
  return _pool
}

// ===== 常量 & 工具 =====

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

export async function unwrap<T = any>(
  res: any,
): Promise<T> {
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

// ===== SQL 工具 =====

function escapeIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function escapeLit(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (Array.isArray(v)) return `ARRAY[${v.map(escapeLit).join(',')}]`
  return `'${String(v).replace(/'/g, "''")}'`
}

type Op = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'like' | 'ilike' | 'is' | 'in'
interface Filter { column: string; op: Op; value: unknown }

// ===== QueryBuilder =====

class QueryBuilder<T = any> {
  private table: string
  private _selectCols: string | null = null
  private _filters: Filter[] = []
  private _limit: number | null = null
  private _offset: number | null = null
  private _order: { column: string; desc: boolean }[] = []
  private _distinct: boolean = false
  private _orFilters: Filter[][] = []  // OR 条件组

  // 动作模式：null=查, 'insert'=插, 'update'=更, 'delete'=删
  private _action: 'insert' | 'update' | 'delete' | null = null
  private _actionData: Record<string, unknown> | null = null

  constructor(table: string) { this.table = table }

  // —— 查询链 ——
  select(cols: string = '*'): QueryBuilder<T> {
    this._selectCols = cols; return this
  }
  eq(col: string, val: unknown): QueryBuilder<T> { this._filters.push({ column: col, op: 'eq', value: val }); return this }
  neq(col: string, val: unknown): QueryBuilder<T> { this._filters.push({ column: col, op: 'neq', value: val }); return this }
  gt(col: string, val: unknown): QueryBuilder<T> { this._filters.push({ column: col, op: 'gt', value: val }); return this }
  lt(col: string, val: unknown): QueryBuilder<T> { this._filters.push({ column: col, op: 'lt', value: val }); return this }
  gte(col: string, val: unknown): QueryBuilder<T> { this._filters.push({ column: col, op: 'gte', value: val }); return this }
  lte(col: string, val: unknown): QueryBuilder<T> { this._filters.push({ column: col, op: 'lte', value: val }); return this }
  like(col: string, val: string): QueryBuilder<T> { this._filters.push({ column: col, op: 'like', value: val }); return this }
  ilike(col: string, val: string): QueryBuilder<T> { this._filters.push({ column: col, op: 'ilike', value: val }); return this }
  is(col: string, val: unknown): QueryBuilder<T> { this._filters.push({ column: col, op: 'is', value: val }); return this }
  in(col: string, vals: unknown[]): QueryBuilder<T> { this._filters.push({ column: col, op: 'in', value: vals }); return this }
  // PostgREST 风格 OR：or("title.ilike.foo,authors.ilike.bar")
  or(expr: string): QueryBuilder<T> {
    // 格式：col.op.val,col.op.val,...
    // op 映射：ilike, like, eq, neq, gt, lt, gte, lte
    const orParts: Filter[] = expr.split(',').map((seg) => {
      const parts = seg.trim().split('.')
      const col = parts[0]
      const opStr = parts[1]
      const val = parts.slice(2).join('.')
      const opMap: Record<string, Op> = {
        ilike: 'ilike', like: 'like', eq: 'eq', neq: 'neq',
        gt: 'gt', lt: 'lt', gte: 'gte', lte: 'lte',
      }
      return { column: col, op: opMap[opStr] || 'eq', value: val }
    })
    this._orFilters.push(orParts)
    return this
  }
  limit(n: number): QueryBuilder<T> { this._limit = n; return this }
  offset(n: number): QueryBuilder<T> { this._offset = n; return this }
  order(col: string, opts?: { ascending?: boolean }): QueryBuilder<T> { this._order.push({ column: col, desc: opts?.ascending === false }); return this }
  orderBy(col: string, direction: 'asc' | 'desc' = 'asc'): QueryBuilder<T> { this._order.push({ column: col, desc: direction === 'desc' }); return this }
  distinct(enabled: boolean = true): QueryBuilder<T> { this._distinct = enabled; return this }

  // —— 写操作 ——
  insert(data: Record<string, unknown>): QueryBuilder<T> {
    this._action = 'insert'; this._actionData = data; return this
  }
  update(data: Record<string, unknown>): QueryBuilder<T> {
    this._action = 'update'; this._actionData = data; return this
  }
  delete(): QueryBuilder<T> {
    this._action = 'delete'; return this
  }

  // —— 终结方法 ——
  async execute(): Promise<RdbResult<T[]>> {
    const pool = getPool()
    const client = await pool.connect()
    try {
      if (this._action === 'insert') return this._doInsert(client)
      if (this._action === 'update') return this._doUpdate(client)
      if (this._action === 'delete') return this._doDelete(client)
      return this._doSelect(client)
    } catch (e: any) {
      return {
        error: { code: e.code || 'DB_ERROR', message: e.message || String(e) },
        data: null as unknown as T[],
        status: 500,
      }
    } finally {
      client.release()
    }
  }

  async then(
    resolve: (v: RdbResult<T[]>) => void,
    reject?: (e: any) => void,
  ): Promise<RdbResult<T[]>> {
    try { const r = await this.execute(); resolve(r); return r } catch (e) { reject?.(e); throw e }
  }

  async single(): Promise<RdbResult<T | null>> {
    this._limit = 1
    const r = await this.execute()
    return {
      error: r.error,
      data: r.data.length > 0 ? r.data[0] : null,
      count: r.error ? null : (r.data.length > 0 ? 1 : 0),
      status: r.status,
    }
  }

  async maybeSingle(): Promise<RdbResult<T | null>> {
    const r = await this.execute()
    if (r.error) return r as any
    if (r.data.length === 0) return { error: null, data: null, count: 0, status: 200 }
    if (r.data.length === 1) return { error: null, data: r.data[0], count: 1, status: 200 }
    // 多条 → 取第一条（CloudBase SDK maybeSingle 语义）
    return { error: null, data: r.data[0], count: r.data.length, status: 200 }
  }

  // —— 内部执行 ——

  private buildWhere(): string {
    const andParts = this._filters.map((f) => this._renderFilter(f))
    const orGroups = this._orFilters.map((group) =>
      `(${group.map((f) => this._renderFilter(f)).join(' OR ')})`,
    )
    const all = [...andParts, ...orGroups]
    if (all.length === 0) return ''
    return `WHERE ${all.join(' AND ')}`
  }

  private _renderFilter(f: Filter): string {
    const col = escapeIdent(f.column)
    switch (f.op) {
      case 'eq': return `${col} = ${escapeLit(f.value)}`
      case 'neq': return `${col} != ${escapeLit(f.value)}`
      case 'gt': return `${col} > ${escapeLit(f.value)}`
      case 'lt': return `${col} < ${escapeLit(f.value)}`
      case 'gte': return `${col} >= ${escapeLit(f.value)}`
      case 'lte': return `${col} <= ${escapeLit(f.value)}`
      case 'like': return `${col} LIKE ${escapeLit(f.value)}`
      case 'ilike': return `${col} ILIKE ${escapeLit(f.value)}`
      case 'is': return `${col} IS ${f.value === null ? 'NULL' : escapeLit(f.value)}`
      case 'in': return `${col} IN (${(f.value as unknown[]).map(escapeLit).join(',')})`
      default: return `${col} = ${escapeLit(f.value)}`
    }
  }

  private _doSelect(client: PoolClient): RdbResult<T[]> | Promise<RdbResult<T[]>> {
    const selectCols = this._selectCols || '*'
    const colsSql = selectCols === '*' ? '*' : selectCols.split(',').map(c => escapeIdent(c.trim())).join(', ')
    let sql = this._distinct
      ? `SELECT DISTINCT ${colsSql} FROM ${escapeIdent(this.table)}`
      : `SELECT ${colsSql} FROM ${escapeIdent(this.table)}`
    sql += ` ${this.buildWhere()}`.trim()
    if (this._order.length > 0) {
      sql += ` ORDER BY ${this._order.map(o => `${escapeIdent(o.column)} ${o.desc ? 'DESC' : 'ASC'}`).join(', ')}`
    }
    if (this._limit !== null) sql += ` LIMIT ${this._limit}`
    if (this._offset !== null) sql += ` OFFSET ${this._offset}`

    return client.query(sql).then(res => ({
      error: null, data: res.rows as T[], count: res.rowCount, status: 200,
    })).catch((e: any) => ({
      error: { code: e.code || 'DB_ERROR', message: e.message },
      data: [], status: 500,
    }))
  }

  private _doInsert(client: PoolClient): RdbResult<T[]> | Promise<RdbResult<T[]>> {
    const data = this._actionData!
    const cols = Object.keys(data)
    const sql = `INSERT INTO ${escapeIdent(this.table)} (${cols.map(escapeIdent).join(', ')}) VALUES (${cols.map(c => escapeLit(data[c])).join(', ')}) RETURNING *`
    return client.query(sql).then(res => ({
      error: null, data: res.rows as T[], count: res.rowCount, status: 201,
    })).catch((e: any) => ({
      error: { code: e.code || 'DB_ERROR', message: e.message },
      data: [], status: 500,
    }))
  }

  private _doUpdate(client: PoolClient): RdbResult<T[]> | Promise<RdbResult<T[]>> {
    const data = this._actionData!
    const setParts = Object.keys(data).map(k => `${escapeIdent(k)} = ${escapeLit(data[k])}`)
    const where = this.buildWhere()
    const returnCols = this._selectCols ? ` RETURNING ${this._selectCols.split(',').map(c => escapeIdent(c.trim())).join(', ')}` : ''
    const sql = `UPDATE ${escapeIdent(this.table)} SET ${setParts.join(', ')} ${where}${returnCols}`.trim()
    return client.query(sql).then(res => ({
      error: null, data: res.rows as T[], count: res.rowCount, status: 200,
    })).catch((e: any) => ({
      error: { code: e.code || 'DB_ERROR', message: e.message },
      data: [], status: 500,
    }))
  }

  private _doDelete(client: PoolClient): RdbResult<T[]> | Promise<RdbResult<T[]>> {
    const where = this.buildWhere()
    const returnCols = this._selectCols ? ` RETURNING ${this._selectCols.split(',').map(c => escapeIdent(c.trim())).join(', ')}` : ''
    const sql = `DELETE FROM ${escapeIdent(this.table)} ${where}${returnCols}`.trim()
    return client.query(sql).then(res => ({
      error: null, data: res.rows as T[], count: res.rowCount, status: 204,
    })).catch((e: any) => ({
      error: { code: e.code || 'DB_ERROR', message: e.message },
      data: [], status: 500,
    }))
  }
}

// ===== 导出入口 =====
export const rdb = {
  from<T = any>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>(table)
  },
} as const

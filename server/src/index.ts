// ====== Monkey-patch: 修 @cloudbase/node-sdk 在签名 Authorization header 时
// 注入 \r 等非法字符导致 Node http.ClientRequest.setHeader 抛 ERR_INVALID_CHAR
// 必须在任何 import @cloudbase/* 之前执行
// 方案：同时 patch ClientRequest.prototype 和 HTTP.request 的原始 setHeader
import http from 'node:http'
import https from 'node:https'

const _setHeader = Symbol.for('_patched_setHeader')
const _origReqSetHeader = http.ClientRequest.prototype.setHeader
const _origHttpsRequest = https.request

function sanitizeHeaderValue(v: any): any {
  if (typeof v !== 'string') return v
  // \r\n + 所有控制字符（除了制表符 \t）
  const cleaned = v.replace(/[\r\n\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  return cleaned
}

http.ClientRequest.prototype.setHeader = function (name: string, value: any) {
  const clean = sanitizeHeaderValue(value)
  return _origReqSetHeader.call(this, name, clean)
}

// 同时 patch _http_outgoing 内部 writeHead（有的 SDK 走 writeHead 不走 setHeader）
const _origWriteHead = http.ClientRequest.prototype.writeHead
http.ClientRequest.prototype.writeHead = function (...args: any[]) {
  if (args.length >= 2 && typeof args[1] === 'object') {
    for (const k of Object.keys(args[1])) {
      args[1][k] = sanitizeHeaderValue(args[1][k])
    }
  }
  return _origWriteHead.apply(this, args as any)
}

console.log('[patch] http.ClientRequest.setHeader sanitizer installed')

import express, { Request, Response } from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { rdb, T, unwrap } from './lib/db.js'
import authRouter from './routes/auth.js'
import papersRouter from './routes/papers.js'
import categoriesRouter from './routes/categories.js'
import tagsRouter from './routes/tags.js'
import notesRouter from './routes/notes.js'
import profileRouter from './routes/profile.js'
import aiRouter from './routes/ai.js'

const app = express()

// ====== 中间件 ======
// CORS_ORIGIN='*' 时允许任意来源（开发/局域网共享用）；也支持逗号分隔的白名单
const corsOrigin =
  config.corsOrigin === '*'
    ? true
    : config.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean)
app.use(cors({ origin: corsOrigin, credentials: true }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// ====== 健康检查 ======
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ code: 'OK', message: 'Themory API', timestamp: Date.now() })
})

// 诊断端点：测试数据库连通性（仅开发用）
app.get('/api/health/db', async (_req: Request, res: Response) => {
  const out: Record<string, unknown> = {
    ts: Date.now(),
    envId: config.cloudbaseEnv,
    nodeEnv: config.nodeEnv,
    hasSecretId: !!config.cos.secretId,
    hasSecretKey: !!config.cos.secretKey,
    bucket: config.cos.bucket,
  }
  try {
    const r = await rdb.from(T.users).select('id').limit(1)
    out.rdbRaw = r
    if (r && !r.error) {
      out.rdbOK = true
      out.dbError = null
    } else {
      out.rdbOK = false
      out.dbError = r?.error
    }
  } catch (e: any) {
    out.rdbOK = false
    out.dbError = e?.message || String(e)
    out.dbStack = e?.stack
  }
  try {
    const all: Record<string, unknown> = {}
    for (const k of Object.keys(process.env)) {
      if (/^(CLOUDBASE|COS_|JWT|OPENAI|NODE_|PORT|CORS)/.test(k)) {
        const v = process.env[k] || ''
        all[k] = k.includes('SECRET|KEY|TOKEN') ? `${v.slice(0,6)}...${v.slice(-4)}` : v
      }
    }
    out.envSample = all
  } catch {}
  res.json(out)
})

// ====== 路由 ======
app.use('/api/auth', authRouter)
app.use('/api/profile', profileRouter)
app.use('/api/papers', papersRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/tags', tagsRouter)
app.use('/api/notes', notesRouter)
app.use('/api/ai', aiRouter)

// ====== 前端静态站点（生产/同源部署：dist 存在时托管，支持 SPA 回退） ======
// 目录可用 FRONTEND_DIST 指定；默认取 server/../dist（前端 build 产物）
const frontendDist = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : path.resolve(process.cwd(), '..', 'dist')
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist))
  // 非 API 的 GET 请求统一回退 index.html（前端使用 HashRouter，此处主要兜底根路径与深链）
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(frontendDist, 'index.html'))
  })
  console.log(`[static] 已托管前端站点：${frontendDist}`)
}

// ====== 全局错误处理 ======
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('[ERROR]', err)

  // Multer 文件上传错误
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ code: 'FILE_TOO_LARGE', message: '文件过大，最多 20MB' })
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ code: 'UNEXPECTED_FIELD', message: '字段名应为 file' })
  }
  if (typeof err.message === 'string' && err.message.startsWith('仅支持')) {
    return res.status(400).json({ code: 'INVALID_FILE_TYPE', message: err.message })
  }

  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: config.nodeEnv === 'development' ? err.message : '服务器内部错误',
  })
})

// ====== 404 ======
app.use((_req: Request, res: Response) => {
  res.status(404).json({ code: 'NOT_FOUND', message: '接口不存在' })
})

app.listen(config.port, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  THEMORY BACKEND API                                          ║
║  Server running on http://localhost:${config.port}                       ║
║  CORS: ${config.corsOrigin.padEnd(50)}║
║  Mode: ${config.nodeEnv.padEnd(56)}║
╚══════════════════════════════════════════════════════════════╝
  `)
})

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

// 诊断端点：数据库连通性
app.get('/api/health/db', async (_req: Request, res: Response) => {
  try {
    const r = await rdb.from(T.users).select('id').limit(1)
    res.json({ ts: Date.now(), rdbOK: !r?.error, dbError: r?.error?.message || null })
  } catch (e: any) {
    res.json({ ts: Date.now(), rdbOK: false, dbError: e?.message || String(e) })
  }
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

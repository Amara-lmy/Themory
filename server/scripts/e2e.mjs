// 端到端实测：健康检查 → 登录A/B → 上传PDF/DOCX → 元数据 → 编辑/收藏/阅读位置/搜索
// → 标签/分类/自定义字段 → 笔记 CRUD → 文件下载 → AI（未配Key应400） → 用户数据隔离 → 清理
// 用法：node scripts/e2e.mjs
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const BASE = process.env.E2E_BASE || 'http://localhost:4000'
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads')

let pass = 0
let fail = 0
const results = []
function ok(name, cond, detail = '') {
  if (cond) {
    pass++
    results.push(`  PASS  ${name}`)
  } else {
    fail++
    results.push(`  FAIL  ${name}${detail ? '  → ' + detail : ''}`)
  }
}
function section(title) {
  results.push(`\n【${title}】`)
}

async function req(method, urlPath, { token, body, form } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(BASE + urlPath, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* 非 JSON（如文件流） */
  }
  return { status: res.status, json, res }
}

// ===== 0. 健康检查 =====
section('0. 健康检查')
try {
  const h = await req('GET', '/api/health')
  ok('GET /api/health', h.status === 200 && h.json?.code === 'OK', `status=${h.status}`)
} catch (e) {
  ok('GET /api/health', false, `后端未启动？${e.message}`)
  console.log(results.join('\n'))
  process.exit(1)
}

// ===== 1. 开发模式登录（用户A / 用户B） =====
section('1. 开发模式登录')
const suffix = Date.now() % 10000000
const phoneA = `138${String(suffix).padStart(8, '0')}`
const phoneB = `139${String(suffix).padStart(8, '0')}`

const loginA = await req('POST', '/api/auth/sms/login', {
  body: { phone: phoneA, code: '000000' },
})
if (loginA.status !== 200 || !loginA.json?.data?.accessToken) {
  const msg = loginA.json?.message || loginA.json?.error?.message || ''
  if (/permission denied|42501/i.test(msg)) {
    console.log('\n⛔ 数据库写权限未开通：请先在 CloudBase 控制台 SQL 编辑器执行 server/sql/grant.sql\n')
    console.log('（登录需要写入 users/sessions 表，被 42501 拒绝）\n')
  } else {
    console.log('\n⛔ 登录失败：', JSON.stringify(loginA.json).slice(0, 300), '\n')
  }
  console.log(results.join('\n'))
  process.exit(1)
}
ok(`用户A 登录（${phoneA}）`, true)
const tokenA = loginA.json.data.accessToken

const loginB = await req('POST', '/api/auth/sms/login', { body: { phone: phoneB, code: '000000' } })
ok(`用户B 登录（${phoneB}）`, loginB.status === 200 && Boolean(loginB.json?.data?.accessToken))
const tokenB = loginB.json.data?.accessToken || tokenA

// ===== 2. 上传 PDF + DOCX =====
section('2. 文件上传（PDF 元数据提取 / Word 转存）')
const pdfs = fs
  .readdirSync(UPLOADS_DIR)
  .filter((f) => f.endsWith('.pdf'))
  .map((f) => ({ f, size: fs.statSync(path.join(UPLOADS_DIR, f)).size }))
  .sort((a, b) => b.size - a.size)

let paperId = null
if (pdfs.length) {
  const pdfPath = path.join(UPLOADS_DIR, pdfs[0].f)
  const fd = new FormData()
  fd.append('file', new Blob([fs.readFileSync(pdfPath)], { type: 'application/pdf' }), 'e2e-sample.pdf')
  const up = await req('POST', '/api/papers/upload', { token: tokenA, form: fd })
  ok('上传 PDF', up.status === 200 && up.json?.code === 'OK', JSON.stringify(up.json).slice(0, 200))
  paperId = up.json?.data?.id
  if ((up.json?.meta?.extracted?.length || 0) > 0) {
    results.push(`  INFO  PDF 元数据自动提取：${JSON.stringify(up.json.meta.extracted)}`)
  } else {
    results.push('  WARN  PDF 元数据为空（样本文件本身无元数据，属尽力而为的增强功能，不影响导入）')
  }
  ok('论文记录含文件信息', Boolean(paperId) && up.json?.data?.fileType === 'pdf' && up.json?.data?.fileSize > 0)
} else {
  ok('上传 PDF', false, 'uploads 目录没有样本 PDF')
}

// DOCX：用 jszip（mammoth 的传递依赖）现场生成最小 docx
async function makeDocx(text) {
  try {
    const require = createRequire(import.meta.url)
    const JSZip = require('jszip')
    const zip = new JSZip()
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    )
    zip.folder('_rels').file(
      '.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    )
    zip.folder('word').file(
      'document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    )
    return await zip.generateAsync({ type: 'nodebuffer' })
  } catch {
    return null
  }
}

const docxBuf = await makeDocx('Themory e2e docx smoke test')
if (docxBuf) {
  const fd2 = new FormData()
  fd2.append(
    'file',
    new Blob([docxBuf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    'e2e-sample.docx',
  )
  const up2 = await req('POST', '/api/papers/upload', { token: tokenA, form: fd2 })
  ok('上传 DOCX', up2.status === 200 && up2.json?.code === 'OK', JSON.stringify(up2.json).slice(0, 200))
  if (up2.json?.data?.id && paperId === null) paperId = up2.json.data.id
} else {
  results.push('  SKIP  上传 DOCX（未找到 jszip 依赖，跳过 Word 路径验证）')
}

// ===== 3. 论文编辑 / 收藏 / 阅读位置 / 搜索 =====
section('3. 论文编辑 / 收藏 / 阅读位置 / 搜索')
if (paperId) {
  const put = await req('PUT', `/api/papers/${paperId}`, {
    token: tokenA,
    body: { title: 'E2E 测试论文', year: '2026' },
  })
  ok('PUT 编辑标题/年份', put.status === 200 && put.json?.data?.title === 'E2E 测试论文')

  const fav = await req('PATCH', `/api/papers/${paperId}/favorite`, { token: tokenA })
  ok('PATCH 收藏', fav.status === 200 && fav.json?.data?.favorite === true)

  const favList = await req('GET', '/api/papers?favorite=true', { token: tokenA })
  ok(
    '收藏筛选',
    favList.status === 200 && favList.json?.data?.some((p) => p.id === paperId),
  )

  const pos = await req('PUT', `/api/papers/${paperId}/reading-position`, { token: tokenA, body: { page: 3 } })
  ok('PUT 阅读位置', pos.status === 200 && pos.json?.code === 'OK')

  const sr = await req('GET', `/api/papers/search?q=${encodeURIComponent('E2E')}`, { token: tokenA })
  ok('搜索命中', sr.status === 200 && sr.json?.data?.some((p) => p.id === paperId))
} else {
  ok('论文编辑流程', false, '没有可用论文（上传失败）')
}

// ===== 4. 标签 / 分类 / 自定义字段 =====
section('4. 标签 / 分类 / 自定义字段')
if (paperId) {
  const tg = await req('POST', `/api/papers/${paperId}/tags`, { token: tokenA, body: { name: 'E2E标签' } })
  const tagId = tg.json?.data?.tag?.id
  ok('创建并关联标签', tg.status === 200 && Boolean(tagId))

  const detail = await req('GET', `/api/papers/${paperId}`, { token: tokenA })
  ok('论文详情含标签', detail.json?.data?.tags?.includes('E2E标签'), JSON.stringify(detail.json?.data?.tags))

  const cat = await req('POST', '/api/categories', { token: tokenA, body: { name: 'E2E分类' } })
  const catId = cat.json?.data?.id
  ok('创建分类', [200, 201].includes(cat.status) && Boolean(catId), JSON.stringify(cat.json).slice(0, 150))

  if (catId) {
    const bind = await req('POST', `/api/papers/${paperId}/categories`, {
      token: tokenA,
      body: { categoryId: catId },
    })
    ok('论文归类', bind.status === 200)
    const detail2 = await req('GET', `/api/papers/${paperId}`, { token: tokenA })
    ok('详情含分类', detail2.json?.data?.categories?.includes(catId))
  }

  const fld = await req('POST', `/api/papers/${paperId}/fields`, { token: tokenA, body: { label: '研究方法' } })
  const fldId = fld.json?.data?.id
  ok('新增自定义字段', fld.status === 200 && Boolean(fldId))
  if (fldId) {
    const fv = await req('PUT', `/api/papers/${paperId}/fields/${fldId}`, {
      token: tokenA,
      body: { value: '对照实验' },
    })
    ok('填写自定义字段值', fv.status === 200 && fv.json?.data?.value === '对照实验')
  }
} else {
  ok('标签/分类/字段', false, '没有可用论文')
}

// ===== 5. 笔记 CRUD =====
section('5. 笔记 CRUD')
let noteId = null
if (paperId) {
  const cn = await req('POST', `/api/notes/papers/${paperId}/notes`, {
    token: tokenA,
    body: { type: 'structured' },
  })
  noteId = cn.json?.data?.id
  ok('创建结构化笔记', cn.status === 201 && Boolean(noteId), JSON.stringify(cn.json).slice(0, 150))

  const dup = await req('POST', `/api/notes/papers/${paperId}/notes`, {
    token: tokenA,
    body: { type: 'structured' },
  })
  ok('同类型笔记去重（每论文限1个）', dup.status === 400 && dup.json?.code === 'DUPLICATE')

  if (noteId) {
    const sections = [{ id: 's1', title: '研究目的', html: '<p>验证 e2e 保存</p>' }]
    const sv = await req('PUT', `/api/notes/${noteId}`, { token: tokenA, body: { content: JSON.stringify(sections) } })
    ok('保存笔记内容', sv.status === 200 && sv.json?.data?.content?.includes('验证 e2e'))

    const gl = await req('GET', `/api/notes/papers/${paperId}/notes`, { token: tokenA })
    ok('笔记列表回读', gl.status === 200 && gl.json?.data?.some((n) => n.id === noteId))
  }
} else {
  ok('笔记 CRUD', false, '没有可用论文')
}

// ===== 6. 文件鉴权下载 =====
section('6. 文件鉴权下载')
if (paperId) {
  const dl = await fetch(`${BASE}/api/papers/${paperId}/file`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  })
  const buf = dl.headers.get('content-type')?.includes('json') ? null : Buffer.from(await dl.arrayBuffer())
  ok('下载文件流', dl.status === 200 && buf && buf.length > 100, `status=${dl.status} bytes=${buf?.length}`)

  const noAuth = await fetch(`${BASE}/api/papers/${paperId}/file`)
  ok('无 Token 拒绝下载', noAuth.status === 401, `status=${noAuth.status}`)
} else {
  ok('文件下载', false, '没有可用论文')
}

// ===== 7. AI 接口（Key 未配置 → 400；已配置 → 真实调用） =====
section('7. AI 接口（chat / fill-note / translate）')
const tr = await req('POST', '/api/ai/translate', {
  token: tokenA,
  body: { text: 'This paper proposes a novel method for knowledge tracing.' },
})
if (tr.status === 400 && tr.json?.code === 'AI_NOT_CONFIGURED') {
  results.push('  SKIP  AI 接口（未配置 API Key，返回正确的 400 AI_NOT_CONFIGURED）')
} else if (tr.status === 200 && tr.json?.code === 'OK') {
  ok('划词翻译', /[\u4e00-\u9fff]/.test(tr.json.data), `译文：${String(tr.json.data).slice(0, 60)}`)
} else {
  ok('划词翻译', false, `status=${tr.status} ${JSON.stringify(tr.json).slice(0, 200)}`)
}

if (paperId) {
  const ch = await req('POST', '/api/ai/chat', {
    token: tokenA,
    body: { messages: [{ role: 'user', content: '用一句话概括这篇论文' }], paperId },
  })
  if (ch.status === 400 && ch.json?.code === 'AI_NOT_CONFIGURED') {
    results.push('  SKIP  AI 问答（未配置 API Key）')
  } else if (ch.status === 200) {
    ok('AI 论文问答', typeof ch.json?.data === 'string' && ch.json.data.length > 0, String(ch.json?.data).slice(0, 80))
  } else {
    ok('AI 论文问答', false, `status=${ch.status} ${JSON.stringify(ch.json).slice(0, 200)}`)
  }
}

// ===== 8. 用户数据隔离 =====
section('8. 用户数据隔离（B 访问 A 的资源应 404）')
if (paperId) {
  const pB = await req('GET', `/api/papers/${paperId}`, { token: tokenB })
  ok('B 查 A 论文详情 → 404', pB.status === 404, `status=${pB.status}`)

  const fB = await fetch(`${BASE}/api/papers/${paperId}/file`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  })
  ok('B 下载 A 文件 → 404', fB.status === 404, `status=${fB.status}`)

  const nB = await req('GET', `/api/notes/papers/${paperId}/notes`, { token: tokenB })
  ok('B 查 A 笔记 → 404', nB.status === 404, `status=${nB.status}`)

  const listB = await req('GET', '/api/papers', { token: tokenB })
  ok('B 论文列表不含 A 数据', listB.status === 200 && !listB.json?.data?.some((p) => p.id === paperId))

  const editB = await req('PUT', `/api/papers/${paperId}`, { token: tokenB, body: { title: '越权修改' } })
  ok('B 越权编辑 → 404', editB.status === 404, `status=${editB.status}`)
} else {
  ok('数据隔离', false, '没有可用论文')
}

// ===== 9. 清理测试数据 =====
section('9. 清理测试数据')
if (noteId) {
  const dn = await req('DELETE', `/api/notes/${noteId}`, { token: tokenA })
  ok('删除笔记', dn.status === 200)
}
if (paperId) {
  const dp = await req('DELETE', `/api/papers/${paperId}`, { token: tokenA })
  ok('删除论文（含 COS 文件）', dp.status === 200)
  const after = await req('GET', `/api/papers/${paperId}`, { token: tokenA })
  ok('删除后查询 → 404', after.status === 404)
}

console.log(results.join('\n'))
console.log(`\n========== 结果：${pass} 通过 / ${fail} 失败 ==========\n`)
process.exit(fail > 0 ? 1 : 0)

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { rdb, T, genId, nowIso, unwrap } from '../lib/db.js'
import { config } from '../config.js'
import {
  signAccessToken,
  signRefreshToken,
  createSession,
  deleteSession,
  findSession,
  verifyRefreshToken,
} from '../auth.js'

const router = Router()

// 发送验证码限流：10 秒一次
const sendLimiter = rateLimit({
  windowMs: 10_000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.body as any)?.phone || req.ip!,
  message: { code: 'TOO_FREQUENT', message: '验证码发送过于频繁，请稍后再试' },
})

// 登录限流：同一手机号 60 秒内最多尝试 10 次
const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.body as any)?.phone || req.ip!,
  message: { code: 'TOO_MANY_ATTEMPTS', message: '尝试次数过多，请稍后再试' },
})

// 开发模式：任意 10-11 位数字手机号 + 固定验证码 000000（短信服务暂不接入）
const isDev = process.env.NODE_ENV !== 'production' || process.env.SMS_PROVIDER === 'mock'
const PHONE_REGEX = isDev ? /^\d{10,11}$/ : /^1[3-9]\d{9}$/
const DEV_FIXED_CODE = '000000'

// ====== GET /api/auth/wechat/url（前端探测微信登录是否可用） ======
router.get('/wechat/url', (_req: Request, res: Response) => {
  const { appid, redirect } = config.wechat
  if (!appid || !redirect) {
    return res.json({ code: 'OK', data: { configured: false } })
  }
  const state = Math.random().toString(36).slice(2, 12)
  const url =
    `https://open.weixin.qq.com/connect/qrconnect?appid=${appid}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`
  res.json({ code: 'OK', data: { configured: true, url } })
})

// ====== GET /api/auth/wechat/callback（微信扫码后重定向回后端换取登录态） ======
router.get('/wechat/callback', async (req: Request, res: Response) => {
  const { appid, secret, redirect } = config.wechat
  if (!appid || !secret) {
    return res.status(400).json({ code: 'WECHAT_NOT_CONFIGURED', message: '微信登录未配置' })
  }
  const code = String(req.query.code || '')
  if (!code) {
    return res.status(400).json({ code: 'NO_CODE', message: '缺少微信授权 code' })
  }

  try {
    // 1. code 换 access_token
    const tokenRes = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appid}&secret=${secret}&code=${code}&grant_type=authorization_code`,
    )
    const tokenData = (await tokenRes.json()) as any
    if (tokenData.errcode) {
      return res.status(400).json({
        code: 'WECHAT_TOKEN_FAILED',
        message: `微信授权失败：${tokenData.errcode} ${tokenData.errmsg || ''}`,
      })
    }

    // 2. 拉取用户信息
    let profile: { nickname?: string; headimgurl?: string } = {}
    try {
      const uiRes = await fetch(
        `https://api.weixin.qq.com/sns/userinfo?access_token=${tokenData.access_token}&openid=${tokenData.openid}`,
      )
      profile = (await uiRes.json()) as any
    } catch {
      /* 用户信息可选 */
    }

    // 3. 查找或创建用户（按 wxOpenid）
    let user = await unwrap(
      await rdb.from(T.users).select('*').eq('wxOpenid', tokenData.openid).maybeSingle(),
    )
    if (!user) {
      const ins = await rdb
        .from(T.users)
        .insert({
          id: genId(),
          wxOpenid: tokenData.openid,
          wxUnionid: tokenData.unionid || null,
          nickname: profile.nickname || '微信用户',
          avatar: profile.headimgurl || null,
          lastLoginAt: nowIso(),
        })
        .select()
        .single()
      if (ins.error) throw new Error(ins.error.message || '创建用户失败')
      user = ins.data
    } else {
      await unwrap(rdb.from(T.users).update({ lastLoginAt: nowIso() }).eq('id', user.id))
    }

    // 4. 签发 Token 并重定向回前端回调页
    const payload = { userId: user.id, phone: user.phone || '' }
    const accessToken = signAccessToken(payload)
    const refreshToken = signRefreshToken(payload)
    await createSession(user.id, refreshToken)

    const frontendOrigin = new URL(redirect, 'http://localhost:5173').origin
    const target = new URL('/auth/wechat/callback', frontendOrigin)
    target.searchParams.set('accessToken', accessToken)
    target.searchParams.set('refreshToken', refreshToken)
    return res.redirect(target.toString())
  } catch (e) {
    return res.status(500).json({
      code: 'WECHAT_LOGIN_FAILED',
      message: config.nodeEnv === 'development' ? (e as Error).message : '微信登录失败',
    })
  }
})

// ====== POST /api/auth/sms/send ======
router.post('/sms/send', sendLimiter, async (req: Request, res: Response) => {
  const schema = z.object({
    phone: z.string().regex(PHONE_REGEX, '手机号格式错误（需 10-11 位数字）'),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ code: 'INVALID_PHONE', message: parsed.error.issues[0]?.message })
  }

  if (!isDev) {
    return res.status(400).json({
      code: 'SMS_NOT_AVAILABLE',
      message: '短信服务暂未接入，请使用开发模式登录',
    })
  }

  const { phone } = parsed.data
  console.log(`[SMS MOCK] phone=${phone} fixed code=${DEV_FIXED_CODE}`)
  return res.json({
    code: 'OK',
    message: '验证码已发送（开发模式：固定 000000）',
    devCode: DEV_FIXED_CODE,
  })
})

// ====== POST /api/auth/sms/login ======
router.post('/sms/login', loginLimiter, async (req: Request, res: Response) => {
  const schema = z.object({
    phone: z.string().regex(PHONE_REGEX, '手机号格式错误'),
    code: z.string().length(6, '验证码为 6 位'),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ code: 'INVALID_PARAM', message: parsed.error.issues[0]?.message })
  }
  const { phone, code } = parsed.data

  if (!isDev) {
    return res.status(400).json({
      code: 'SMS_NOT_AVAILABLE',
      message: '短信服务暂未接入，请使用开发模式登录',
    })
  }
  if (code !== DEV_FIXED_CODE) {
    return res.status(400).json({ code: 'CODE_INVALID', message: '开发模式验证码固定为 000000' })
  }

  // 查找或创建用户
  let user = await unwrap(await rdb.from(T.users).select('*').eq('phone', phone).maybeSingle())
  if (!user) {
    const ins = await rdb
      .from(T.users)
      .insert({ id: genId(), phone, nickname: `用户${phone.slice(-4)}` })
      .select()
      .single()
    if (ins.error) {
      return res.status(500).json({ code: 'DB_ERROR', message: ins.error.message || '创建用户失败' })
    }
    user = ins.data
  } else {
    await unwrap(rdb.from(T.users).update({ lastLoginAt: nowIso() }).eq('id', user.id))
  }

  // 签发 Token
  const accessToken = signAccessToken({ userId: user.id, phone })
  const refreshToken = signRefreshToken({ userId: user.id, phone })
  await createSession(user.id, refreshToken)

  return res.json({
    code: 'OK',
    data: {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        avatar: user.avatar,
        researchLevel: user.researchLevel,
        points: user.points,
      },
    },
  })
})

// ====== POST /api/auth/logout ======
router.post('/logout', async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string }
  if (refreshToken) {
    await deleteSession(refreshToken)
  }
  return res.json({ code: 'OK' })
})

// ====== POST /api/auth/refresh ======
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string }
  if (!refreshToken) {
    return res.status(400).json({ code: 'NO_REFRESH', message: '缺少 refresh token' })
  }

  const session = await findSession(refreshToken)
  if (!session) {
    return res.status(401).json({ code: 'SESSION_INVALID', message: '登录已失效' })
  }
  if (new Date(session.expiresAt as any) < new Date()) {
    await deleteSession(refreshToken)
    return res.status(401).json({ code: 'SESSION_EXPIRED', message: '登录已过期' })
  }

  const payload = verifyRefreshToken(refreshToken)
  if (!payload) {
    return res.status(401).json({ code: 'TOKEN_INVALID', message: 'Token 无效' })
  }

  const newAccessToken = signAccessToken({ userId: payload.userId, phone: payload.phone })
  return res.json({ code: 'OK', data: { accessToken: newAccessToken } })
})

export default router

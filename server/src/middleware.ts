import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from './auth.js'

export interface AuthRequest extends Request {
  userId?: string
  phone?: string
}

export function authRequired(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: '缺少认证信息' })
  }
  const token = header.slice(7)
  const payload = verifyAccessToken(token)
  if (!payload) {
    return res.status(401).json({ code: 'TOKEN_INVALID', message: '登录已过期，请重新登录' })
  }
  req.userId = payload.userId
  req.phone = payload.phone
  next()
}

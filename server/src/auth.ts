import jwt from 'jsonwebtoken'
import { config } from './config.js'
import { rdb, T, genId, unwrap } from './lib/db.js'

export interface JwtPayload {
  userId: string
  phone: string
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  })
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.refreshSecret, {
    expiresIn: config.refreshExpiresIn as jwt.SignOptions['expiresIn'],
  })
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload
  } catch {
    return null
  }
}

export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.refreshSecret) as JwtPayload
  } catch {
    return null
  }
}

// 保存 refresh token 到数据库
export async function createSession(userId: string, refreshToken: string) {
  const decoded = jwt.decode(refreshToken) as { exp: number }
  await unwrap(
    rdb.from(T.sessions).insert({
      id: genId(),
      userId,
      refreshToken,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
    }),
  )
}

export async function deleteSession(refreshToken: string) {
  await unwrap(rdb.from(T.sessions).delete().eq('refreshToken', refreshToken))
}

export async function findSession(refreshToken: string) {
  return unwrap(
    await rdb.from(T.sessions).select('*').eq('refreshToken', refreshToken).maybeSingle(),
  )
}

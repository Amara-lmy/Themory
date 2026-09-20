/** 登录凭证持久化 */

const LS_ACCESS = 'themory.token.access'
const LS_REFRESH = 'themory.token.refresh'
const LS_USER = 'themory.user'

export interface StoredUser {
  id: string
  /** 微信登录用户可能没有手机号 */
  phone: string | null
  nickname: string
  avatar: string | null
  researchLevel: number
  points: number
}

export function getTokens() {
  return {
    accessToken: localStorage.getItem(LS_ACCESS) || '',
    refreshToken: localStorage.getItem(LS_REFRESH) || '',
  }
}

export function saveTokens(access: string, refresh: string) {
  localStorage.setItem(LS_ACCESS, access)
  localStorage.setItem(LS_REFRESH, refresh)
}

export function clearTokens() {
  localStorage.removeItem(LS_ACCESS)
  localStorage.removeItem(LS_REFRESH)
}

export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(LS_USER)
    return raw ? (JSON.parse(raw) as StoredUser) : null
  } catch {
    return null
  }
}

export function saveUser(user: StoredUser) {
  localStorage.setItem(LS_USER, JSON.stringify(user))
}

export function clearUser() {
  localStorage.removeItem(LS_USER)
}

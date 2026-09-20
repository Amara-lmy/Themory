/**
 * API 请求封装
 * - 统一 base URL
 * - 自动附加 Authorization header
 * - 统一错误处理
 * - 自动处理 401 跳转登录
 */

import { getTokens, clearTokens } from './auth-storage'

// 未显式配置时自动推断：局域网用 IP 访问前端 → 后端指向同一主机的 4000 端口
// 构建时把 VITE_API_BASE 设为空字符串 = 前后端同源部署（请求走相对路径 /api/...）
function guessApiBase(): string {
  const explicit = import.meta.env.VITE_API_BASE as string | undefined
  if (explicit !== undefined) return explicit
  const host =
    typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:4000`
  }
  return 'http://localhost:4000'
}

export const API_BASE = guessApiBase()

export interface ApiResponse<T = unknown> {
  code: 'OK' | string
  message?: string
  data?: T
}

function buildUrl(path: string) {
  if (path.startsWith('http')) return path
  return API_BASE + path
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const { accessToken } = getTokens()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const res = await fetch(buildUrl(path), { ...options, headers })

  // 401 → 清理 token，跳转登录
  if (res.status === 401) {
    clearTokens()
    if (!path.includes('/auth/')) {
      window.dispatchEvent(new CustomEvent('themory-auth-expired'))
    }
    return { code: 'UNAUTHORIZED', message: '登录已过期' }
  }

  const json = (await res.json()) as ApiResponse<T>
  return json
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  // 文件上传（multipart/form-data，不设 Content-Type）
  upload: <T>(path: string, formData: FormData) => {
    const { accessToken } = getTokens()
    const headers: Record<string, string> = {}
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    return fetch(buildUrl(path), { method: 'POST', headers, body: formData })
      .then((r) => r.json() as Promise<ApiResponse<T>>)
  },
  // 鉴权拉取二进制文件（如 PDF），返回 Blob
  fetchBlob: async (path: string): Promise<Blob | null> => {
    const { accessToken } = getTokens()
    if (!accessToken) return null
    const res = await fetch(buildUrl(path), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    return res.blob()
  },
}

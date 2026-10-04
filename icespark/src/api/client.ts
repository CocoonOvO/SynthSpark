import type { paths } from './schema'

/**
 * API 客户端（P0 只有通用能力，业务端点函数在 P3 起按域加）。
 *
 * 两条从第一天就上锁的规矩：
 *  1. **只打 `/api`**：dev 走 Vite 代理，生产同源反代，代码里不出现后端主机名。
 *  2. **类型来自后端契约**：`./schema` 由 `npm run api:gen` 从 /api/openapi.json 生成，
 *     手写响应类型即违约 —— 旧前端那 20 处不匹配就是这么攒出来的。
 */

/** 后端 API 前缀 */
export const API_BASE = '/api'

/** 登录令牌的存储键（AGENTS.md：前端存储键只允许 synthspark 写法） */
export const TOKEN_KEY = 'synthspark-token'

/** 后端契约里的全部路径（生成物） */
export type ApiPaths = paths
export type ApiPath = keyof paths

/** 查询参数：空值会被丢掉，数组按重复键展开 */
export type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[]
export type Query = Record<string, QueryValue>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Query
  /** JSON 请求体，会被 JSON.stringify；GET 请用 query */
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  /** 需要登录的接口传 true，自动带上 Bearer 令牌 */
  auth?: boolean
}

/** 接口报错：带上状态码与后端原文，页面据此决定提示文案 */
export class ApiError extends Error {
  readonly status: number
  readonly url: string
  readonly body: unknown

  constructor(status: number, url: string, body: unknown, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
    this.body = body
  }
}

/** 读出登录令牌；没有则 null */
export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    // 隐私模式下 localStorage 可能直接抛异常，此时按未登录处理
    return null
  }
}

/** 写入 / 清除登录令牌（传 null 表示登出） */
export function writeToken(token: string | null): void {
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // 存不进去也不算致命：本次会话仍可用，只是刷新后要重新登录
  }
}

/** 拼查询串：空值丢弃，数组展开成重复键 */
export function buildUrl(path: string, query?: Query): string {
  const url = path.startsWith('/') ? path : `/${path}`
  if (!query) return url

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item))
    } else {
      params.append(key, String(value))
    }
  }

  const search = params.toString()
  return search ? `${url}?${search}` : url
}

/** 从后端响应体里抠出一句人能读的错误信息 */
function errorMessage(status: number, body: unknown): string {
  if (typeof body === 'object' && body !== null && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      // FastAPI 422：detail 是校验错误数组
      const first = detail[0] as { msg?: unknown } | undefined
      if (first && typeof first.msg === 'string') return first.msg
    }
  }
  return `请求失败（HTTP ${status}）`
}

/**
 * 发一次请求。`path` 用契约里的原样写法（含 `{post_id}` 这类占位符时由调用方填好）。
 *
 * 204 或空响应体返回 undefined —— 删除类接口就是这样。
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, headers = {}, signal, auth = false } = options

  const finalHeaders: Record<string, string> = { Accept: 'application/json', ...headers }
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json'

  if (auth) {
    const token = readToken()
    if (token) finalHeaders.Authorization = `Bearer ${token}`
  }

  const url = buildUrl(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, query)

  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })

  // 204 / 205 一定没有响应体
  if (response.status === 204 || response.status === 205) {
    return undefined as T
  }

  const text = await response.text()
  let parsed: unknown = undefined
  if (text !== '') {
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      parsed = text
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, url, parsed, errorMessage(response.status, parsed))
  }

  return parsed as T
}

/** GET 便捷写法 */
export function getJson<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
  return request<T>(path, { ...options, method: 'GET' })
}

/** POST 便捷写法 */
export function postJson<T>(
  path: string,
  body?: unknown,
  options: Omit<RequestOptions, 'method' | 'body'> = {},
) {
  return request<T>(path, { ...options, method: 'POST', body })
}

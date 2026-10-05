import { ApiError, readToken } from './client'

import type { AvatarRows } from '@/signal/pixel-grid'

/**
 * icespark **自己的**点阵头像接口（不是后端的）。
 *
 * 打的是同源的 `/avatar`，**不带 `/api`** —— `/api` 整条被代理给后端了，
 * 这条路由属于前端自己（见 `avatar-route.ts` 与架构 §67）。
 *
 * 因此它有一个别的接口都没有的性质：**可能根本不存在**。部署若只是「静态发 dist」，
 * 这四个函数会拿到 404 或直接网络失败 —— 调用方（`stores/avatars.ts`）必须把它
 * 当成「这台部署没有点阵头像」而不是错误，退到「后端头像 → 名字回退」。
 */

/** 一条点阵头像记录 */
export interface AvatarRecord {
  rows: AvatarRows
  /** 保存时后端返回的用户 id（只作参考） */
  userId?: string
  /** ISO 时间串 */
  updatedAt?: string
}

/** 用户名 → 记录 */
export type AvatarMap = Record<string, AvatarRecord>

/** 保存 / 清除后的结果：一定带回「这份头像属于谁」（身份由服务端从令牌里解出来） */
export interface AvatarSaved extends AvatarRecord {
  username: string
}

/** 读响应体：JSON 优先，失败就退回文本（后端给的是 { detail }，dev 里也可能是别的） */
async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** 把非 2xx 变成带原文的 ApiError，页面据此显示提示 */
async function ensureOk(res: Response, url: string): Promise<unknown> {
  const body = await readBody(res)
  if (!res.ok) {
    const detail =
      typeof body === 'object' && body !== null && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `HTTP ${res.status}`
    throw new ApiError(res.status, url, body, detail)
  }
  return body
}

/** 拉整份映射（公开接口，无需登录）。前端一次拉完，session 内自己缓存。 */
export async function fetchAvatarMap(): Promise<AvatarMap> {
  const url = '/avatar'
  let res: Response
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch (err) {
    // 路由不存在（静态部署）时就是这里：当成「没有点阵头像」，不是错误
    throw new ApiError(0, url, null, err instanceof Error ? err.message : '取不到头像服务')
  }
  const body = (await ensureOk(res, url)) as { avatars?: AvatarMap } | null
  return body?.avatars && typeof body.avatars === 'object' ? body.avatars : {}
}

/** 保存**我自己**的点阵头像；身份由服务端拿令牌去后端换，客户端不传用户名 */
export async function saveMyAvatar(rows: AvatarRows): Promise<AvatarSaved> {
  const url = '/avatar'
  const token = readToken()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ rows }),
  })
  return (await ensureOk(res, url)) as AvatarSaved
}

/** 清掉**我自己**的点阵头像（回到图片头像 / 名字回退） */
export async function clearMyAvatar(): Promise<{ username: string; removed: boolean }> {
  const url = '/avatar'
  const token = readToken()
  const res = await fetch(url, {
    method: 'DELETE',
    headers: (token ? { Authorization: `Bearer ${token}` } : {}),
  })
  return (await ensureOk(res, url)) as { username: string; removed: boolean }
}

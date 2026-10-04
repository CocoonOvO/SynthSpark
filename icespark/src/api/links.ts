import { getJson, request } from './client'
import type { Link } from './types'

/**
 * 外链接口（契约驱动，架构 §16.2）。
 *
 * 契约的模型叫 `ExternalLink`（types.ts 里导出为 `Link`，与样机同名）。
 * 注意契约里**没有 `description` / `icon`**，而有 `cover_image` / `sort_order` ——
 * 样机 LinksScene 渲染的 `l.description` 在生产版取不到，第二波要停下来定口径。
 *
 * 读写权限不对称：`GET /api/links/` 是**公开**的（关联页要用），
 * `POST|PUT|DELETE` 只有超管能用（`is_superuser`）—— 因此写操作一律带 `auth: true`。
 * 路由带尾斜杠（`/links/`）：不带会触发 307，浏览器跟随重定向时会丢掉 Authorization 头，
 * 表现为「超管也 401」（旧前端文件头记过同一个坑）。
 */
export async function fetchLinks(): Promise<Link[]> {
  return getJson<Link[]>('/links/')
}

/** 创建 / 更新外链的请求体（契约 `ExternalLinkCreate`：只有这四项，name 与 url 必填） */
export type LinkPayload = {
  /** 外链名称（1–100 字） */
  name: string
  /** `http(s)://` 绝对链接，或 `/` 开头的站内路径（后端校验，前端不重复造规则） */
  url: string
  /** 配图 URL，可空 */
  cover_image?: string | null
  /** 排序权重，小的在前 */
  sort_order?: number
}

/** 新建外链（仅超管，`POST /api/links/`） */
export async function createLink(payload: LinkPayload): Promise<Link> {
  return request<Link>('/links/', { method: 'POST', body: payload, auth: true })
}

/** 改一条外链（仅超管，`PUT /api/links/{link_id}`，body 与新建同构） */
export async function updateLink(linkId: string, payload: LinkPayload): Promise<Link> {
  return request<Link>(`/links/${encodeURIComponent(linkId)}`, {
    method: 'PUT',
    body: payload,
    auth: true,
  })
}

/** 删一条外链（仅超管，`DELETE /api/links/{link_id}`；后端返回 204，客户端给 undefined） */
export async function deleteLink(linkId: string): Promise<void> {
  return request<void>(`/links/${encodeURIComponent(linkId)}`, { method: 'DELETE', auth: true })
}

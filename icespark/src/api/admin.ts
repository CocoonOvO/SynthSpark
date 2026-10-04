import { API_BASE, getJson, readToken, request } from './client'

/**
 * 超管接口（P5）。
 *
 * 三条端点各有各的鉴权口径，写在这里免得页面各猜一遍：
 *
 * | 端点 | 鉴权 | 说明 |
 * |---|---|---|
 * | `GET\|PUT /api/admin/site-config` | **业务库超管**（`is_superuser`） | 站点配置的「后台」那一级，公开读是 `/api/site-config` |
 * | `GET /api/admin/site-config/audit-logs` | **业务库超管** | 站点配置审计（每次保存一条） |
 * | `GET /api/admin/audit-logs` | **配置库超管** | 登录 / 切库等配置库操作。**现有登录弹窗拿不到这种令牌**（它走业务库 `POST /api/auth/token`），所以审计页不读它 |
 * | `POST /api/upload/avatar` | 登录用户 | 头像上传，multipart/form-data |
 *
 * 前两条实测：拿业务库超管令牌调 `GET /api/admin/site-config/audit-logs` 返回
 * `{"logs":[…],"total":1}`；同一令牌调 `GET /api/admin/audit-logs` 返回
 * `{"detail":"无效的认证凭证"}`（那是配置库超管的领域）。
 */

/** 站点配置是**自由结构的 dict**（契约里是两个 `additionalProperties: true` 的对象，没有具名 schema） */
export type SiteConfigPayload = Record<string, unknown>

/** 读后台保存的站点配置（超管）；从没保存过时后端返回 `{}` */
export async function fetchAdminSiteConfig(): Promise<SiteConfigPayload> {
  return getJson<SiteConfigPayload>('/admin/site-config', { auth: true })
}

/** 整份保存站点配置（超管，body 是完整配置 dict，不是补丁） */
export async function saveAdminSiteConfig(
  config: SiteConfigPayload,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('/admin/site-config', {
    method: 'PUT',
    body: config,
    auth: true,
  })
}

/** 站点配置审计日志的一条（实测字段，与契约的 `additionalProperties` 一致） */
export interface SiteConfigAuditLog {
  id: number
  /** 操作者：配置库里的超管 id 与用户名 */
  admin_id: string
  admin_username: string
  /** 动作：目前只有 `update`（保存） */
  action: string
  /** 保存前 / 后的整份配置（较大，页面默认折叠） */
  old_value: unknown
  new_value: unknown
  ip_address?: string | null
  user_agent?: string | null
  /** 后端的本地时间字符串，形如 `2026-09-29 14:11:48`（不是 ISO，带不了时区，页面原样显示） */
  created_at: string
}

/** 审计日志分页响应（`total` 是总条数，不是本页条数） */
export interface SiteConfigAuditLogPage {
  logs: SiteConfigAuditLog[]
  total: number
}

/** 查站点配置审计日志（超管，按时间倒序；`limit` 默认 50、`offset` 默认 0） */
export async function fetchSiteConfigAuditLogs(params: {
  limit?: number
  offset?: number
}): Promise<SiteConfigAuditLogPage> {
  return getJson<SiteConfigAuditLogPage>('/admin/site-config/audit-logs', {
    query: { limit: params.limit, offset: params.offset },
    auth: true,
  })
}

/** 上传接口的响应（实测字段，旧前端 `UploadResponse` 同构） */
export interface UploadResponse {
  url: string
  filename: string
  original_name: string
  size: number
  mime_type: string
}

/**
 * 上传头像（`POST /api/upload/avatar`，multipart/form-data）。
 *
 * 为什么不走 `client.ts` 的 `request()`：那里会给请求体做 `JSON.stringify`
 * 并写死 `Content-Type: application/json` —— 文件上传必须让浏览器自己带
 * `multipart/form-data; boundary=…`，手写 Content-Type 反而会因为缺 boundary 被后端拒掉。
 * 其余规矩照旧：只打 `/api`、令牌从 `readToken()` 来（与带鉴权的 GET 读同一个键）。
 */
export async function uploadAvatar(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)

  const token = readToken()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${API_BASE}/upload/avatar`, { method: 'POST', headers, body: form })
  const text = await response.text()
  let parsed: unknown
  try {
    parsed = text === '' ? undefined : (JSON.parse(text) as unknown)
  } catch {
    parsed = text
  }
  if (!response.ok) {
    const detail = (parsed as { detail?: unknown } | undefined)?.detail
    throw new Error(typeof detail === 'string' ? detail : `上传失败（HTTP ${response.status}）`)
  }
  return parsed as UploadResponse
}

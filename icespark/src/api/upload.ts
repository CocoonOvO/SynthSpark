import { API_BASE, readToken } from './client'

/**
 * 上传接口（P6 写作页新增）：`POST /api/upload/image`，登录用户，multipart/form-data。
 *
 * 契约里这个端点的 200 是**匿名对象**（`{[key: string]: unknown}`，没有具名 schema），
 * 所以字段只能按实测写一份 —— 与 `api/admin.ts` 的 `UploadResponse`（头像上传）
 * 同一口径，那份也是实测字段。实测来源：`backend/app/routers/upload.py` 的返回体。
 *
 * 为什么不走 `client.ts` 的 `postJson()`：它会把请求体 `JSON.stringify` 并写死
 * `Content-Type: application/json`，而文件上传必须让浏览器自己带
 * `multipart/form-data; boundary=…`（少了 boundary 后端直接拒），
 * 所以这里与 `uploadAvatar()` 一样手写 `fetch`。其余规矩照旧：
 * 只打 `/api`、令牌从 `readToken()` 来（与带鉴权的 GET 读同一个键）。
 */
export interface UploadedImage {
  filename: string
  /**
   * 站内路径，形如 `/api/download/{user_id}/images/{filename}`。
   * 可以直接塞进 markdown 的 `![]()`（同源，不需要拼主机名）。
   */
  url: string
  size: number
  content_type: string
}

/** 单张图上限，与后端 `MAX_FILE_SIZE` 一致（10MB）。超了不发请求，直接当场告诉用户 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** 是不是图片。前端这一层只为省一次注定失败的往返，**判定权仍在后端** */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

/** 上传失败时抛的错；`message` 就是后端 `detail` 原文（与 `ApiError` 同一套话术） */
export class UploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadError'
  }
}

/**
 * 上传一张图（正文插图与封面共用这一个端点）。
 *
 * 失败时抛 `UploadError`，`message` 优先用后端 `detail` 原文，没有才按状态码兜底 ——
 * 页面把它原样显示出来，不吞异常、不改写文案。
 */
export async function uploadImage(file: File): Promise<UploadedImage> {
  if (!isImageFile(file)) throw new UploadError('只能上传图片文件')
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError('图片大小不能超过 10MB')

  const form = new FormData()
  form.append('file', file)

  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = readToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const url = `${API_BASE}/upload/image`
  let response: Response
  try {
    response = await fetch(url, { method: 'POST', headers, body: form })
  } catch {
    // 网络层直接抛（后端没起来 / 断网）：给它一句人能读的话，别把 TypeError 漏到界面上
    throw new UploadError('连不上后端：/api/upload/image 不可达')
  }

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = text === '' ? undefined : (JSON.parse(text) as unknown)
  } catch {
    parsed = text
  }

  if (!response.ok) {
    const detail = (parsed as { detail?: unknown } | undefined)?.detail
    throw new UploadError(typeof detail === 'string' ? detail : `上传失败（HTTP ${response.status}）`)
  }

  const data = parsed as Partial<UploadedImage> | undefined
  if (typeof data?.url !== 'string' || !data.url) {
    // 后端 200 但没给 url：这种情况必须显式报错，否则页面会插入一个 `![]()` 空链接
    throw new UploadError('上传接口没有返回 url')
  }

  return {
    filename: typeof data.filename === 'string' ? data.filename : file.name,
    url: data.url,
    size: typeof data.size === 'number' ? data.size : file.size,
    content_type: typeof data.content_type === 'string' ? data.content_type : file.type,
  }
}

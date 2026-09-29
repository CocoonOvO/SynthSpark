import { getJson } from './client'
import type { Link } from './types'

/**
 * 外链接口（契约驱动，架构 §16.2）。
 *
 * 契约的模型叫 `ExternalLink`（types.ts 里导出为 `Link`，与样机同名）。
 * 注意契约里**没有 `description` / `icon`**，而有 `cover_image` / `sort_order` ——
 * 样机 LinksScene 渲染的 `l.description` 在生产版取不到，第二波要停下来定口径。
 */
export async function fetchLinks(): Promise<Link[]> {
  return getJson<Link[]>('/links/')
}

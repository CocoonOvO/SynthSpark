import { getJson } from './client'
import type { Tag } from './types'

/**
 * 标签接口（契约驱动，架构 §16.2）。
 *
 * 不传分页、也不在这里排序：样机是 `loadTags` 里按 `post_count` 倒序（`.slice().sort()`，
 * 先拷贝再排，不原地改接口返回的数组）—— 那属于 store 的取数口径，故留在 store。
 */
export async function fetchTags(): Promise<Tag[]> {
  return getJson<Tag[]>('/tags/')
}

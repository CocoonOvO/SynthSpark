import { getJson } from './client'
import type { Group } from './types'

/**
 * 分组接口（契约驱动，架构 §16.2）。
 *
 * 不传分页：样机就是裸取 `/api/groups/`（契约的 `skip` / `limit` 都是可选的），
 * 页面侧「全部分组」这类筛选项需要拿到完整列表。
 */
export async function fetchGroups(): Promise<Group[]> {
  return getJson<Group[]>('/groups/')
}

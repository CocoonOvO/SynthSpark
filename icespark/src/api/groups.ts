import { getJson, postJson } from './client'
import type { components } from './schema'
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

/**
 * 新建分组（`POST /api/groups/`，**需要登录**，后端 201）。
 *
 * P6 写作页新增（旧前端的「新建分组」走的就是这个端点）。调用方只传 `name`：
 * 契约的 `GroupCreate` 里 `sort_order` 必填但有默认值、`description` / `icon` 可空，
 * 而写作页那个入口只有一个名字输入框（照旧版），不顺手多要字段。
 */
export async function createGroup(name: string): Promise<Group> {
  const body: components['schemas']['GroupCreate'] = { name, sort_order: 0 }
  return postJson<Group>('/groups/', body, { auth: true })
}

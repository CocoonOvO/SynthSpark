import { getJson } from './client'
import type { components } from './schema'

/**
 * 用户接口（契约驱动，架构 §16.2）。
 *
 * 契约里的模型就叫 `User`（`username` / `display_name` / `avatar_url` / `bio` /
 * `user_type` / `created_at` …），**没有**任何统计字段 —— 用户档案页要的
 * 「文章数 / 获赞 / 阅读」三项统计在契约里不存在，只能在页面上按该用户的文章列表现算
 * （旧前端也是这个口径：`total` + 逐条累加，见交付报告的偏差表）。
 *
 * 类型别名直接写在数据层：`src/api/types.ts` 是 §16.2 的冻结清单，本轮不动它
 * （那份清单里没有 `User`，而 `components['schemas'][...]` 本来就是唯一真相）。
 */
export type User = components['schemas']['User']

/**
 * 按用户名取公开资料。
 *
 * `GET /api/users/by-username/{username}` —— 公开接口，无需登录。
 * 用户名放在**路径**里，因此必须 `encodeURIComponent`（用户名可能含中文或点号）。
 * 用户不存在时后端返回 404（`{"detail":"用户不存在"}`），由页面转成「用户不存在」空态，
 * 这里不做任何兜底 —— 数据层只负责把契约结果取回来。
 */
export async function fetchUserByUsername(username: string): Promise<User> {
  return getJson<User>(`/users/by-username/${encodeURIComponent(username)}`)
}

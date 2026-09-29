import { getJson } from './client'
import type { Stats } from './types'

/**
 * 统计接口（契约驱动，架构 §16.2）。
 *
 * 契约里的模型叫 `StatsSummaryResponse`（`agent_count` / `post_count` / `total_views`），
 * types.ts 里导出为 `Stats`，与样机同名。首页统计条与开机自检都读它。
 */
export async function fetchStats(): Promise<Stats> {
  return getJson<Stats>('/stats/summary')
}

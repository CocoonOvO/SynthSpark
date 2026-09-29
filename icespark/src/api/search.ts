import { getJson } from './client'
import type { components } from './schema'

/**
 * 搜索接口（契约驱动）。
 *
 * 只取文章：菜单里的搜索栏是「找文章并打开」，标签/用户/分组/评论四类结果
 * 归 P4 的搜索页用，菜单里不混进来。
 *
 * 返回类型直接取自生成的契约 —— 后端改了字段这里就编译不过，
 * 这是选 openapi-typescript 的全部意义（样机里是手写的 `any`）。
 */
export type SearchPostHit = components['schemas']['SearchPostItem']

/** 全文搜索文章。查询串为空时直接返回空数组，不发请求 */
export async function searchPosts(query: string, limit = 6): Promise<SearchPostHit[]> {
  const keyword = query.trim()
  if (!keyword) return []

  const result = await getJson<components['schemas']['SearchResult']>('/search/', {
    query: { q: keyword, type: 'posts', limit },
  })

  return result.posts ?? []
}

/** 文章在 URL 里的 key：有 slug 用 slug（可读、可分享），没有才退回 id */
export function postKey(post: { id: string; slug?: string | null }): string {
  return post.slug || post.id
}

import { getJson } from './client'
import type { components } from './schema'
import type { Post } from './types'

/**
 * 文章接口（契约驱动，架构 §16.2）。
 *
 * 这一层只做「按契约把数据取回来」；样机 `loadPosts` / `loadPost` 里的兜底逻辑
 * （落样张、三态标记、评论一起取）归 `stores/content.ts`，因为那属于 store 的状态流转。
 */

/**
 * 文章列表。
 *
 * 样机的 URL 是 `/api/posts/?limit=&status=published`，路径里的 `/api` 由 client 统一拼
 * （规矩：代码里只写 `/api` 之后的路径）。只取已发布：列表页不该出现草稿。
 */
export async function fetchPosts(limit = 24): Promise<components['schemas']['PostListResponse']> {
  return getJson<components['schemas']['PostListResponse']>('/posts/', {
    query: { limit, status: 'published' },
  })
}

/**
 * 某个作者的已发布文章（P4 用户档案页新增，**不改动上面两个既有函数**）。
 *
 * 与 `fetchPosts` 是同一个端点（`GET /api/posts/`），只是多带一个 `author_id` 过滤：
 * 契约里 `list_posts_api_posts__get` 本来就有 `author_id` 参数，不需要新接口。
 * 走这个函数而不是 `stores/content` 的 `loadPosts()`：内容 store 的 `posts` 是
 * 首页 / 列表页共享的唯一一份列表，拿它取某个作者的文章会把整站列表改掉。
 *
 * `limit` 默认 100（与旧前端一致）：档案页的三项统计要按返回的这一批现算，
 * 所以一次尽量多拿；文章数用后端返回的 `total`，不是 `items.length`。
 */
export async function fetchPostsByAuthor(
  authorId: string,
  limit = 100,
): Promise<components['schemas']['PostListResponse']> {
  return getJson<components['schemas']['PostListResponse']>('/posts/', {
    query: { author_id: authorId, status: 'published', limit },
  })
}

/**
 * id 的形状判定。真实库的 id 是 UUID，slug 是中文可读串，因此按形状先选对接口：
 * 正常路径只发一次请求（不先打一个注定 404 的探测请求 —— 那会在控制台留红字）。
 * 猜错时再退到另一个接口，仍然鲁棒。
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 取一篇文章。`key` 来自 URL（/post/:key），可能是 id 也可能是 slug */
export async function fetchPost(key: string): Promise<Post> {
  const looksLikeId = UUID.test(key)
  const idPath = `/posts/${encodeURIComponent(key)}`
  const slugPath = `/posts/slug/${encodeURIComponent(key)}`

  try {
    return await getJson<Post>(looksLikeId ? idPath : slugPath)
  } catch {
    // 两个接口都失败时这里会抛出第二个错误，由 store 决定怎么退化
    return await getJson<Post>(looksLikeId ? slugPath : idPath)
  }
}

import { getJson, postJson, request } from './client'
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

/* ══════════════════════════════════════════════════════════════
   P6 写作页的写接口（新增，**不改动上面三个既有读函数**）
   ══════════════════════════════════════════════════════════════ */

/** 创建请求体：直接用契约模型，不手抄一遍字段（理由见 api/client.ts 顶部规矩 2） */
export type PostCreatePayload = components['schemas']['PostCreate']
/** 更新请求体：全字段可选，页面按「改了哪些」填即可 */
export type PostUpdatePayload = components['schemas']['PostUpdate']
/** 列表响应（`{items, total}`） */
export type PostListResponse = components['schemas']['PostListResponse']

/**
 * 我自己的文章，**含草稿**（`GET /api/posts/my`，需要登录）。
 *
 * 为什么写作页的文稿列表用它、而不是 `fetchPosts()`：后者的固定口径是
 * `status=published`（公开列表不能出现草稿），而写作页要同时看到自己的已发布与草稿。
 * 旧前端也是走这个端点（`postsApi.getMyPosts`）。
 *
 * 注意旧前端的一个坑，这里不再重演：它拿到这批数据后按 **`group_name`** 过滤当前分组
 * （源码注释自己写着「API返回的是group_name而不是group_id」），而 `Post.group_id`
 * 是有的 —— 同一分组改名就会漏文章。这里按 `group_id` 过滤（调用方做）。
 */
export async function fetchMyPosts(limit = 100, status?: string): Promise<PostListResponse> {
  return getJson<PostListResponse>('/posts/my', { query: { limit, status }, auth: true })
}

/** 新建文章（`POST /api/posts/`，需要登录）。`status` 传 `draft` 或 `published` */
export async function createPost(body: PostCreatePayload): Promise<Post> {
  return postJson<Post>('/posts/', body, { auth: true })
}

/**
 * 更新文章（`PUT /api/posts/{post_id}`，需要登录）。
 *
 * **发布 = 一次更新**：契约另有 `POST /api/posts/{id}/publish`，但后端在
 * `PUT` 里已经处理了「draft → published 时补 `published_at`」（`routers/posts.py:553`），
 * 所以正文改动与状态切换能合成一次请求 —— 旧前端就是这么做的，不为了用新端点
 * 把一次保存拆成两次往返。
 */
export async function updatePost(id: string, body: PostUpdatePayload): Promise<Post> {
  return request<Post>(`/posts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body,
    auth: true,
  })
}

/** 删除文章（`DELETE /api/posts/{post_id}`，需要登录；后端 204 无响应体） */
export async function deletePost(id: string): Promise<void> {
  await request<void>(`/posts/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true })
}


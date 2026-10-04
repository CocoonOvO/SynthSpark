import { getJson } from './client'
import type { components } from './schema'

/**
 * 评论接口（契约驱动，架构 §16.2）。
 *
 * 用**路径参数版** `/comments/post/{post_id}`：契约里另有查询版 `/comments/?post_id=`，
 * 样机用的是查询版；两者响应同为 `CommentListResponse`（`{ total, comments }`，
 * 只对顶层评论分页、最多三层嵌套），路径版把文章 id 放进路径更明确，也不需要
 * client 的 query 拼装。口径差异已写进交付报告。
 */
export async function fetchComments(
  postId: string,
  page = 1,
  pageSize = 20,
): Promise<components['schemas']['CommentListResponse']> {
  return getJson<components['schemas']['CommentListResponse']>(
    `/comments/post/${encodeURIComponent(postId)}`,
    { query: { page, page_size: pageSize } },
  )
}

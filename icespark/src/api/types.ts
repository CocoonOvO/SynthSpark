import type { components } from './schema'

/**
 * 数据层的对外类型（架构 §16.2 冻结清单）。
 *
 * 为什么全是「生成契约的类型别名」而不是手写 interface：
 * `schema.d.ts` 由 `npm run api:gen` 从后端 /api/openapi.json 生成，手写一遍就等于
 * 把契约抄成第二份真相 —— 后端改了字段这里不会报错，旧前端那 20 处不匹配就是这么攒出来的
 * （见 api/client.ts 顶部的规矩 2）。样机的 interface 只是参照，**字段一律以后端契约为准**。
 *
 * ── 与样机 `design/icespark-prototype/src/data/api.ts` 的差异（第二波页面迁移要看） ──
 *
 * 名字对不上：
 * - 契约叫 `StatsSummaryResponse`，样机叫 `Stats`
 * - 契约叫 `ExternalLink`，样机叫 `Link`
 * - 契约叫 `SearchPostItem`，样机叫 `SearchHit`
 *   （api/search.ts 里还有个 P0 就存在的别名 `SearchPostHit`，指同一个模型；
 *   本轮只按 §16.2 把 postKey 挪走，不动它，避免改别人依赖的导出名）
 *
 * 字段对不上（逐条，`→` 左边契约、右边样机）：
 * - `Post`：契约是**独立模型，没有 `like_count`**；样机 `Post extends PostListItem`，
 *   所以样机详情页能 `post.like_count`（ArticleScene 第 80 行就是这么写的）。
 *   生产版要么改用 `PostListItem`，要么走 `GET /api/likes/{post_id}`（PostWithLikeStatus
 *   里有 like_count / is_liked）—— 本轮不擅自加加载器，已写入交付报告。
 * - `Post`：契约多出 `author_id` / `updated_at`（样机没有），`group_id` / `published_at`
 *   两边都有且可空。
 * - `PostListItem`：契约的 `slug` / `introduction` / `cover_image` / `author_avatar` /
 *   `group_name` / `tags` 全是**可选且可空**（`?: T | null`），样机把它们写成必填
 *   `T | null` / `string[]`。生产版读字段时按可选处理，别再假设一定有值。
 * - `Comment`：契约多出 `parent_id` / `is_deleted` / `updated_at`；
 *   `author` 是 `CommentUserInfo`（`display_name` / `avatar_url` 可选可空）。
 * - `Group`：契约多出 `sort_order` / `created_at` / `updated_at`。
 * - `Tag`：契约多出 `created_at`（没有 `updated_at`）。
 * - `Link`（契约 `ExternalLink`）：**契约里没有 `description`、也没有 `icon`**
 *   —— 样机的 LinksScene 第 116 行渲染 `l.description || '（没有说明）'`，
 *   那个字段取不到，第二波必须停下来问口径，不要自己编一个字段名。
 *   契约多出 `cover_image` / `sort_order` / `created_at` / `updated_at`。
 */
export type PostListItem = components['schemas']['PostListItem']
export type Post = components['schemas']['Post']
export type Comment = components['schemas']['Comment']
export type Stats = components['schemas']['StatsSummaryResponse']
export type Group = components['schemas']['Group']
export type Tag = components['schemas']['Tag']
export type Link = components['schemas']['ExternalLink']
export type SearchHit = components['schemas']['SearchPostItem']

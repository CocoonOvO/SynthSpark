/**
 * 导航动作层
 *
 * 场景组件不直接碰 router，统一走这里。三个好处：
 * - 「转场类型」跟着导航一起传（列表进文章是闪白，切标签是竖条擦除，翻页是无转场）
 * - 前进/后退的可用性有统一的可观察状态（Q/E 与菜单行都要用它决定亮不亮）
 * - 将来换 URL 方案只改这一个文件
 */
import { ref } from 'vue'
import { router } from '../router'
import type { TransitionKind } from './scene'

/** 下一次导航想用的转场：afterEach 里消费掉 */
let nextTransition: TransitionKind = 'wipe'

export function consumeTransition(): TransitionKind {
  const t = nextTransition
  nextTransition = 'wipe' // 浏览器原生前进/后退没设过，默认竖条擦除
  return t
}

/** 前进/后退是否可用（来自 vue-router 的 history state，可观察） */
export const canGoBack = ref(false)
export const canGoForward = ref(false)

export function syncHistoryFlags() {
  const st = router.options.history.state as { back?: unknown; forward?: unknown } | null
  canGoBack.value = Boolean(st?.back)
  canGoForward.value = Boolean(st?.forward)
}

function push(to: Parameters<typeof router.push>[0], t: TransitionKind) {
  nextTransition = t
  return router.push(to)
}

/** 切标签页（只改 URL，画面由 presenter 负责） */
export function goTab(id: string, t: TransitionKind = 'wipe') {
  return push({ name: id }, t)
}

/** 文章列表：分组 / 标签 / 页码都写进 query，URL 可分享 */
export function goPosts(
  opts: { group?: string; tag?: string; page?: number } = {},
  t: TransitionKind = 'none'
) {
  const query: Record<string, string> = {}
  // 保留不归列表管的查询参数（如样机开关 ?demo=1）。
  // 不保留的话，在列表里一翻页 demo 参数就没了，刷新即变回真数据源。
  for (const [k, v] of Object.entries(router.currentRoute.value.query)) {
    if (k === 'group' || k === 'tag' || k === 'page') continue
    if (typeof v === 'string') query[k] = v
  }
  if (opts.group) query.group = opts.group
  if (opts.tag) query.tag = opts.tag
  if (opts.page && opts.page > 1) query.page = String(opts.page)
  return push({ name: 'posts', query }, t)
}

/** 文章详情：key 优先用 slug（可读），没有 slug 才用 id */
export function goArticle(key: string, t: TransitionKind = 'flash') {
  if (!key) return
  return push({ name: 'article', params: { key } }, t)
}

/** 返回上一页（Q 键 / 菜单行） */
export function goBack() {
  if (!canGoBack.value) return
  nextTransition = 'wipe'
  router.back()
}

/** 转到下一页（E 键 / 菜单行） */
export function goForward() {
  if (!canGoForward.value) return
  nextTransition = 'wipe'
  router.forward()
}

/**
 * 场景里的「返回」：优先走浏览器历史。
 * 直接从地址栏打开文章（没有上一页）时退到列表 —— 否则键盘用户会卡死在详情页。
 */
export function goBackOrPosts(group?: string) {
  if (canGoBack.value) return goBack()
  return goPosts(group ? { group } : {})
}

/** 当前完整 URL（样机上用来展示「你现在在哪」，证明路由真的在工作） */
export function currentPath(): string {
  const r = router.currentRoute.value
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(r.query)) if (typeof v === 'string') q.set(k, v)
  const s = q.toString()
  return r.path + (s ? `?${s}` : '')
}

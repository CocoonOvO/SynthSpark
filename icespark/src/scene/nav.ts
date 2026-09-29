import { ref } from 'vue'

import { appRouter } from '@/router'
import type { TransitionKind } from '@/scene/transition'
import { requestTransition } from '@/scene/transition'

/**
 * 导航动作层
 *
 * 场景组件不直接碰 router，统一走这里。三个好处：
 * - 「转场类型」跟着导航一起传（列表进文章是闪白，切标签是竖条擦除，翻页是无转场）
 * - 前进/后退的可用性有统一的可观察状态（Q/E 与菜单行都要用它决定亮不亮）
 * - 将来换 URL 方案只改这一个文件
 *
 * 与样机 `ui/nav.ts` 的唯一结构差异：转场的「下一跳用哪种」不再由本文件保管 ——
 * 样机那个模块内的 `nextTransition`，生产版已由 `@/scene/transition` 的
 * `requestTransition()` 取代（presenter 在导航开始时 `consumeTransition()` 取走，见
 * `scene/presenter.ts`）。所以这里**没有**第二份 `nextTransition` / `consumeTransition`，
 * 写 URL 之前调一次 `requestTransition(t)` 即可。
 */

/**
 * 应用唯一的 router 实例（`@/router` 的惰性单例）。
 * 模块级就拿得到，是因为 `activeTab` 这类模块级 computed 与事件回调（onPad / click）
 * 都跑在组件 setup 之外 —— `useRouter()` 走 `inject`，在那里拿不到实例。
 * 名字沿用样机的 `router`，读代码时与样机一一对得上。
 */
const router = appRouter()

/** 前进/后退是否可用（来自 vue-router 的 history state，可观察） */
export const canGoBack = ref(false)
export const canGoForward = ref(false)

export function syncHistoryFlags() {
  const st = router.options.history.state as { back?: unknown; forward?: unknown } | null
  canGoBack.value = Boolean(st?.back)
  canGoForward.value = Boolean(st?.forward)
}

/**
 * 前进/后退可用性跟着每次导航更新。
 * 样机把这一句写在 router 的 afterEach 里（那里路由与 nav 是同一个模块）；
 * 生产版表现层只订阅转场，这份状态由它的持有者 nav 自己维护。
 * `hooked` 守卫给 HMR 用：模块热替换会再执行一次模块体，不加会重复挂钩子。
 */
let hooked = false
if (!hooked) {
  hooked = true
  router.afterEach(() => syncHistoryFlags())
  syncHistoryFlags()
}

function push(to: Parameters<typeof router.push>[0], t: TransitionKind) {
  requestTransition(t)
  return router.push(to)
}

/** 切标签页（只改 URL，画面由 presenter 负责） */
export function goTab(id: string, t: TransitionKind = 'wipe') {
  return push({ name: id }, t)
}

/** 文章列表：分组 / 标签 / 页码都写进 query，URL 可分享 */
export function goPosts(
  opts: { group?: string; tag?: string; page?: number } = {},
  t: TransitionKind = 'none',
) {
  const query: Record<string, string> = {}
  // 保留不归列表管的查询参数（如样机开关 ?demo=1）。
  // 不保留的话，在列表里一翻页 demo 参数就没了，刷新即变回真数据源。
  // 样机的 ?demo=1 开关本身不迁（架构 §16.2：正式版没有样张），
  // 但这条机制留着：不归列表管的参数在换筛选 / 翻页时同样不该被抹掉。
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
  requestTransition('wipe')
  router.back()
}

/** 转到下一页（E 键 / 菜单行） */
export function goForward() {
  if (!canGoForward.value) return
  requestTransition('wipe')
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

<script setup lang="ts">
/**
 * 审计日志页（P5，超管，路由 `/admin/audit`，场景 id `admin-audit`）。
 *
 * 内容 = **站点配置的保存记录**：`GET /api/admin/site-config/audit-logs?limit=&offset=`
 * → `{ logs, total }`（契约见 design/icespark-ARCHITECTURE.md §23.2，
 * 字段类型见 `@/api/admin` 的 `SiteConfigAuditLog`，那份类型是**实测**来的）。
 *
 * ── 三件事写在最前面，免得后来的人「顺手修」──
 *
 * 1. **不读 `GET /api/admin/audit-logs`**：那一条查的是**配置库**超管的操作
 *    （登录 / 切库 / 改配置库），鉴权走配置库的 `config_admins`，而站点的登录弹窗走的是
 *    业务库 `POST /api/auth/token`，两边的令牌互不相认 —— 实测拿同一个业务库超管令牌调它
 *    返回 `{"detail":"无效的认证凭证"}`。所以这一页只做**站点配置审计**，
 *    需要配置库审计时得先有另一套登录口径（那是新能力，不在本页范围内）。
 *
 * 2. **`created_at` 原样显示，不套 `Date`**：后端给的是本地时间字符串
 *    （形如 `2026-09-29 14:11:48`），不是 ISO 8601 —— 带不了时区。
 *    交给 `Date` 解析会被当成本地时间或 Invalid Date（两种都错），
 *    而这一页要的是「记录里写了什么就显示什么」这种审计口径，所以逐字渲染。
 *
 * 3. **`old_value` / `new_value` 是整份配置，默认必须折叠**：一份配置几 KB，
 *    直接铺开既读不懂也会把页面拉得很长。所以每条日志先给**人能读的形态**
 *    （哪几段被动过、改了哪些字段、旧值 → 新值），原文放在「展开原文」后面，
 *    展开后每栏限高内部滚动 —— 展开再大的 JSON 也不会把整页滚飞。
 *
 * ── 与外壳 / 其它页面一致的部分 ──
 * - 未登录由**路由守卫**送回主页并弹登录框（公共部分已完成），这里**不重复写**；
 *   登录了但不是超管则由**本页自己**渲染「仅超管可见」—— 路由不拦（§23.1 的口径：
 *   登录了的人有权知道这里少了什么）。超管判定读 `stores/auth` 的 `isSuperuser`，
 *   本页不碰公共文件。
 * - 四态显式：`loading` / `ready` / `empty` / `error`；失败把后端 `detail` 原文显示出来
 *   （`ApiError.message` 就是客户端从 `{"detail": …}` 里抠出来的那一句），不吞异常、不白屏、不弹 alert。
 * - 键盘：`useFocusGroup()` + `onPad`，方向键移动焦点、`ENTER` 确认、`Q` 返回上一页；
 *   **`ESC` 一律不消费**，交还全局呼出暂停菜单（全站口径）。页脚一行键位提示。
 * - 配色只走 CSS 变量（scoped 样式里零色值字面量：无 `#hex` / `rgb()` / 渐变 / 圆角 /
 *   外发光 / 模糊），硬边、动效 `steps()`。h1 由本页自己给（`App.vue` 的
 *   `SELF_TITLED_SCENES` 里已含 `admin-audit`），条目标题是 `h2`：h1 → h2 → h3 不跳级。
 */
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

import { fetchSiteConfigAuditLogs, type SiteConfigAuditLog } from '@/api/admin'
import { ApiError } from '@/api/client'
import { focusShellRoot } from '@/input'
import { spatialIndex, useFocusGroup } from '@/input/focus'
import { onPad } from '@/input/pad'
import { playSfx } from '@/input/sfx'
import SceneHead from '@/machine/SceneHead.vue'
import { useStatusBar } from '@/scene/clock'
import { canGoBack, goBack, goTab } from '@/scene/nav'
import { scrollScreenTop } from '@/scene/screen'
import { useAuthStore } from '@/stores/auth'

const { clock, stop } = useStatusBar()
const auth = useAuthStore()

/**
 * 每页条数。
 *
 * 为什么不是 `@/config/prefs` 的 `pageSize`：那是**文章列表**的用户偏好（4 / 6，设置里可改），
 * 审计日志是另一套口径 —— 它按记录条数翻页，条数由这里定死，
 * 免得「用户在设置里把每页改成 6」这种无关操作把审计页的分页算歪（e2e 也才有稳定断言）。
 */
const PAGE_SIZE = 10

/** 明细里最多列几处改动，超出的折进「展开原文」（摘要只负责让人看懂「动了什么」） */
const MAX_CHANGES = 6

/** 四态：`loading` 读取中 · `ready` 有记录 · `empty` 一条都没有 · `error` 后端出错 */
type AuditState = 'loading' | 'ready' | 'empty' | 'error'
const state = ref<AuditState>('loading')

const logs = ref<SiteConfigAuditLog[]>([])
/** 后端给的总条数（契约口径：**不是**本页条数） */
const total = ref(0)
/** 当前第几页（1 起） */
const page = ref(1)
/** 失败时显示的**后端原文** */
const errorText = ref('')

/** 竞态守卫：快速翻页时，慢的那个响应必须丢掉（与 UserProfileView 同一手法） */
let reqId = 0
/** 是否已经成功取过一次（外壳挂载后 `isSuperuser` 才可能由假变真，那时要补一次加载） */
let loadedOnce = false

/** 总页数；按契约用 `total` 算，至少 1 页（空列表也有「第 1 / 1 页」这个位置可显示） */
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const hasPrev = computed(() => page.value > 1)
/**
 * 还有下一页吗。
 *
 * 契约说 `total` 是总条数，那就 `page < pageCount` 就够了；这里额外加一条
 * 「本页满页也算还有下一页」是**实测兜底的容错**：后端目前返回的是
 * `{"logs": …, "total": len(logs)}`（翻 backend/app/routers/site_config.py
 * 就能看到），也就是说 `total` 实际上是**本页条数**。少了这条兜底，
 * 真后端记录超过一页时「下一页」永远是灰的，第 2 页根本翻不到。
 * 两种情况都指向「可能还有」，于是只有在两条都不成立时才禁用。
 */
const hasNext = computed(() => page.value < pageCount.value || logs.value.length >= PAGE_SIZE)

// ── 读取 ──

/** 取某一页；`target` 是 1 起的页码 */
async function load(target: number = page.value): Promise<void> {
  const id = ++reqId
  state.value = 'loading'
  errorText.value = ''
  try {
    const result = await fetchSiteConfigAuditLogs({
      limit: PAGE_SIZE,
      offset: (Math.max(1, target) - 1) * PAGE_SIZE,
    })
    if (id !== reqId) return
    page.value = Math.max(1, target)
    logs.value = result.logs ?? []
    total.value = result.total ?? 0
    // 换了数据就把展开状态清掉：id 是另一批了，留着会「凭空展开」一条看不懂的面板
    expanded.clear()
    // 焦点回到第一条：翻页后原来的 index 可能已经越界
    listFocus.set(0, true)
    loadedOnce = true
    state.value = logs.value.length === 0 ? 'empty' : 'ready'
    // 这一次结果可能让某个焦点格子消失（空态没有列表、第一页没有翻页行）：
    // 不把焦点挪走，方向键按下去屏幕上就什么都不动（焦点停在不存在的格子上）
    if (rows.value.length === 0) zone.value = 'back'
    else if (!showPager.value && zone.value === 'pager') zone.value = 'list'
  } catch (error) {
    if (id !== reqId) return
    // 后端原文优先（ApiError.message 就是 {"detail": …} 里那一句）；
    // 网络层失败（fetch 抛 TypeError）没有后端原文，给一句兜底
    errorText.value = error instanceof ApiError ? error.message : '连不上后端：审计日志接口不可达。'
    state.value = 'error'
  }
}

onMounted(() => {
  scrollScreenTop()
  // 非超管不发请求：既然后端也会 403，何必打一次（前端门只是省一次往返，不是安全边界）
  if (auth.isSuperuser) void load(1)
})

/**
 * 登录态是异步补齐的（外壳挂载时 `auth.bootstrapAuth()` 会拿 `/api/auth/me` 校正一次缓存），
 * 所以「进页面时已经不是超管、随后变成超管」这条路也要接上，否则页面永远停在初始态。
 */
watch(
  () => auth.isSuperuser,
  (isSuper) => {
    if (isSuper && !loadedOnce) void load(1)
  },
)

onUnmounted(() => {
  stop()
  if (bumpTimer) window.clearTimeout(bumpTimer)
})

// ── 翻页 ──

/** 到边界时抖一下（与列表页同一手法：让用户知道按键被听见了，只是过不去） */
const bumping = ref(false)
let bumpTimer: number | null = null

function bump(): void {
  bumping.value = true
  if (bumpTimer) window.clearTimeout(bumpTimer)
  bumpTimer = window.setTimeout(() => (bumping.value = false), 380)
}

/** 翻一页；`dir` 为 1 下一页 / -1 上一页。到边界不动、抖一下，按键照样算用掉 */
function turn(dir: 1 | -1): void {
  if (dir > 0 && !hasNext.value) {
    bump()
    return
  }
  if (dir < 0 && !hasPrev.value) {
    bump()
    return
  }
  playSfx('transition')
  scrollScreenTop()
  void load(page.value + dir)
}

// ── 展开 / 收起原文 ──

/**
 * 已展开的日志 id。
 *
 * 用 `Set` 而不是「当前展开的那一条」：审计时经常要对着两条记录比，
 * 允许并列展开更顺手；每条面板自己限高，展开多少条都不会滚飞。
 */
const expanded = reactive(new Set<number>())

/** 收起时，原生焦点可能正好落在跟着一起消失的原文框 / 按钮上（见 toggleLog） */
async function collapseDone(): Promise<void> {
  await nextTick()
  const el = document.activeElement as HTMLElement | null
  // 焦点掉回 body 之后键盘事件不再冒泡到外壳监听器，整块键盘当场失灵
  //（`src/input/index.ts` 的注释），所以必须收回外壳根节点
  if (!el || el === document.body || !el.isConnected) focusShellRoot()
}

function toggleLog(log: SiteConfigAuditLog): void {
  playSfx('confirm')
  if (expanded.has(log.id)) {
    expanded.delete(log.id)
    void collapseDone()
    return
  }
  expanded.add(log.id)
}

/** 条目上的鼠标点击：展开区里的点击（选字、拖滚动条）不该顺手把面板收起来 */
function onLogClick(log: SiteConfigAuditLog, event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('.raw')) return
  toggleLog(log)
}

// ── 人能读的形态：把「整份配置」折成「动了哪几段 + 改了哪些字段」 ──

interface FieldChange {
  path: string
  before: string
  after: string
}

interface SectionSummary {
  key: string
  changes: number
}

interface LogSummary {
  sections: SectionSummary[]
  shown: FieldChange[]
  hidden: number
  /** 前后都没记录内容（后端 `json.dumps(None)` 存成 NULL 的情况） */
  noContent: boolean
  /** 旧值是空的：这是首次保存，没有「上一次」可比 */
  firstSave: boolean
  /** 前后字段完全一致 */
  same: boolean
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 压成短串：摘要里只放一眼能看懂的那一段，太长就截断 */
function clip(text: string, max = 72): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max)}…` : one
}

/**
 * 把配置拍平成「字段路径 → 文本值」。
 *
 * 数组**整体**当一个字段比（站点配置里数组是「整体替换」的语义：navItems / links 一改就是整段），
 * 逐项 diff 只会产出一堆看着像改动的噪音；对象继续往下钻，
 * 这样 `site.description` 这种具体字段才浮得出来。
 */
function flattenLeaves(
  value: unknown,
  prefix = '',
  out = new Map<string, string>(),
): Map<string, string> {
  if (value === null || value === undefined) return out
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenLeaves(child, prefix ? `${prefix}.${key}` : key, out)
    }
    return out
  }
  out.set(prefix || '(根)', Array.isArray(value) ? JSON.stringify(value) : String(value))
  return out
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    // 循环引用之类：对象是后端 JSON 来的，正常不会走到这里，但不能因此让整页崩掉
    return String(value)
  }
}

/** 一条日志的摘要（在 `rows` 里算一次，模板只读结果） */
function summarize(log: SiteConfigAuditLog): LogSummary {
  const beforeValue = log.old_value
  const afterValue = log.new_value
  const noContent =
    (beforeValue === null || beforeValue === undefined) &&
    (afterValue === null || afterValue === undefined)

  const before = flattenLeaves(beforeValue)
  const after = flattenLeaves(afterValue)
  const paths = new Set<string>([...before.keys(), ...after.keys()])
  const changes: FieldChange[] = []
  for (const path of paths) {
    const oldText = before.get(path)
    const newText = after.get(path)
    if (oldText !== newText) {
      changes.push({ path, before: clip(oldText ?? '（无）'), after: clip(newText ?? '（无）') })
    }
  }

  // 段级统计：顶层 key（site / navbar / footer / home / about）各自动了几处，
  // 先给结论再给明细 —— 这正是「人能读」与「一坨 JSON」的区别
  const bySection = new Map<string, number>()
  for (const change of changes) {
    const dot = change.path.indexOf('.')
    const key = dot > 0 ? change.path.slice(0, dot) : change.path
    bySection.set(key, (bySection.get(key) ?? 0) + 1)
  }
  const topKeys: string[] = []
  for (const source of [beforeValue, afterValue]) {
    if (isPlainObject(source)) {
      for (const key of Object.keys(source)) if (!topKeys.includes(key)) topKeys.push(key)
    }
  }
  for (const key of bySection.keys()) if (!topKeys.includes(key)) topKeys.push(key)

  const firstSave =
    !noContent && (beforeValue === null || beforeValue === undefined) && changes.length > 0

  return {
    sections: topKeys.map((key) => ({ key, changes: bySection.get(key) ?? 0 })),
    shown: changes.slice(0, MAX_CHANGES),
    hidden: Math.max(0, changes.length - MAX_CHANGES),
    noContent,
    firstSave,
    same: !noContent && changes.length === 0,
  }
}

/** 模板一次遍历同时拿日志与它的摘要（避免在模板里反复算 diff） */
const rows = computed(() =>
  logs.value.map((log) => ({
    log,
    summary: summarize(log),
    raw: { before: prettyRaw(log.old_value), after: prettyRaw(log.new_value) },
  })),
)

/** 原文展示：能 JSON 化就缩进两格，不能就原样（脏数据是字符串时也不该显示成乱码） */
function prettyRaw(value: unknown): string {
  if (value === null || value === undefined) return '（本次没有记录）'
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  const text = safeStringify(value)
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/** 动作的人话标签；`action` 本身也照原样显示在条目头上（审计页不美化原始值） */
const ACTION_LABEL: Record<string, string> = { update: '保存站点配置' }
function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action
}

/** 没记到 IP / UA 时给一句人话，而不是空格子 */
function orDash(value: string | null | undefined): string {
  return value && value.trim() !== '' ? value : '未记录'
}

// ── 焦点：返回键 · 日志列表（单列）· 翻页行（两格），键盘与鼠标共享同一份状态 ──

type Zone = 'back' | 'list' | 'pager'
const zone = ref<Zone>('list')
const listFocus = useFocusGroup({ initial: 0 })
const pagerFocus = useFocusGroup({ initial: 0 })

/** 翻页行只有一页时不该出现在焦点路径上（否则多一格死键） */
const showPager = computed(
  () => state.value === 'ready' || (state.value === 'empty' && page.value > 1),
)

function isLogFocused(i: number): boolean {
  return zone.value === 'list' && listFocus.index.value === i
}
function isPagerFocused(i: number): boolean {
  return zone.value === 'pager' && pagerFocus.index.value === i
}
function isBackFocused(): boolean {
  return zone.value === 'back'
}

/** 返回上一页：历史里有上一页就回退，深链接进来没有上一页就回主页（键盘 Q 与页头按钮同一条路） */
function back(): void {
  playSfx('confirm')
  if (canGoBack.value) {
    goBack()
    return
  }
  void goTab('home')
}

/** 鼠标：划过共享焦点（静音），点击直接执行 */
function hoverLog(i: number): void {
  zone.value = 'list'
  listFocus.hover(i)
}
function hoverPager(i: number): void {
  zone.value = 'pager'
  pagerFocus.hover(i)
}
function hoverBack(): void {
  zone.value = 'back'
}

/**
 * 原生焦点与自绘焦点共存的两条规矩（与 `UserProfileView.vue` / `PostDetailView.vue` 同源）：
 *
 * 1. 原生焦点落在会响应回车的元素上（页头返回键、翻页键）时，回车交给浏览器原生激活 ——
 *    否则「Tab 到返回键按回车」会被本页吞掉。
 * 2. 我们自己的焦点一动（方向键 / 鼠标划过）就收掉原生焦点，
 *    屏幕上永远只有一个光标（闪烁方块）。**收回到外壳根节点，不是 `blur()`**：
 *    焦点掉到 body 之后键盘事件不再冒泡到外壳，整块键盘会失灵。
 */
function nativeOwnsEnter(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return false
  return el.matches('a[href], button, input, select, textarea, [role="button"], [role="link"]')
}

/**
 * 原生焦点落在**展开的原文框**里时，方向键让给浏览器。
 *
 * 原文框是一个 `max-height` + `overflow: auto` 的滚动区（`tabindex="0"`，
 * 既让屏幕阅读器 / Tab 用户够得到，也让 axe 的 `scrollable-region-focusable` 通过）。
 * 它被聚焦时方向键该滚的是**这段 JSON**，不是移走焦点 ——
 * 与「输入框里不劫持按键」是同一条口径。
 */
function nativeOwnsArrows(): boolean {
  const el = document.activeElement as HTMLElement | null
  return !!el && el.classList.contains('raw-box')
}

function dropNativeFocus(): void {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return
  focusShellRoot()
}

/** 焦点在列表里时能用方向键走到翻页行吗（空态第 2 页也有翻页行，那里没有条目） */
function focusPagerFromList(): boolean {
  if (!showPager.value) return false
  zone.value = 'pager'
  pagerFocus.set(hasPrev.value ? 0 : 1, true)
  playSfx('move')
  return true
}

const off = onPad((a) => {
  // Q：全站的历史后退键。这里显式接管，只是为了让「深链接进来没有上一页」也有落点
  if (a === 'back') {
    back()
    return true
  }

  // 翻页：PgUp / PgDn 与列表页同一套按键（比走到翻页按钮再回车快）
  if (a === 'pagePrev') {
    turn(-1)
    return true
  }
  if (a === 'pageNext') {
    turn(1)
    return true
  }

  if (a === 'confirm') {
    if (nativeOwnsEnter()) return false
    if (zone.value === 'back') {
      back()
      return true
    }
    if (zone.value === 'pager') {
      turn(pagerFocus.index.value === 0 ? -1 : 1)
      return true
    }
    const row = rows.value[listFocus.index.value]
    if (!row) return false
    toggleLog(row.log)
    return true
  }

  if (a === 'up' || a === 'down' || a === 'left' || a === 'right') {
    // 看原文时方向键归浏览器（滚这段 JSON），见 nativeOwnsArrows
    if (nativeOwnsArrows()) return false
    dropNativeFocus()

    if (zone.value === 'back') {
      if (a === 'down') {
        if (rows.value.length > 0) {
          zone.value = 'list'
          playSfx('move')
          return true
        }
        return focusPagerFromList()
      }
      return false
    }

    if (zone.value === 'pager') {
      if (a === 'up') {
        if (rows.value.length > 0) {
          zone.value = 'list'
          listFocus.set(rows.value.length - 1, true)
          playSfx('move')
          return true
        }
        zone.value = 'back'
        playSfx('move')
        return true
      }
      const next = spatialIndex(pagerFocus.index.value, a, 2, 2)
      if (next === null) return false
      pagerFocus.set(next)
      return true
    }

    const next = spatialIndex(listFocus.index.value, a, 1, rows.value.length)
    if (next === null) {
      // 第一条再往上 → 页头返回键；最后一条再往下 → 翻页行（没有翻页行就把按键还给浏览器滚动）
      if (a === 'up' && rows.value.length > 0) {
        zone.value = 'back'
        playSfx('move')
        return true
      }
      if (a === 'down') return focusPagerFromList()
      return false
    }
    listFocus.set(next)
    return true
  }

  // ESC **不消费**：本页没有「先退出某一格」的中间态，按下就交还全局呼出暂停菜单（全站口径）。
  // 展开的原文也用 ENTER 收起（再按一次），不跟 ESC 抢。
  if (a === 'cancel') return false

  return false
})
onUnmounted(off)
</script>

<template>
  <div class="audit" data-testid="audit-page">
    <SceneHead title="审计日志 · AUDIT" :clock="clock">
      <span class="head-src px">site-config</span>
      <button
        class="back focusable mini"
        data-testid="audit-back"
        :class="{ 'is-focused': isBackFocused() }"
        @mouseenter="hoverBack"
        @click="back"
      >
        ◀ 返回 (Q)
      </button>
    </SceneHead>

    <!-- h1 在四个状态里都在（本页自带一级标题，外壳不再发隐藏 h1），页面不会出现没有 h1 的状态 -->
    <header class="page-head">
      <h1 class="page-title px px-36 px-display">审计日志</h1>
      <p class="page-sub read">
        站点配置的每一次保存：谁改的、什么时候、动到哪几段、保存前后各是什么。整份配置默认折叠。
      </p>
      <!-- 数据来源写在明面上：这一页只查「站点配置审计」，不含配置库审计（文件头有原因） -->
      <p class="page-note hint px" data-testid="audit-source">
        数据源 /api/admin/site-config/audit-logs · 站点配置保存记录
      </p>
    </header>

    <!-- 非超管：页面自己渲染这块提示（路由不拦，登录了的人有权知道这里少了什么） -->
    <div v-if="!auth.isSuperuser" class="state" data-testid="audit-denied">
      <p class="state-title">仅超管可见</p>
      <p class="state-hint hint">
        这一页读的是站点配置的保存记录，只有超管账号能看到。当前账号没有这项权限。
      </p>
    </div>

    <template v-else>
      <div class="readout px" data-testid="audit-readout">
        <span data-testid="audit-total">共 {{ total }} 条</span>
        <span data-testid="audit-position">第 {{ page }} / {{ pageCount }} 页</span>
        <span class="readout-hint hint">每页 {{ PAGE_SIZE }} 条</span>
      </div>

      <!-- 状态一：读取中 -->
      <div v-if="state === 'loading'" class="state px" data-testid="audit-loading">
        <span class="blink">▌</span> 读取审计日志 …
      </div>

      <!-- 状态二：失败 —— 后端 detail 原文照登，不吞异常也不白屏 -->
      <div v-else-if="state === 'error'" class="state" data-testid="audit-error">
        <p class="state-title">审计日志读取失败。</p>
        <p class="state-detail px" data-testid="audit-error-detail">{{ errorText }}</p>
        <p class="state-hint hint">后端不可达或接口出错，稍后再试（或按 Q 返回上一页）。</p>
      </div>

      <!-- 状态三：空态 —— 「一条都没有」和「这一页没有」要分开说 -->
      <div v-else-if="state === 'empty'" class="state" data-testid="audit-empty">
        <p class="state-title">
          {{ page > 1 ? '这一页没有记录。' : '还没有任何站点配置的保存记录。' }}
        </p>
        <p class="state-hint hint">
          {{
            page > 1
              ? '记录可能被删掉了，按上一页回去看看。'
              : '在「站点设置」里保存一次配置，这里就会出现第一条记录。'
          }}
        </p>
      </div>

      <!-- 状态四：有记录 —— 一条一张卡，单列（与用户档案的文章列表同一版式语言） -->
      <div v-else class="logs" data-testid="audit-list">
        <article
          v-for="(row, i) in rows"
          :key="row.log.id"
          class="log focusable"
          :class="{ 'is-focused': isLogFocused(i), 'is-open': expanded.has(row.log.id) }"
          :aria-labelledby="`audit-log-${row.log.id}`"
          data-testid="audit-log"
          @mouseenter="hoverLog(i)"
          @click="onLogClick(row.log, $event)"
        >
          <div class="log-head px">
            <span class="log-action" data-testid="audit-action">{{ row.log.action }}</span>
            <span class="log-actor" data-testid="audit-actor">{{ row.log.admin_username }}</span>
            <!-- created_at 是后端本地时间字符串（不是 ISO），逐字显示 -->
            <span class="log-time num" data-testid="audit-time">{{ row.log.created_at }}</span>
          </div>

          <!-- h2：h1（页面名）→ h2（每条记录）→ h3（原文栏）不跳级 -->
          <h2 :id="`audit-log-${row.log.id}`" class="log-title">
            {{ actionLabel(row.log.action) }}
          </h2>

          <div class="log-meta px num">
            <span data-testid="audit-ip">IP {{ orDash(row.log.ip_address) }}</span>
            <span class="log-ua" :title="row.log.user_agent || '未记录'">
              UA {{ orDash(row.log.user_agent) }}
            </span>
          </div>

          <div class="diff" data-testid="audit-summary">
            <div v-if="row.summary.sections.length" class="chip-row px">
              <span
                v-for="section in row.summary.sections"
                :key="section.key"
                class="chip"
                :class="{ 'is-changed': section.changes > 0 }"
              >
                {{ section.key }}
                <template v-if="section.changes > 0"> · {{ section.changes }} 处</template>
                <template v-else> · 未变</template>
              </span>
            </div>

            <p class="diff-line read">
              <template v-if="row.summary.noContent">本次没有记录配置内容。</template>
              <template v-else-if="row.summary.firstSave">
                首次保存：没有上一次的内容可比（下面是本次写入的字段）。
              </template>
              <template v-else-if="row.summary.same">
                本次保存与上一次内容相同（没有字段变化）。
              </template>
              <template v-else
                >共 {{ row.summary.shown.length + row.summary.hidden }} 处字段改动：</template
              >
            </p>

            <ul v-if="!row.summary.noContent && !row.summary.same" class="change-list">
              <li v-for="change in row.summary.shown" :key="change.path" class="change px">
                <span class="change-path" data-testid="audit-change-path">{{ change.path }}</span>
                <span class="change-old">{{ change.before }}</span>
                <span class="change-new">{{ change.after }}</span>
              </li>
            </ul>

            <p v-if="row.summary.hidden > 0" class="diff-more hint px">
              还有 {{ row.summary.hidden }} 处改动，展开原文看全部。
            </p>
          </div>

          <!-- 折叠的开关：鼠标能点（.stop 防止和卡片的点击各切一次），键盘 ENTER 走同一个 toggleLog -->
          <button
            type="button"
            class="toggle focusable"
            data-testid="audit-toggle"
            :aria-expanded="expanded.has(row.log.id)"
            :aria-controls="`audit-raw-${row.log.id}`"
            @click.stop="toggleLog(row.log)"
          >
            <span aria-hidden="true">{{ expanded.has(row.log.id) ? '▾' : '▸' }}</span>
            {{ expanded.has(row.log.id) ? '收起原文 (ENTER)' : '展开原文 (ENTER)' }}
          </button>

          <!-- 原文：两栏（保存前 / 保存后），每栏限高内部滚动 —— JSON 再大也不把整页滚飞 -->
          <div
            v-if="expanded.has(row.log.id)"
            :id="`audit-raw-${row.log.id}`"
            class="raw"
            data-testid="audit-raw"
          >
            <div class="raw-col">
              <h3 class="raw-title px">保存前 old_value</h3>
              <div
                class="raw-box"
                tabindex="0"
                role="group"
                aria-label="保存前的配置原文（可滚动）"
              >
                <pre class="raw-json">{{ row.raw.before }}</pre>
              </div>
            </div>
            <div class="raw-col">
              <h3 class="raw-title px">保存后 new_value</h3>
              <div
                class="raw-box"
                tabindex="0"
                role="group"
                aria-label="保存后的配置原文（可滚动）"
              >
                <pre class="raw-json">{{ row.raw.after }}</pre>
              </div>
            </div>
          </div>
        </article>
      </div>

      <!-- 翻页行：翻页键与提示同在一行；空态第 2 页也带它，好让人走回去 -->
      <div v-if="showPager" class="pager" :class="{ bump: bumping }" data-testid="audit-pager">
        <button
          type="button"
          class="page-btn focusable"
          data-testid="audit-prev"
          :disabled="!hasPrev"
          :class="{ 'is-focused': isPagerFocused(0) }"
          @mouseenter="hoverPager(0)"
          @click="turn(-1)"
        >
          ◀ 上一页 (PgUp)
        </button>
        <span class="pager-count px num">
          PAGE {{ page }} / {{ pageCount }} · 共 {{ total }} 条
        </span>
        <button
          type="button"
          class="page-btn focusable"
          data-testid="audit-next"
          :disabled="!hasNext"
          :class="{ 'is-focused': isPagerFocused(1) }"
          @mouseenter="hoverPager(1)"
          @click="turn(1)"
        >
          下一页 (PgDn) ▶
        </button>
      </div>
    </template>

    <div class="foot px hint">
      ↑↓ 选记录 · ENTER 展开 / 收起原文 · PgUp/PgDn 翻页 · Q 返回 · P / ESC 菜单
    </div>
  </div>
</template>

<style scoped>
.audit {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 18px 26px 16px;
  gap: 14px;
}

.head-src {
  color: var(--blue-600);
}

/* 页头的返回键：与用户档案 / 列表页同一个按钮语言（硬边、直角） */
.back,
.toggle,
.page-btn {
  font: inherit;
  background: var(--paper);
  border: var(--border-thin) solid var(--blue-400);
  color: var(--blue-700);
  padding: 2px 8px;
  cursor: pointer;
}

.page-btn:disabled {
  color: var(--ink-faint);
  border-color: var(--blue-200);
  cursor: default;
}

.page-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.page-title {
  margin: 0;
  color: var(--ink);
}

.page-sub {
  margin: 0;
  font-size: var(--read-small);
  color: var(--ink-soft);
  max-width: 68ch;
}

.page-note {
  margin: 0;
}

/* ── 读数行：总数 / 页码（机器读数走像素字体） ── */
.readout {
  display: flex;
  align-items: baseline;
  gap: 16px;
  border-bottom: var(--border-thin) solid var(--blue-200);
  padding-bottom: 8px;
  color: var(--blue-700);
}

.readout-hint {
  margin-left: auto;
}

/* ── 四态：与其它页面同一套空态语言（虚线框 + 居中的一两句话） ── */
.state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: var(--border-frame) dashed var(--blue-400);
  color: var(--ink);
  min-height: 200px;
  padding: 22px;
  text-align: center;
}

.state-title {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 16px;
  margin: 0;
}

.state-detail {
  margin: 0;
  max-width: 60ch;
  color: var(--blue-700);
  overflow-wrap: anywhere;
}

.state-hint {
  margin: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 13px;
  max-width: 56ch;
}

/* ── 记录列表：单列，一条一张卡 ── */
.logs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.log {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--paper);
  border: var(--border-frame) solid var(--blue-400);
  padding: 10px 12px;
  cursor: pointer;
  min-width: 0;
}

/* 展开的那条：边框加深一档，扫一眼就知道原文是从哪条长出来的 */
.log.is-open {
  border-color: var(--blue-500);
}

.log-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.log-action {
  border: var(--border-hair) solid var(--blue-400);
  background: var(--blue-100);
  color: var(--blue-700);
  padding: 0 6px;
}

.log-actor {
  color: var(--blue-600);
}

.log-time {
  margin-left: auto;
  color: var(--ink-faint);
}

.log-title {
  margin: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 17px;
  line-height: 1.45;
}

.log-meta {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
  color: var(--ink-soft);
}

/* UA 串很长：截断显示，完整值留在 title 里（鼠标悬停看得到） */
.log-ua {
  max-width: 56ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 改动摘要：段级芯片 + 字段明细 ── */
.diff {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: var(--border-thin) solid var(--blue-200);
  padding-top: 8px;
}

.chip-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  border: var(--border-hair) solid var(--blue-300);
  color: var(--ink-soft);
  padding: 0 6px;
}

.chip.is-changed {
  border-color: var(--blue-500);
  color: var(--blue-700);
  background: var(--blue-100);
}

.diff-line {
  margin: 0;
  font-size: 13px;
  color: var(--ink);
}

.change-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 三列：字段路径 / 旧值 / 新值 —— 旧值划掉，一眼看出是替换 */
.change {
  display: grid;
  grid-template-columns: minmax(10ch, 22ch) 1fr 1fr;
  gap: 10px;
  align-items: baseline;
  min-width: 0;
}

.change-path {
  color: var(--blue-600);
  overflow-wrap: anywhere;
}

.change-old {
  color: var(--ink-faint);
  text-decoration: line-through;
  overflow-wrap: anywhere;
}

.change-new {
  color: var(--ink);
  overflow-wrap: anywhere;
}

.diff-more {
  margin: 0;
}

.toggle {
  align-self: flex-start;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

/* ── 原文：两栏等宽，每栏限高内部滚动 ── */
.raw {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  cursor: auto;
}

.raw-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.raw-title {
  margin: 0;
  color: var(--blue-600);
}

/* 限高 + 内部滚动是「展开一大段 JSON 不把整页滚飞」的实现；
   tabindex="0" 让它既是屏幕阅读器 / Tab 用户够得到的区域，
   也满足 axe 的 scrollable-region-focusable */
.raw-box {
  max-height: 240px;
  overflow: auto;
  border: var(--border-hair) solid var(--blue-300);
  background: var(--blue-100);
}

.raw-json {
  margin: 0;
  padding: 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: 'ArkPixel', 'JetBrains Mono', 'Noto Sans Mono', monospace;
  font-size: var(--px-sm);
  line-height: 1.6;
  color: var(--ink);
}

/* ── 翻页行 ── */
.pager {
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: var(--border-thin) solid var(--blue-200);
  padding-top: 8px;
}

.pager-count {
  color: var(--ink-soft);
}

/* 到边界时抖一下：像素世界用离散位移（steps），且 motion-off 由 pixel.css 的 `.bump` 统一关掉 */
.bump {
  animation: audit-bump 380ms steps(2, end) 2;
}

@keyframes audit-bump {
  0% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(3px);
  }
  100% {
    transform: translateX(0);
  }
}

.foot {
  margin-top: auto;
  border-top: var(--border-thin) solid var(--blue-200);
  padding-top: 8px;
}

.num {
  font-variant-numeric: tabular-nums;
}

@media (max-width: 900px) {
  .raw {
    grid-template-columns: 1fr;
  }

  .change {
    grid-template-columns: 1fr;
  }

  .log-ua {
    max-width: 100%;
  }
}
</style>

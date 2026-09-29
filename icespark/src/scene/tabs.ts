import { computed, ref, watch } from 'vue'

import { focusZone } from '@/input/scopes'
import { appRouter } from '@/router'
import { goTab } from '@/scene/nav'
import type { TransitionKind } from '@/scene/transition'

/**
 * 标签页（8bit tab 栏）
 *
 * 浏览类页面（主页 / 文章 / 关联 / 关于）是并列的四个标签页，不是层层深入的页面。
 * 第 5 轮起「当前是哪个标签页」**由路由决定**（`/`、`/posts`、`/links`、`/about`），
 * 不再是一份自持的 ref —— 否则地址栏、前进后退、标签高亮三者会对不上。
 *
 * 焦点分区 focusZone：
 * - 'content' 场景内容持有焦点（默认）
 * - 'tabs'    焦点在标签栏上（键盘按 ↑ 顶到内容之上，或鼠标划过标签栏）
 * 鼠标路径与键盘路径共用同一套状态，因此不存在「只有鼠标能点标签、键盘进不去」的问题。
 */

// 焦点分区定义在输入层（input/scopes.ts），这里只是把它再导出，方便组件从一处引入
export { focusZone }

/**
 * 应用唯一的 router 实例（`@/router` 的惰性单例）。
 * `activeTab` 是模块级 computed，跑在组件 setup 之外，`useRouter()` 在这里拿不到实例；
 * 名字沿用样机的 `router`，读代码时与样机一一对得上。
 */
const router = appRouter()

export interface TabDef {
  id: string
  label: string
  en: string
}

/** id 必须与路由名一致，标签高亮与 URL 才是同一份事实 */
export const TABS: TabDef[] = [
  { id: 'home', label: '主页', en: 'HOME' },
  { id: 'posts', label: '文章', en: 'POSTS' },
  { id: 'links', label: '关联', en: 'LINKS' },
  { id: 'about', label: '关于', en: 'ABOUT' },
]

export const TAB_IDS = TABS.map((t) => t.id)

/** 当前标签页：直接读路由名（文章详情等非标签页返回空串） */
export const activeTab = computed(() => {
  const name = String(router.currentRoute.value.name ?? '')
  return TAB_IDS.includes(name) ? name : ''
})

export const tabIndex = computed(() => Math.max(0, TAB_IDS.indexOf(activeTab.value)))

/**
 * 标签栏里的光标位置。与 activeTab 分开是必须的：
 * 鼠标划过标签栏时只应移动光标（静音预览），点击或回车才真的跳页。
 * 若拿 activeTab 当光标，划一下就跳页了。
 */
export const tabCursor = ref(0)

// 页面切走（无论从哪条路径）后，光标回到当前页签上
watch(tabIndex, (i) => (tabCursor.value = i), { immediate: true })

/** 当前页面是否有标签栏。没有标签栏的页面（文章详情）不参与 Tab 切换 */
export const onTabScene = computed(() => activeTab.value !== '')

/** 切到某个标签页（写 URL，画面交给 presenter） */
export function switchTab(id: string, transition: TransitionKind = 'wipe') {
  if (!TAB_IDS.includes(id)) return
  focusZone.value = 'content'
  goTab(id, transition)
}

/** 左右循环切标签（Tab / Shift+Tab） */
export function cycleTab(dir: 1 | -1) {
  const n = TABS.length
  const i = (((tabIndex.value + dir) % n) + n) % n
  // `!` 只是给 tsconfig 的 noUncheckedIndexedAccess 交差：i 由上式的取模保证在 [0, n) 内
  switchTab(TABS[i]!.id)
}

/** 把焦点交给标签栏；带序号时移动光标到该页签 */
export function focusTabs(i?: number) {
  const n = TABS.length
  tabCursor.value = typeof i === 'number' ? ((i % n) + n) % n : tabIndex.value
  focusZone.value = 'tabs'
}

/** 光标在标签栏内左右移动（不跳页，仅预览） */
export function moveTabCursor(dir: 1 | -1) {
  const n = TABS.length
  tabCursor.value = (tabCursor.value + dir + n) % n
}

/** 焦点离开标签栏回到内容 */
export function blurTabs() {
  focusZone.value = 'content'
}

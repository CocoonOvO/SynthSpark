/**
 * 标签页（8bit tab 栏）
 *
 * 浏览类页面（主页 / 文章 / 关联 / 关于）是并列的四个标签页，不是层层深入的页面。
 * 因此它们的切换用 resetTo（清空历史），而不是 pushScene —— 否则点四下标签会攒出四级历史。
 *
 * 焦点分区 focusZone：
 * - 'content' 场景内容持有焦点（默认）
 * - 'tabs'    焦点在标签栏上（键盘按 ↑ 顶到列表首行之上，或按 Q/E 直接切页）
 * 鼠标路径与键盘路径共用同一套状态，因此不存在「只有鼠标能点标签、键盘进不去」的问题。
 */
import { ref, computed } from 'vue'
import { currentScene, resetTo, type TransitionKind } from './scene'
import { focusZone } from './pad'

// 焦点分区定义在输入层（pad.ts），这里只是把它再导出，方便组件从一处引入
export { focusZone }

export interface TabDef {
  id: string
  label: string
  en: string
}

export const TABS: TabDef[] = [
  { id: 'home', label: '主页', en: 'HOME' },
  { id: 'posts', label: '文章', en: 'POSTS' },
  { id: 'links', label: '关联', en: 'LINKS' },
  { id: 'about', label: '关于', en: 'ABOUT' },
]

export const TAB_IDS = TABS.map((t) => t.id)

export const activeTab = ref<string>('home')
export const tabIndex = ref(0)

/** 当前场景是否是标签页（文章详情不是，它自带返回） */
export const onTabScene = computed(() => TAB_IDS.includes(currentScene.value.id))

/** 文章标签页的浏览状态：往返文章详情后回来，翻页与筛选不丢 */
export const postsView = ref({ page: 0, group: '', tag: '' })

/** 切到某个标签页（清空历史，标签页是栈底） */
export function switchTab(id: string, transition: TransitionKind = 'wipe') {
  const i = TAB_IDS.indexOf(id)
  if (i < 0) return
  tabIndex.value = i
  activeTab.value = id
  focusZone.value = 'content'
  resetTo(id, transition)
}

/** 左右循环切标签（键盘 Q/E） */
export function cycleTab(dir: 1 | -1) {
  const n = TABS.length
  const i = (((tabIndex.value + dir) % n) + n) % n
  switchTab(TABS[i].id)
}

/** 把焦点交给标签栏 */
export function focusTabs(i?: number) {
  if (typeof i === 'number') tabIndex.value = i
  focusZone.value = 'tabs'
}

/** 焦点离开标签栏回到内容 */
export function blurTabs() {
  focusZone.value = 'content'
}

/** 场景变化时同步标签高亮（开机 / 直接跳转时用） */
export function syncTabWithScene(id: string) {
  const i = TAB_IDS.indexOf(id)
  if (i >= 0) {
    activeTab.value = id
    tabIndex.value = i
  }
}

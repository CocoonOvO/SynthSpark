/**
 * 场景栈（SceneStack）
 *
 * 一屏一个场景，场景之间是整屏像素转场。与上一版的区别：
 * 现在这是一个**真正的历史栈**（history + cursor），而不是只能前进后退的线性栈，
 * 因此「返回上一页 / 转到下一页」可以像浏览器一样来回走。
 *
 * - 标签页（主页 / 文章 / 关联 / 关于）是栈底（resetTo 清空历史）
 * - 文章详情是压在上面的临时页（pushScene）
 * - 前进分支在压入新场景时被截断（浏览器语义）
 *
 * 转场可被打断，且**不吞按键**：
 * - 遮罩出现到内容切换之间的这段时间（120ms）锁输入 —— 此刻屏幕上还是旧场景
 * - 内容一换完就立刻解锁 —— 用户看到新场景后马上就能操作，不必等淡出动画结束
 * - 同一个目标在转场中被重复触发只算一次（防连点），换一个目标则立刻结算上一次
 *   （「转场期间吞掉输入」是设计禁令，这里用去重 + 可打断替代排队）
 */
import { ref, computed } from 'vue'
import { inputLocked } from './pad'
import { playSfx } from './sfx'

export type TransitionKind = 'flash' | 'wipe' | 'shake' | 'none'

export interface SceneFrame {
  id: string
  /** 场景参数（如文章 id） */
  param?: string
  transition: TransitionKind
}

let uidSeq = 0

function mk(id: string, param?: string, transition: TransitionKind = 'none'): SceneFrame & { uid: number } {
  uidSeq += 1
  return { id, param, transition, uid: uidSeq }
}

/** 历史栈 + 游标 */
export const history = ref<Array<SceneFrame & { uid: number }>>([mk('boot')])
export const cursor = ref(0)

export const isTransitioning = ref(false)
export const transitionKind = ref<TransitionKind>('none')

export const currentScene = computed(() => history.value[cursor.value])
export const canGoBack = computed(() => cursor.value > 0)
export const canGoForward = computed(() => cursor.value < history.value.length - 1)

/**
 * 场景实例 key：只有「不同文章」才需要重建组件实例。
 * 不用 uid —— 否则从文章返回列表会重建列表，翻页进度就丢了（改由 postsView 记住）。
 */
export const sceneKey = computed(() => {
  const f = currentScene.value
  return `${f.id}:${f.param ?? ''}`
})

/** 进入新场景（会截断前进分支，浏览器语义） */
export function pushScene(id: string, param?: string, transition: TransitionKind = 'flash') {
  if (currentScene.value.id === id && currentScene.value.param === param) return
  runTransition(transition, `push:${id}:${param ?? ''}`, () => {
    history.value = [...history.value.slice(0, cursor.value + 1), mk(id, param, transition)]
    cursor.value = history.value.length - 1
  })
}

/** 返回上一页 */
export function popScene(transition: TransitionKind = 'wipe') {
  if (!canGoBack.value) return
  runTransition(transition, `back:${cursor.value}`, () => {
    cursor.value -= 1
  })
}

/** 转到下一页（历史里的前进分支） */
export function goForward(transition: TransitionKind = 'wipe') {
  if (!canGoForward.value) return
  runTransition(transition, `forward:${cursor.value}`, () => {
    cursor.value += 1
  })
}

/** 回到某个根场景（标签页切换）：清空历史 */
export function resetTo(id: string, transition: TransitionKind = 'wipe', param?: string) {
  if (currentScene.value.id === id && cursor.value === 0) return
  runTransition(transition, `reset:${id}`, () => {
    history.value = [mk(id, param)]
    cursor.value = 0
  })
}

/** 回到根场景（开机） */
export function resetScene(transition: TransitionKind = 'shake') {
  resetTo('boot', transition)
}

/** 直接替换当前场景（用于开机被跳过等场景），不产生历史 */
export function replaceScene(id: string, param?: string) {
  settleTransition(false)
  const next = history.value.slice(0, cursor.value)
  next.push(mk(id, param))
  history.value = next
  cursor.value = next.length - 1
}

/** 正在进行的转场：key 用于去重，apply 是内容切换，timers 用于打断时清理 */
interface RunningTransition {
  key: string
  apply: () => void
  timers: number[]
}

let running: RunningTransition | null = null

/** 结算当前转场：清掉挂起的定时器并放行输入 */
function settleTransition(runApply: boolean) {
  const t = running
  running = null
  if (t) {
    t.timers.forEach((id) => window.clearTimeout(id))
    if (runApply) t.apply()
  }
  isTransitioning.value = false
  inputLocked.value = false
  transitionKind.value = 'none'
}

/**
 * 转场时序：遮罩先出现（0 延迟反馈），内容在遮罩掩护下切换。
 * 内容一换完立即解锁输入，淡出只是装饰。
 */
function runTransition(kind: TransitionKind, key: string, apply: () => void) {
  if (kind === 'none') {
    settleTransition(false)
    apply()
    return
  }

  // 同一目标正在转场：忽略重复触发（防连点），不排队
  if (running?.key === key) return

  // 换了目标：立刻结算上一次（不执行它的 apply，用户已经改主意了）再开始新的
  if (running) settleTransition(false)

  const t: RunningTransition = { key, apply, timers: [] }
  running = t
  isTransitioning.value = true
  inputLocked.value = true
  transitionKind.value = kind
  playSfx('transition')

  t.timers.push(
    window.setTimeout(() => {
      apply()
      // 内容已经换好，输入立刻放行
      inputLocked.value = false
      t.timers.push(
        window.setTimeout(() => {
          if (running === t) settleTransition(false)
        }, 160)
      )
    }, 120)
  )
}

/**
 * 屏幕内层滚动容器（`.screen-inner`）。
 * 场景内部需要滚动正文时用它，而不是让方向键被全局吞掉。
 */
export const screenScroller = ref<HTMLElement | null>(null)

/** 按像素滚动屏幕内层，返回是否真的滚动了（到底了就返回 false，好把按键交还浏览器） */
export function scrollScreenBy(deltaY: number): boolean {
  const el = screenScroller.value
  if (!el) return false
  const before = el.scrollTop
  el.scrollBy({ top: deltaY, behavior: 'auto' })
  return el.scrollTop !== before
}

/** 滚回顶部（切场景时用） */
export function scrollScreenTop() {
  screenScroller.value?.scrollTo({ top: 0, behavior: 'auto' })
}

/** 状态栏时钟 */
export function useStatusBar() {
  const clock = ref(formatClock())
  const timer = window.setInterval(() => {
    clock.value = formatClock()
  }, 1000)
  return { clock, stop: () => window.clearInterval(timer) }
}

function formatClock(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

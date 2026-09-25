/**
 * 场景切换器（SceneStack）
 *
 * 反传统核心：取代「页面路由 + 浏览器历史 + 无限纵向滚动」。
 * - 一个场景占据整屏，场景之间是整屏像素转场（闪白 / 竖条擦除 / 抖屏）
 * - 内容超出时不拉长整页，而是屏内滚动或分页
 * - B 键返回上一场景，语义上等同老游戏的「退回」
 *
 * 转场可被打断，且**不吞按键**：
 * - 遮罩出现到内容切换之间的这段时间（120ms）锁输入 —— 此刻屏幕上还是旧场景，
 *   对旧场景的操作没有意义
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

export const sceneStack = ref<SceneFrame[]>([{ id: 'boot', transition: 'none' }])
export const isTransitioning = ref(false)
export const transitionKind = ref<TransitionKind>('none')

export const currentScene = computed(() => sceneStack.value[sceneStack.value.length - 1])
export const canGoBack = computed(() => sceneStack.value.length > 1)

/** 进入新场景。key 用目标本身，同一目标连点只执行一次 */
export function pushScene(id: string, param?: string, transition: TransitionKind = 'flash') {
  if (currentScene.value.id === id && currentScene.value.param === param) return
  runTransition(transition, `push:${id}:${param ?? ''}`, () => {
    sceneStack.value = [...sceneStack.value, { id, param, transition }]
  })
}

/** 返回上一场景 */
export function popScene(transition: TransitionKind = 'wipe') {
  if (!canGoBack.value) return
  runTransition(transition, `pop:${sceneStack.value.length}`, () => {
    sceneStack.value = sceneStack.value.slice(0, -1)
  })
}

/** 回到根场景（开机） */
export function resetScene(transition: TransitionKind = 'shake') {
  runTransition(transition, 'reset', () => {
    sceneStack.value = [{ id: 'boot', transition: 'none' }]
  })
}

/** 直接替换当前场景（用于开机被跳过等场景） */
export function replaceScene(id: string, param?: string) {
  settleTransition(false)
  sceneStack.value = [...sceneStack.value.slice(0, -1), { id, param, transition: 'none' }]
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

/**
 * 场景表现层（presenter）
 *
 * 路由已经接管了 URL 与历史（见 src/router/index.ts），这里只剩两件事：
 * 1. **把当前路由翻译成一个待渲染的 SceneFrame**（id + param）
 * 2. **整屏像素转场**：遮罩先出现（0 延迟反馈），内容在遮罩掩护下切换
 *
 * 转场可被打断，且**不吞按键**：
 * - 遮罩出现到内容切换之间的这段时间（120ms）锁输入 —— 此刻屏幕上还是旧场景
 * - 内容一换完就立刻解锁 —— 看到新画面就能马上操作，不必等淡出动画结束
 * - 同一目标重复触发只算一次（防连点），换目标则立刻结算上一次（不做输入排队）
 */
import { ref, computed } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { inputLocked } from './pad'
import { playSfx } from './sfx'

export type TransitionKind = 'flash' | 'wipe' | 'shake' | 'none'

export interface SceneFrame {
  id: string
  /** 场景参数（如文章 id / slug） */
  param?: string
}

/** 当前正在显示的场景帧。开机帧是初始值，等 BootScene 播完再切到真实路由 */
export const frame = ref<SceneFrame>({ id: 'boot' })

/** 开机动画是否还没播完（未播完时路由变化只改 URL，不动画面） */
export const booting = ref(true)

export const isTransitioning = ref(false)
export const transitionKind = ref<TransitionKind>('none')

/** 组件实例 key：只有「不同文章」才需要重建，列表换页/换筛选不重建（保住焦点与动画） */
export const sceneKey = computed(() => `${frame.value.id}:${frame.value.param ?? ''}`)

/** 由 router 注册：把一条路由解析成场景帧 */
let routeResolver: ((r: RouteLocationNormalizedLoaded) => SceneFrame) | null = null

export function setRouteResolver(fn: (r: RouteLocationNormalizedLoaded) => SceneFrame) {
  routeResolver = fn
}

/**
 * 路由 → 场景帧。放在 scene.ts 里是为了让 BootScene / router 都能调用，
 * 而 scene.ts 自己不 import router（避免循环依赖）。
 */
let currentRouteGetter: (() => RouteLocationNormalizedLoaded) | null = null

export function setRouteGetter(fn: () => RouteLocationNormalizedLoaded) {
  currentRouteGetter = fn
}

export function resolveRouteFrame(r?: RouteLocationNormalizedLoaded): SceneFrame | null {
  const route = r ?? currentRouteGetter?.()
  if (!route || !routeResolver) return null
  return routeResolver(route)
}

/** 切换到场景（同 id 同参数则忽略，防连点） */
export function present(id: string, param?: string, transition: TransitionKind = 'flash') {
  if (frame.value.id === id && frame.value.param === param) return
  runTransition(transition, `present:${id}:${param ?? ''}`, () => {
    frame.value = { id, param }
  })
}

/** 按当前路由展示画面（开机播完、或需要强制对齐时调用） */
export function presentRoute(transition: TransitionKind = 'none') {
  const f = resolveRouteFrame()
  if (f) present(f.id, f.param, transition)
}

/** 开机动画播完：切到真实路由对应的画面 */
export function finishBoot(skip = false) {
  if (!booting.value) return
  booting.value = false
  presentRoute(skip ? 'flash' : 'none')
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

/** 滚到指定位置（文章页的「回到顶部」用） */
export function scrollScreenTo(top: number): boolean {
  const el = screenScroller.value
  if (!el) return false
  if (el.scrollTop === top) return false
  el.scrollTo({ top, behavior: 'auto' })
  return true
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

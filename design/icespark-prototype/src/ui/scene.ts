/**
 * 场景切换器（SceneStack）
 *
 * 反传统核心：取代「页面路由 + 浏览器历史 + 无限纵向滚动」。
 * - 一个场景占据整屏，场景之间是整屏像素转场（闪白 / 竖条擦除 / 抖屏）
 * - 不产生滚动条；内容超出时走分页，而不是拉长
 * - B 键返回上一场景，语义上等同老游戏的「退回」
 */
import { ref, computed, type Ref } from 'vue'

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

/** 场景配乐/音效位的开关（默认静音） */
export const soundEnabled = ref(false)

/** 进入新场景 */
export function pushScene(id: string, param?: string, transition: TransitionKind = 'flash') {
  if (isTransitioning.value) return
  runTransition(transition, () => {
    sceneStack.value = [...sceneStack.value, { id, param, transition }]
  })
}

/** 返回上一场景 */
export function popScene(transition: TransitionKind = 'wipe') {
  if (isTransitioning.value || !canGoBack.value) return
  runTransition(transition, () => {
    sceneStack.value = sceneStack.value.slice(0, -1)
  })
}

/** 回到根场景（开机） */
export function resetScene(transition: TransitionKind = 'shake') {
  if (isTransitioning.value) return
  runTransition(transition, () => {
    sceneStack.value = [{ id: 'boot', transition: 'none' }]
  })
}

/** 直接替换当前场景 */
export function replaceScene(id: string, param?: string) {
  sceneStack.value = [...sceneStack.value.slice(0, -1), { id, param, transition: 'none' }]
}

function runTransition(kind: TransitionKind, apply: () => void) {
  if (kind === 'none') {
    apply()
    return
  }
  isTransitioning.value = true
  transitionKind.value = kind
  // 转场只走离散两帧：先遮屏，再换场景，再揭屏
  window.setTimeout(() => {
    apply()
    window.setTimeout(() => {
      isTransitioning.value = false
      transitionKind.value = 'none'
    }, 160)
  }, 160)
}

/** 状态栏信息：模拟掌机 LCD 屏上沿 */
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

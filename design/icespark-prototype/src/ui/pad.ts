/**
 * 手柄输入层
 *
 * 反传统要点：
 * - 方向键移动焦点，A 确认，B 返回
 * - 鼠标 hover 不产生任何视觉变化（调用方禁止给 hover 加样式）
 * - 触摸设备降级：点击等同 A 键，长按等同 B 键
 */
import { ref, onMounted, onUnmounted } from 'vue'

export type PadAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel'

export interface FocusItem {
  id: string
  el: HTMLElement
}

/** 全局焦点索引（场景内单选列表用） */
export const focusIndex = ref(0)
export const focusCount = ref(0)

/** 输入事件订阅表 */
const listeners = new Set<(a: PadAction) => void>()

export function onPad(handler: (a: PadAction) => void): () => void {
  listeners.add(handler)
  return () => listeners.delete(handler)
}

function emit(a: PadAction) {
  listeners.forEach((fn) => fn(a))
}

/** 按键映射：方向键 / WASD / Enter-Z 确认 / Esc-X 返回 */
const KEYMAP: Record<string, PadAction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  Enter: 'confirm',
  ' ': 'confirm',
  z: 'confirm',
  Escape: 'cancel',
  Backspace: 'cancel',
  x: 'cancel',
}

/** 在组件中使用：自动挂载/卸载键盘监听 */
export function usePad() {
  function handler(e: KeyboardEvent) {
    // 输入框内不劫持按键
    const t = e.target as HTMLElement
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      if (e.key === 'Escape') emit('cancel')
      return
    }
    const action = KEYMAP[e.key]
    if (!action) return
    e.preventDefault()
    emit(action)
  }

  onMounted(() => window.addEventListener('keydown', handler))
  onUnmounted(() => window.removeEventListener('keydown', handler))
}

/** 焦点列表管理：向上/下移动，越界时抖动提示（8bit 音效位） */
export function useFocusList(count: () => number) {
  function move(dir: 1 | -1) {
    const n = count()
    if (n === 0) return false
    const next = focusIndex.value + dir
    if (next < 0 || next >= n) {
      // 越界：抖动而不是循环滚动，保留老游戏的「撞墙」手感
      return false
    }
    focusIndex.value = next
    return true
  }
  return { move }
}

/** 逐字打字机：离散出字，不是平滑淡入 */
export function useTypewriter() {
  const text = ref('')
  const done = ref(false)
  let timer: number | null = null

  function type(full: string, speed = 28, onDone?: () => void) {
    if (timer) window.clearInterval(timer)
    text.value = ''
    done.value = false
    let i = 0
    timer = window.setInterval(() => {
      i += 1
      text.value = full.slice(0, i)
      if (i >= full.length) {
        if (timer) window.clearInterval(timer)
        timer = null
        done.value = true
        onDone?.()
      }
    }, speed)
  }

  function finish(full: string) {
    if (timer) window.clearInterval(timer)
    timer = null
    text.value = full
    done.value = true
  }

  return { text, done, type, finish }
}

/** 计数滚动：SCORE 累加用，离散跳数 */
export function useCountUp() {
  const value = ref(0)
  let timer: number | null = null

  function run(target: number, duration = 640) {
    if (timer) window.clearInterval(timer)
    const steps = Math.max(1, Math.floor(duration / 40))
    let i = 0
    value.value = 0
    timer = window.setInterval(() => {
      i += 1
      value.value = Math.round((target * i) / steps)
      if (i >= steps) {
        if (timer) window.clearInterval(timer)
        timer = null
        value.value = target
      }
    }, 40)
  }

  return { value, run }
}

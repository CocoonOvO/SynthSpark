/**
 * 手柄输入层
 *
 * 反传统要点：
 * - 方向键移动焦点，A 确认，B 返回，START 呼出暂停菜单
 * - 鼠标 hover 不产生视觉变化之外的效果（焦点由共享焦点模型统一管理）
 * - 触摸降级：点击等同 A 键
 *
 * 关键机制「消费语义」：
 * emit 返回本次事件是否被消费，只有被消费才 preventDefault。
 * 这样正文页不接管 ↑↓ 时，浏览器原生滚动依然可用 —— 修复了
 * 「方向键被全局吞掉导致键盘用户无法滚动长文」的缺陷。
 *
 * 作用域（scope）：暂停菜单打开时屏蔽场景层监听，避免按键穿透。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { playSfx } from './sfx'

export type PadAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'start'

/** 输入作用域：any 永远接收（用于 START 这类全局键） */
export type PadScope = 'scene' | 'pause' | 'any'

/** 全局焦点索引（场景内单选列表用） */
export const focusIndex = ref(0)
export const focusCount = ref(0)

/** 当前生效的作用域 */
export const activeScope = ref<Exclude<PadScope, 'any'>>('scene')

/** 输入是否被锁定（转场中） */
export const inputLocked = ref(false)

type Handler = (a: PadAction) => boolean | void

const listeners = new Map<Handler, PadScope>()

export function onPad(handler: Handler, scope: PadScope = 'scene'): () => void {
  listeners.set(handler, scope)
  return () => listeners.delete(handler)
}

/** 派发事件，返回是否被消费 */
function emit(a: PadAction): boolean {
  if (inputLocked.value && a !== 'start') return false
  let consumed = false
  listeners.forEach((scope, fn) => {
    if (scope !== 'any' && scope !== activeScope.value) return
    const r = fn(a)
    if (r === true) consumed = true
  })
  return consumed
}

/** 按键映射 */
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
  p: 'start',
  P: 'start',
}

/** 在组件中使用：自动挂载/卸载键盘监听 */
export function usePad() {
  function handler(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null
    const inField = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

    // 输入框内不劫持按键：只保留 Esc 交给上层处理
    if (inField) {
      if (e.key === 'Escape') {
        e.preventDefault()
        emit('cancel')
      }
      return
    }

    const action = KEYMAP[e.key]
    if (!action) return

    // 只有被消费才阻止默认行为，否则把按键还给浏览器（原生滚动等）
    if (emit(action)) e.preventDefault()
  }

  onMounted(() => window.addEventListener('keydown', handler))
  onUnmounted(() => window.removeEventListener('keydown', handler))
}

/** 焦点列表管理：越界时返回 false（由调用方决定是否抖动提示） */
export function useFocusList(count: () => number) {
  function move(dir: 1 | -1) {
    const n = count()
    if (n === 0) return false
    const next = focusIndex.value + dir
    if (next < 0 || next >= n) return false
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

/** 键盘移动焦点时的音效（鼠标移动焦点必须静音，见 sfx.ts） */
export function playFocusMove() {
  playSfx('move')
}

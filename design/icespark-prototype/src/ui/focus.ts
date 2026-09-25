/**
 * 共享焦点模型
 *
 * 用户要求：单独用鼠标、或单独用键盘，都能完成全部操作。
 * 因此不做「键盘焦点」与「鼠标 hover」两套状态，而是**共享同一个焦点**：
 *
 * - 键盘 ↑↓ 移动焦点 → 出声（离散事件，一格一声）
 * - 鼠标划过可交互项 → 也移动同一个焦点，但**静音**
 *   （鼠标划过不是离散事件，若出声会在快速滑动时变成噪音轰炸）
 *
 * 视觉呈现永远是 8bit 闪烁方块，而不是现代 web 的柔和 hover 发光。
 */
import { ref } from 'vue'
import { playSfx } from './sfx'

export interface FocusGroupOptions {
  /** 焦点变化回调（可用于抖动之外的联动） */
  onChange?: (index: number) => void
  /** 是否在键盘移动时播放音效，默认 true */
  sound?: boolean
  /**
   * 初始焦点，默认 0。
   * 传 -1 表示「暂未接管焦点」—— 正文页用这个值把方向键让给浏览器滚动，
   * 也避免 A 键一进场就误触第一个动作。
   */
  initial?: number
}

export function useFocusGroup(opts: FocusGroupOptions = {}) {
  const index = ref(opts.initial ?? 0)

  /** 设定焦点。silent = true 时静音（鼠标路径） */
  function set(i: number, silent = false) {
    if (i === index.value) return
    index.value = i
    if (!silent && opts.sound !== false) playSfx('move')
    opts.onChange?.(i)
  }

  /** 键盘移动焦点：越界返回 false，由调用方决定是否抖动提示 */
  function moveBy(dir: 1 | -1, count: number): boolean {
    const next = index.value + dir
    if (next < 0 || next >= count) return false
    set(next)
    return true
  }

  /** 鼠标划过：共享同一个焦点，但静音 */
  function hover(i: number) {
    set(i, true)
  }

  /** 点击：先把焦点挪过来（若尚未在此），再返回是否命中 */
  function click(i: number): boolean {
    const changed = i !== index.value
    set(i, true)
    return changed || true
  }

  return { index, set, moveBy, hover, click }
}

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

/**
 * 栅格里的「视觉相邻」移动（用户反馈第 7 条：方向键必须按视觉相邻走，不能依次切换）
 *
 * 两列栅格（cols=2）下的语义：
 *   ← 左边那张（同行的前一列） · → 右边那张（同行的后一列）
 *   ↑ 上一行同一列 · ↓ 下一行同一列
 * 返回 null 表示该方向没有相邻项，由调用方决定怎么处理
 * （列表页的「首行再往上」= 焦点交给标签栏；末行再往下 = 把按键交还浏览器）。
 */
export function spatialIndex(
  i: number,
  dir: 'up' | 'down' | 'left' | 'right',
  cols: number,
  count: number
): number | null {
  if (count <= 0 || i < 0 || i >= count) return null
  const col = i % cols
  if (dir === 'left') return col > 0 ? i - 1 : null
  if (dir === 'right') return col < cols - 1 && i + 1 < count ? i + 1 : null
  if (dir === 'up') return i - cols >= 0 ? i - cols : null
  return i + cols < count ? i + cols : null
}

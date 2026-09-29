import { ref } from 'vue'

import { playSfx } from './sfx'

/**
 * 共享焦点模型 —— 输入等价性的地基。
 *
 * 用户要求：单独用鼠标、或单独用键盘，都能完成全部操作。
 * 所以**不做两套状态**（键盘焦点 + 鼠标 hover），而是共享同一个焦点：
 *
 * - 键盘移动焦点 → 出声（一格一声，离散事件）
 * - 鼠标划过可交互项 → 也移动同一个焦点，但**静音**
 *   （划过不是离散事件，出声会变成噪音轰炸）
 *
 * 视觉永远是 8bit 闪烁方块，不是现代 web 的柔和 hover 发光（无 hover 铁律）。
 */

export interface FocusGroupOptions {
  /** 焦点变化回调（联动用，例如配套的详情面板） */
  onChange?: (index: number) => void
  /** 键盘移动时是否出声，默认 true */
  sound?: boolean
  /**
   * 初始焦点，默认 0。传 -1 表示「暂未接管焦点」——
   * 正文页用它把方向键让给浏览器滚动，也避免 A 键一进场就误触第一个动作。
   */
  initial?: number
}

export function useFocusGroup(options: FocusGroupOptions = {}) {
  const index = ref(options.initial ?? 0)

  /** 设定焦点；silent = true 时静音（鼠标路径） */
  function set(next: number, silent = false): void {
    if (next === index.value) return
    index.value = next
    if (!silent && options.sound !== false) playSfx('move')
    options.onChange?.(next)
  }

  /** 键盘移动：越界返回 false，由调用方决定是否抖动提示 */
  function moveBy(dir: 1 | -1, count: number): boolean {
    const next = index.value + dir
    if (next < 0 || next >= count) return false
    set(next)
    return true
  }

  /** 鼠标划过：共享同一个焦点，但静音 */
  function hover(next: number): void {
    set(next, true)
  }

  /** 点击：先把焦点挪过来（若尚未在此），静音 */
  function click(next: number): void {
    set(next, true)
  }

  return { index, set, moveBy, hover, click }
}

/**
 * 栅格里的「视觉相邻」移动（用户反馈第 7 条：方向键必须按视觉相邻走，不能依次切换）。
 *
 * 两列栅格（cols = 2）下的语义：
 *   ← 同行前一列 · → 同行后一列 · ↑ 上一行同一列 · ↓ 下一行同一列
 *
 * 返回 null 表示该方向没有相邻项，由调用方决定怎么处理：
 * 列表页「首行再往上」= 焦点交给标签栏；「末行再往下」= 把按键交还浏览器。
 */
export function spatialIndex(
  index: number,
  direction: 'up' | 'down' | 'left' | 'right',
  columns: number,
  count: number,
): number | null {
  if (count <= 0 || index < 0 || index >= count || columns <= 0) return null

  const column = index % columns

  if (direction === 'left') return column > 0 ? index - 1 : null
  if (direction === 'right') return column < columns - 1 && index + 1 < count ? index + 1 : null
  if (direction === 'up') return index - columns >= 0 ? index - columns : null
  return index + columns < count ? index + columns : null
}

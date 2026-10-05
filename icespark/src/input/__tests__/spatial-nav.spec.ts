import { describe, expect, it } from 'vitest'

import { nearestBox, pickByGeometry, type NavBox } from '../spatial-nav'

/**
 * 视觉导航的语义门（纯函数，假坐标）。
 *
 * 布局算不出来（vitest 跑在 node 里、没有布局引擎），所以坐标是手写的 —— 但断言的正是
 * 「方向键按视觉关系走」这件事：同排优先、换行后按最近的、那一侧没有就返回 null（不消费按键）。
 */

/** 一行四枚芯片，每枚 60×30、间隔 10，从 (0,0) 起排 */
function row(count: number, y = 0, w = 60, h = 30, gap = 10): NavBox[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `r${i}`,
    left: i * (w + gap),
    top: y,
    right: i * (w + gap) + w,
    bottom: y + h,
  }))
}

const box = (key: string, left: number, top: number, w: number, h: number): NavBox => ({
  key,
  left,
  top,
  right: left + w,
  bottom: top + h,
})

describe('pickByGeometry：按视觉关系走', () => {
  it('同一排里左右是相邻的那一枚', () => {
    const boxes = row(4)
    expect(pickByGeometry(boxes[0]!, boxes, 'right')).toBe('r1')
    expect(pickByGeometry(boxes[2]!, boxes, 'right')).toBe('r3')
    expect(pickByGeometry(boxes[3]!, boxes, 'left')).toBe('r2')
  })

  it('到头了返回 null —— 调用方据此把按键还给浏览器（不制造死键也不吞键）', () => {
    const boxes = row(4)
    expect(pickByGeometry(boxes[0]!, boxes, 'left')).toBeNull()
    expect(pickByGeometry(boxes[3]!, boxes, 'right')).toBeNull()
    expect(pickByGeometry(boxes[0]!, boxes, 'up')).toBeNull()
  })

  it('换行的芯片排：往下走落在**同一列**那一枚，而不是左边那枚', () => {
    // 第二排只有两枚，位置错开（模拟 auto-fit / 换行 + 不同宽度的芯片）
    const boxes = [...row(4), box('s0', 0, 60, 40, 30), box('s1', 50, 60, 200, 30)]
    expect(pickByGeometry(boxes[1]!, boxes, 'down')).toBe('s1')
    expect(pickByGeometry(boxes[0]!, boxes, 'down')).toBe('s0')
    expect(pickByGeometry(boxes[3]!, boxes, 'down')).toBe('s1')
  })

  it('栅格：↑↓ 走同一列，←→ 走同一行', () => {
    const boxes = [
      box('a', 0, 0, 100, 40),
      box('b', 110, 0, 100, 40),
      box('c', 0, 50, 100, 40),
      box('d', 110, 50, 100, 40),
    ]
    expect(pickByGeometry(boxes[0]!, boxes, 'right')).toBe('b')
    expect(pickByGeometry(boxes[0]!, boxes, 'down')).toBe('c')
    expect(pickByGeometry(boxes[3]!, boxes, 'up')).toBe('b')
    expect(pickByGeometry(boxes[0]!, boxes, 'right')).toBe('b')
  })

  it('斜下方也能到，但同排的邻居优先（③ 里那句"斜对角更贵"）', () => {
    const boxes = [
      box('me', 0, 0, 100, 40),
      box('same', 110, 0, 100, 40),
      box('diag', 105, 50, 300, 40),
    ]
    expect(pickByGeometry(boxes[0]!, boxes, 'right')).toBe('same')
    expect(pickByGeometry(boxes[0]!, boxes, 'down')).toBe('diag')
  })

  it('边框重叠一两个像素不算"不在那一侧"（芯片之间常有负外边距）', () => {
    const boxes = [box('me', 0, 0, 60, 30), box('next', 59, 0, 60, 30)]
    expect(pickByGeometry(boxes[0]!, boxes, 'right')).toBe('next')
  })

  it('当前格不在候选里（列表被过滤掉了）：从第一格重新起算', () => {
    const boxes = row(2)
    expect(pickByGeometry(null, boxes, 'down')).toBe('r0')
    expect(pickByGeometry(null, [], 'down')).toBeNull()
  })

  it('只考虑可见的：调用方量完盒子再喂进来（零面积的格子不该抢焦点）', () => {
    const boxes = row(3)
    expect(pickByGeometry(boxes[0]!, [boxes[0]!, boxes[2]!], 'right')).toBe('r2')
  })
})

describe('nearestBox：点完就没了的那一格，光标留在原地附近', () => {
  it('取中心点最近的那一格（不是 DOM 顺序里的下一格）', () => {
    const boxes = [box('top', 0, -200, 100, 30), box('near', 0, 5, 100, 30), box('far', 400, 5, 100, 30)]
    expect(nearestBox(boxes, box('gone', 0, 0, 100, 30))).toBe('near')
  })

  it('只剩一格时返回它（总比掉回面板第一格强）', () => {
    expect(nearestBox([box('only', 500, 500, 10, 10)], box('gone', 0, 0, 10, 10))).toBe('only')
  })
})

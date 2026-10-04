import { describe, expect, it } from 'vitest'

import { nextFocusIndex } from '../focusTrap'

/**
 * 只测纯逻辑那半（下标回绕）。DOM 那半（真的挪焦点）由 e2e 的
 * `modal-focus.spec.ts` 在真浏览器里守 —— 本仓库 vitest 环境是 `node`，没有 DOM。
 */
describe('模态焦点圈闭：下一个下标', () => {
  it('往后走是 +1，到最后一项回绕到第一项', () => {
    expect(nextFocusIndex(0, 3, 1)).toBe(1)
    expect(nextFocusIndex(1, 3, 1)).toBe(2)
    expect(nextFocusIndex(2, 3, 1)).toBe(0)
  })

  it('往前走是 -1，到第一项回绕到最后一项', () => {
    expect(nextFocusIndex(2, 3, -1)).toBe(1)
    expect(nextFocusIndex(0, 3, -1)).toBe(2)
  })

  it('焦点不在容器里（-1）：往后从第一项开始，往前从最后一项开始', () => {
    expect(nextFocusIndex(-1, 3, 1)).toBe(0)
    expect(nextFocusIndex(-1, 3, -1)).toBe(2)
  })

  it('空容器给 -1（调用方据此放行，不改行为）', () => {
    expect(nextFocusIndex(0, 0, 1)).toBe(-1)
  })

  it('只有一项时原地打转（实际由调用方的「不足两个不管」兜住）', () => {
    expect(nextFocusIndex(0, 1, 1)).toBe(0)
  })
})

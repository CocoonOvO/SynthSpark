import { beforeEach, describe, expect, it, vi } from 'vitest'

import { playSfx } from '@/input/sfx'
import { spatialIndex, useFocusGroup } from '@/input/focus'

// 音效层整体替换为监听桩：这里要验的是「什么时候该出声」，不是声音本身
vi.mock('@/input/sfx', () => ({ playSfx: vi.fn(), previewSfx: vi.fn() }))

/**
 * 共享焦点模型 —— 输入等价性的地基。
 *
 * 两条铁律在这里钉死：
 * 1. 键盘移动出声、鼠标划过静音（划过不是离散事件）；
 * 2. 鼠标与键盘操作**同一个**焦点下标，不做两套状态，
 *    否则「鼠标划过 A 再按方向键」会跳到一个没人预料的位置。
 */

beforeEach(() => {
  vi.mocked(playSfx).mockClear()
})

describe('useFocusGroup：键盘与鼠标共享同一个焦点', () => {
  it('键盘移动出声', () => {
    const group = useFocusGroup({ sound: true })
    group.moveBy(1, 3)
    expect(group.index.value).toBe(1)
    expect(playSfx).toHaveBeenCalledWith('move')
  })

  it('鼠标划过挪同一个焦点，但静音', () => {
    const group = useFocusGroup({ sound: true })

    group.moveBy(1, 3)
    expect(playSfx).toHaveBeenCalledTimes(1)

    group.hover(2)
    expect(group.index.value).toBe(2)
    // 划过不新增一声
    expect(playSfx).toHaveBeenCalledTimes(1)
  })

  it('鼠标点击也静音（点下去的那一下由调用方决定出什么声）', () => {
    const group = useFocusGroup({ sound: true })
    group.click(1)
    expect(group.index.value).toBe(1)
    expect(playSfx).not.toHaveBeenCalled()
  })

  it('关掉声音的组完全静音', () => {
    const group = useFocusGroup({ sound: false })
    group.moveBy(1, 3)
    expect(group.index.value).toBe(1)
    expect(playSfx).not.toHaveBeenCalled()
  })

  it('移到同一个下标时不回调也不出声（避免重复渲染与噪音）', () => {
    const onChange = vi.fn()
    const group = useFocusGroup({ onChange })
    group.set(0)
    expect(onChange).not.toHaveBeenCalled()

    group.set(1)
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('越界移动返回 false 且下标不动（调用方据此抖动提示或交还按键）', () => {
    const group = useFocusGroup({ initial: 2 })
    expect(group.moveBy(1, 3)).toBe(false)
    expect(group.index.value).toBe(2)
    expect(group.moveBy(-1, 3)).toBe(true)
    expect(group.index.value).toBe(1)
  })

  it('initial: -1 表示暂不接管（长文页把方向键让给浏览器滚动）', () => {
    const group = useFocusGroup({ initial: -1 })
    expect(group.index.value).toBe(-1)

    // 一按方向键即落到第一项，而不是先「激活」一次
    expect(group.moveBy(1, 3)).toBe(true)
    expect(group.index.value).toBe(0)

    expect(group.moveBy(-1, 3)).toBe(false)
    expect(group.index.value).toBe(0)
  })
})

describe('spatialIndex：两列栅格里按视觉相邻移动', () => {
  // 5 项、2 列，视觉布局：
  //   0 1
  //   2 3
  //   4
  const COUNT = 5
  const COLS = 2

  it('左右只在本行内走，到行边界返回 null', () => {
    expect(spatialIndex(0, 'left', COLS, COUNT)).toBeNull()
    expect(spatialIndex(0, 'right', COLS, COUNT)).toBe(1)
    expect(spatialIndex(1, 'right', COLS, COUNT)).toBeNull()
    expect(spatialIndex(1, 'left', COLS, COUNT)).toBe(0)
  })

  it('行的右边界不能绕到下一行（1 → 不能到 2，3 → 不能到 4）', () => {
    expect(spatialIndex(1, 'right', COLS, COUNT)).toBeNull()
    expect(spatialIndex(3, 'right', COLS, COUNT)).toBeNull()
    expect(spatialIndex(2, 'right', COLS, COUNT)).toBe(3)
    // 末行只有一项，右边仍是空的
    expect(spatialIndex(4, 'right', COLS, COUNT)).toBeNull()
  })

  it('上下按同一列走', () => {
    expect(spatialIndex(0, 'up', COLS, COUNT)).toBeNull()
    expect(spatialIndex(0, 'down', COLS, COUNT)).toBe(2)
    expect(spatialIndex(3, 'down', COLS, COUNT)).toBeNull()
    expect(spatialIndex(4, 'up', COLS, COUNT)).toBe(2)
  })

  it('越界下标与非法列数返回 null（不抛异常）', () => {
    expect(spatialIndex(-1, 'down', COLS, COUNT)).toBeNull()
    expect(spatialIndex(COUNT, 'down', COLS, COUNT)).toBeNull()
    expect(spatialIndex(0, 'down', COLS, 0)).toBeNull()
    expect(spatialIndex(0, 'down', 0, COUNT)).toBeNull()
  })

  it('单列时左右无相邻项，上下就是顺序移动', () => {
    expect(spatialIndex(1, 'left', 1, 3)).toBeNull()
    expect(spatialIndex(1, 'right', 1, 3)).toBeNull()
    expect(spatialIndex(1, 'up', 1, 3)).toBe(0)
    expect(spatialIndex(1, 'down', 1, 3)).toBe(2)
  })

  it('最后一行只有半格时，左右按自己所在的列判定', () => {
    // 3 列、5 项的布局：0 1 2 / 3 4
    expect(spatialIndex(4, 'down', 3, 5)).toBeNull()
    expect(spatialIndex(4, 'left', 3, 5)).toBe(3)
    expect(spatialIndex(3, 'left', 3, 5)).toBeNull()
    expect(spatialIndex(3, 'up', 3, 5)).toBe(0)
    expect(spatialIndex(4, 'up', 3, 5)).toBe(1)
  })
})

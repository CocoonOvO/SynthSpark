import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPadListeners,
  dispatchPadAction,
  focusActionForArrow,
  isEditableTarget,
  onPad,
  resolveComboAction,
  resolvePadAction,
} from '@/input/pad'
import type { PadAction } from '@/input/pad'
import { activeScope, focusZone, inputLocked, resetInputState } from '@/input/scopes'

/**
 * 手柄派发层的单测。
 *
 * 这一层错了会以「很难复现的怪现象」出现（一次按键动两处、Esc 关掉菜单又立刻打开、
 * 长文页方向键滚不动），所以语义要在这里钉死，而不是等 e2e 里偶发。
 */

/** 简易键盘事件替身：只提供 resolvePadAction 真正读的两个字段 */
function key(k: string, shiftKey = false): Pick<KeyboardEvent, 'key' | 'shiftKey'> {
  return { key: k, shiftKey }
}

beforeEach(() => {
  clearPadListeners()
  resetInputState()
})

afterEach(() => {
  clearPadListeners()
  resetInputState()
})

describe('resolvePadAction：按键 → 动作', () => {
  it('方向键与 WASD 等价', () => {
    expect(resolvePadAction(key('ArrowUp'))).toBe('up')
    expect(resolvePadAction(key('ArrowDown'))).toBe('down')
    expect(resolvePadAction(key('ArrowLeft'))).toBe('left')
    expect(resolvePadAction(key('ArrowRight'))).toBe('right')
    expect(resolvePadAction(key('w'))).toBe('up')
    expect(resolvePadAction(key('s'))).toBe('down')
    expect(resolvePadAction(key('a'))).toBe('left')
    expect(resolvePadAction(key('d'))).toBe('right')
  })

  it('单字符键做小写归一化（大写锁定 / 按住 Shift 也要能用）', () => {
    expect(resolvePadAction(key('W'))).toBe('up')
    expect(resolvePadAction(key('P', true))).toBe('start')
    expect(resolvePadAction(key('Q', true))).toBe('back')
  })

  it('A 键家族（Enter / Space / Z）都是确认，B 键（Esc）是取消', () => {
    expect(resolvePadAction(key('Enter'))).toBe('confirm')
    expect(resolvePadAction(key(' '))).toBe('confirm')
    expect(resolvePadAction(key('z'))).toBe('confirm')
    expect(resolvePadAction(key('Escape'))).toBe('cancel')
  })

  it('START 是 P，与历史后退（Backspace / X / Q）分开', () => {
    expect(resolvePadAction(key('p'))).toBe('start')
    expect(resolvePadAction(key('Backspace'))).toBe('back')
    expect(resolvePadAction(key('x'))).toBe('back')
    expect(resolvePadAction(key('q'))).toBe('back')
    expect(resolvePadAction(key('e'))).toBe('forward')
  })

  it('Tab 区分 Shift，用来反向切标签', () => {
    expect(resolvePadAction(key('Tab'))).toBe('tabNext')
    expect(resolvePadAction(key('Tab', true))).toBe('tabPrev')
  })

  it('场景快捷键与翻页键', () => {
    expect(resolvePadAction(key('PageUp'))).toBe('pagePrev')
    expect(resolvePadAction(key('PageDown'))).toBe('pageNext')
    expect(resolvePadAction(key('j'))).toBe('jump')
    expect(resolvePadAction(key('g'))).toBe('focusGroup')
    expect(resolvePadAction(key('t'))).toBe('focusTag')
    expect(resolvePadAction(key('l'))).toBe('focusLike')
    expect(resolvePadAction(key('f'))).toBe('focusFact')
    expect(resolvePadAction(key('u'))).toBe('toTop')
  })

  it('没登记的键返回 null —— 不接管，交还给浏览器', () => {
    expect(resolvePadAction(key('F5'))).toBeNull()
    expect(resolvePadAction(key('k'))).toBeNull()
    expect(resolvePadAction(key('/'))).toBeNull()
  })
})

describe('resolveComboAction：编辑框里的 Shift + 字母', () => {
  it('三个面板键放行（大写照样认，event.key 在按住 Shift 时是大写）', () => {
    expect(resolveComboAction(key('N', true))).toBe('panelDocs')
    expect(resolveComboAction(key('M', true))).toBe('panelMeta')
    expect(resolveComboAction(key('V', true))).toBe('panelPreview')
  })

  it('没按 Shift 一律不放行 —— 那是正常输入，一个字都不能抢', () => {
    expect(resolveComboAction(key('n'))).toBeNull()
    expect(resolveComboAction(key('m'))).toBeNull()
    expect(resolveComboAction(key('v'))).toBeNull()
  })

  it('带 Ctrl / Alt / Meta 不放行：Ctrl+S、Ctrl+A、⌘+P 是浏览器与系统的键', () => {
    for (const mod of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      expect(resolveComboAction({ key: 'N', shiftKey: true, [mod]: true })).toBeNull()
    }
    // 定向不炸：真事件对象上这三项永远有值，只是都为 false
    expect(resolveComboAction({ key: 'N', shiftKey: true, ctrlKey: false, altKey: false })).toBe(
      'panelDocs',
    )
  })

  it('输入法组字期间不放行（Shift 在中文输入里常用来切中英文 / 选字）', () => {
    expect(resolveComboAction({ key: 'N', shiftKey: true, isComposing: true })).toBeNull()
  })

  it('白名单之外的字母不放行 —— 焦点移动与历史前进后退都假设「焦点不在输入框」', () => {
    // W A D = 方向键（场景分支会先 dropNativeFocus）、X Q E = 历史、Z = 确认、J G T L U = 各页快捷键…
    // 注意 `S` / `P` **不在这张表里**了：写作页的「Shift+S 存草稿 / Shift+P 发布」把它们要走了
    //（用户裁决 §62）。代价是正文里打不出大写的 S / P、且 Shift+S 不再等于"往下"。
    for (const letter of ['W', 'A', 'D', 'X', 'Q', 'E', 'Z', 'J', 'G', 'T', 'L', 'U']) {
      expect(resolveComboAction(key(letter, true))).toBeNull()
    }
  })

  it('写作页的两个连击键：Shift+S 存草稿、Shift+P 发布（连击表与 KEYMAP 分开）', () => {
    expect(resolveComboAction(key('S', true))).toBe('saveDraft')
    expect(resolveComboAction(key('P', true))).toBe('publish')
    // 分开的意义：`resolvePadAction` 里 `s` 仍然是 WASD 的"下"，两条路互不干扰
    expect(resolvePadAction(key('s'))).toBe('down')
    expect(resolvePadAction(key('S', true))).toBe('down')
  })

  it('只认字母：Shift+1 打出的是「!」，那是符号输入', () => {
    expect(resolveComboAction(key('!', true))).toBeNull()
    expect(resolveComboAction(key('ArrowDown', true))).toBeNull()
  })
})

describe('dispatchPadAction：两趟派发与消费语义', () => {
  it('第一趟（当前作用域）用掉按键后，第二趟的 any 监听器看到 consumed=true', () => {
    const scene = vi.fn(() => true)
    const any = vi.fn(() => false)
    onPad(scene, 'scene')
    onPad(any, 'any')

    expect(dispatchPadAction('cancel')).toBe(true)
    expect(any).toHaveBeenCalledWith('cancel', true)
  })

  it('第一趟没人接管时，any 监听器看到 consumed=false 并可以自己处理', () => {
    const scene = vi.fn(() => false)
    const any = vi.fn(() => true)
    onPad(scene, 'scene')
    onPad(any, 'any')

    expect(dispatchPadAction('cancel')).toBe(true)
    expect(any).toHaveBeenCalledWith('cancel', false)
  })

  it('同一趟内先注册的先处理，且后面的能看到前面已消费', () => {
    const first = vi.fn(() => true)
    const second = vi.fn(() => false)
    onPad(first, 'any')
    onPad(second, 'any')

    dispatchPadAction('confirm')
    expect(first).toHaveBeenCalledWith('confirm', false)
    expect(second).toHaveBeenCalledWith('confirm', true)
  })

  it('没人消费时返回 false —— 调用方据此不 preventDefault（原生滚动得以保留）', () => {
    const listener = vi.fn(() => false)
    onPad(listener, 'any')
    expect(dispatchPadAction('down')).toBe(false)
  })

  it('返回值是 undefined 的监听器不算消费', () => {
    onPad(() => undefined, 'any')
    expect(dispatchPadAction('down')).toBe(false)
  })

  it('作用域隔离：pause 打开时 scene 监听器收不到按键', () => {
    const scene = vi.fn(() => true)
    const pause = vi.fn(() => true)
    onPad(scene, 'scene')
    onPad(pause, 'pause')

    activeScope.value = 'pause'
    dispatchPadAction('confirm')

    expect(scene).not.toHaveBeenCalled()
    expect(pause).toHaveBeenCalledTimes(1)
  })

  it('焦点停在标签栏上时，内容层（scene）收不到方向键，any 仍收到', () => {
    const scene = vi.fn(() => true)
    const any = vi.fn(() => false)
    onPad(scene, 'scene')
    onPad(any, 'any')

    focusZone.value = 'tabs'
    dispatchPadAction('right')

    expect(scene).not.toHaveBeenCalled()
    expect(any).toHaveBeenCalledTimes(1)
  })

  it('输入锁定时谁都不触发，但 START 仍然放行（开机自检时能进菜单）', () => {
    const scene = vi.fn(() => true)
    onPad(scene, 'scene')

    inputLocked.value = true
    expect(dispatchPadAction('confirm')).toBe(false)
    expect(scene).not.toHaveBeenCalled()

    expect(dispatchPadAction('start')).toBe(true)
    expect(scene).toHaveBeenCalledWith('start', false)
  })

  it('注销后不再收到按键', () => {
    const listener = vi.fn(() => true)
    const off = onPad(listener, 'any')

    dispatchPadAction('confirm')
    off()
    dispatchPadAction('confirm')

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('所有动作都能安全派发（无监听器时不炸）', () => {
    const actions: PadAction[] = [
      'up',
      'down',
      'left',
      'right',
      'confirm',
      'cancel',
      'start',
      'pagePrev',
      'pageNext',
      'tabPrev',
      'tabNext',
      'back',
      'forward',
      'jump',
      'focusGroup',
      'focusTag',
      'focusLike',
      'focusFact',
      'toTop',
    ]
    for (const action of actions) expect(dispatchPadAction(action)).toBe(false)
  })
})

describe('Shift + 方向键 → 焦点切换动作（专用动作，不借 left/right）', () => {
  it('四个方向键都映射到 focus* 动作', () => {
    expect(focusActionForArrow('ArrowUp')).toBe('focusUp')
    expect(focusActionForArrow('ArrowDown')).toBe('focusDown')
    expect(focusActionForArrow('ArrowLeft')).toBe('focusLeft')
    expect(focusActionForArrow('ArrowRight')).toBe('focusRight')
  })

  it('字母与其它键不认（Shift+w/a/s/d 是打字，不是焦点切换）', () => {
    for (const key of ['w', 'a', 's', 'd', 'W', 'Enter', 'Tab', 'Escape', 'PageUp']) {
      expect(focusActionForArrow(key)).toBe(null)
    }
  })
})

describe('isEditableTarget：输入框里不劫持按键', () => {
  it('表单域与可编辑区返回 true', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(isEditableTarget({ tagName } as unknown as EventTarget)).toBe(true)
    }
    expect(
      isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget),
    ).toBe(true)
  })

  it('普通元素与 null 返回 false', () => {
    expect(isEditableTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false)
    expect(isEditableTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})

import { afterEach, describe, expect, it } from 'vitest'

import {
  activeScope,
  focusZone,
  inputLocked,
  lockInput,
  resetInputState,
  setFocusZone,
  setScope,
} from '@/input/scopes'

/**
 * 输入路由状态的自测。
 *
 * 重点是两个「返回恢复函数」的 API：模态开/关如果靠手写两次赋值，
 * 迟早会出现「关掉菜单后作用域忘了切回来」，新页面所有按键石沉大海。
 */

afterEach(() => {
  resetInputState()
})

describe('setScope：模态作用域', () => {
  it('切到 pause 并恢复回切换前的值', () => {
    const release = setScope('pause')
    expect(activeScope.value).toBe('pause')

    release()
    expect(activeScope.value).toBe('scene')
  })

  it('嵌套切换时各自恢复一层（不互相踩）', () => {
    const outer = setScope('pause')
    const inner = setScope('scene')

    inner()
    expect(activeScope.value).toBe('pause')
    outer()
    expect(activeScope.value).toBe('scene')
  })
})

describe('lockInput：转场锁', () => {
  it('锁定与解锁成对，初始为未锁', () => {
    expect(inputLocked.value).toBe(false)
    const unlock = lockInput()
    expect(inputLocked.value).toBe(true)
    unlock()
    expect(inputLocked.value).toBe(false)
  })
})

describe('setFocusZone 与 resetInputState', () => {
  it('焦点分区可切换', () => {
    setFocusZone('tabs')
    expect(focusZone.value).toBe('tabs')
  })

  it('重置把三项一起退回默认值（路由切换时必须干净）', () => {
    setScope('pause')
    setFocusZone('tabs')
    lockInput()

    resetInputState()

    expect(activeScope.value).toBe('scene')
    expect(focusZone.value).toBe('content')
    expect(inputLocked.value).toBe(false)
  })
})

import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * 用户偏好的读 / 写 / 非法值兜底。
 *
 * 顺带在单测层面钉住命名规范（AGENTS.md 第 1 节）：所有落盘的键都必须是
 * `synthspark-icespark-*`。独立性门里也有一条静态检查，但那条只看字面量，
 * 这里看的是**真正写进存储的键**。
 */

type Prefs = typeof import('@/config/prefs')

/** 内存版 localStorage：node 环境没有它，prefs 的两条分支都要能跑 */
function installStorage(seed: Record<string, string> = {}): Map<string, string> {
  const map = new Map<string, string>(Object.entries(seed))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  })
  return map
}

/** 每次以「干净模块」重新加载：默认值是在模块初始化时读存储的 */
async function loadPrefs(
  seed: Record<string, string> = {},
): Promise<{ prefs: Prefs; map: Map<string, string> }> {
  const map = installStorage(seed)
  vi.resetModules()
  const prefs = await import('@/config/prefs')
  return { prefs, map }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('偏好的默认值与存储读取', () => {
  it('空存储时：音效关、动效开、每页 4 条、没问过音效', async () => {
    const { prefs } = await loadPrefs()

    expect(prefs.soundEnabled.value).toBe(false)
    expect(prefs.motionEnabled.value).toBe(true)
    expect(prefs.pageSize.value).toBe(4)
    expect(prefs.soundPromptShown.value).toBe(false)
  })

  it('读回已存的偏好', async () => {
    const { prefs } = await loadPrefs({
      'synthspark-icespark-sound': '1',
      'synthspark-icespark-motion': '0',
      'synthspark-icespark-page-size': '6',
      'synthspark-icespark-sound-prompt': '1',
    })

    expect(prefs.soundEnabled.value).toBe(true)
    expect(prefs.motionEnabled.value).toBe(false)
    expect(prefs.pageSize.value).toBe(6)
    expect(prefs.soundPromptShown.value).toBe(true)
  })

  it('每页条数不在可选项里（含被改坏的值）一律回退默认 4', async () => {
    for (const bad of ['99', 'abc', '0', '-6', '']) {
      const { prefs } = await loadPrefs({ 'synthspark-icespark-page-size': bad })
      expect(prefs.pageSize.value, `page-size=${JSON.stringify(bad)}`).toBe(4)
    }
  })
})

describe('偏好落盘', () => {
  it('改值即写入，键名统一 synthspark-icespark-*', async () => {
    const { prefs, map } = await loadPrefs()

    prefs.setSound(true)
    prefs.setMotion(false)
    prefs.setPageSize(6)
    prefs.markSoundPromptShown()
    await nextTick()

    expect(map.get('synthspark-icespark-sound')).toBe('1')
    expect(map.get('synthspark-icespark-motion')).toBe('0')
    expect(map.get('synthspark-icespark-page-size')).toBe('6')
    expect(map.get('synthspark-icespark-sound-prompt')).toBe('1')

    for (const key of map.keys()) expect(key.startsWith('synthspark-icespark-')).toBe(true)
  })

  it('关音效写 0（下次进来仍是关，而不是回到「没设置」）', async () => {
    const { prefs, map } = await loadPrefs({ 'synthspark-icespark-sound': '1' })
    prefs.setSound(false)
    await nextTick()
    expect(map.get('synthspark-icespark-sound')).toBe('0')
  })

  it('setPageSize 只接受可选档位，其余回退 4', async () => {
    const { prefs, map } = await loadPrefs()

    prefs.setPageSize(6)
    await nextTick()
    expect(prefs.pageSize.value).toBe(6)
    expect(map.get('synthspark-icespark-page-size')).toBe('6')

    // 非法档位 → 回退默认 4（值真的变了才落盘）
    prefs.setPageSize(5)
    await nextTick()
    expect(prefs.pageSize.value).toBe(4)
    expect(map.get('synthspark-icespark-page-size')).toBe('4')
  })

  it('值没变就不落盘（避免每次挂载都写一遍存储）', async () => {
    const { prefs, map } = await loadPrefs({ 'synthspark-icespark-page-size': '4' })

    prefs.setPageSize(4)
    await nextTick()
    // 初始值就是从存储读出来的 4，这里没有实际变化
    expect(map.get('synthspark-icespark-page-size')).toBe('4')
  })

  it('可选项就是样机定稿的 4 / 6（改它属于交互变更，得先跟用户确认）', async () => {
    const { prefs } = await loadPrefs()
    expect([...prefs.PAGE_SIZE_OPTIONS]).toEqual([4, 6])
  })
})

describe('存储不可用时不能拖垮应用', () => {
  it('localStorage 抛异常（隐私模式）时用默认值，且写入不抛', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })

    vi.resetModules()
    const prefs = await import('@/config/prefs')

    expect(prefs.soundEnabled.value).toBe(false)
    expect(prefs.pageSize.value).toBe(4)

    expect(() => {
      prefs.setSound(true)
      prefs.markSoundPromptShown()
    }).not.toThrow()
    await nextTick()
  })

  it('完全没有 localStorage 对象时也不炸（非浏览器环境 / 预渲染）', async () => {
    vi.stubGlobal('localStorage', undefined)
    vi.resetModules()

    const prefs = await import('@/config/prefs')
    expect(prefs.motionEnabled.value).toBe(true)
    expect(prefs.soundEnabled.value).toBe(false)
  })
})

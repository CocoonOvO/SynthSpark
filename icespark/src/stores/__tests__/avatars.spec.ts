import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import { useAvatarStore } from '@/stores/avatars'

/** 造一块能过校验的 16×16（第 i 行全 i%8） */
const grid = (seed = 0): string[] =>
  Array.from({ length: 16 }, (_, i) => String((i + seed) % 8).repeat(16))

const mocks = vi.hoisted(() => ({
  fetchAvatarMap: vi.fn(),
  saveMyAvatar: vi.fn(),
  clearMyAvatar: vi.fn(),
}))

vi.mock('@/api/avatar', () => mocks)

describe('avatars store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('load() 只打一次网络，之后靠缓存', async () => {
    mocks.fetchAvatarMap.mockResolvedValue({ alice: { rows: grid(1) } })
    const store = useAvatarStore()

    await store.load()
    await store.load()
    await store.load()

    expect(mocks.fetchAvatarMap).toHaveBeenCalledTimes(1)
    expect(store.state).toBe('ready')
    expect(store.rowsFor('alice')).toEqual(grid(1))
  })

  it('行别有名字才有值；未知用户 / 空名字都返回 null', async () => {
    mocks.fetchAvatarMap.mockResolvedValue({ alice: { rows: grid(1) } })
    const store = useAvatarStore()
    await store.load()

    expect(store.rowsFor('alice')).toEqual(grid(1))
    expect(store.rowsFor('bob')).toBeNull()
    expect(store.rowsFor('')).toBeNull()
    expect(store.rowsFor(null)).toBeNull()
    expect(store.rowsFor(undefined)).toBeNull()
  })

  it('拿不到（静态部署里没有这条路由）→ unavailable 且不再重试，force 才重试', async () => {
    mocks.fetchAvatarMap.mockRejectedValue(new ApiError(0, '/avatar', null, '取不到头像服务'))
    const store = useAvatarStore()

    await store.load()
    expect(store.state).toBe('unavailable')
    expect(store.error).toContain('取不到头像服务')

    await store.load()
    expect(mocks.fetchAvatarMap).toHaveBeenCalledTimes(1) // 粘性，不重试

    mocks.fetchAvatarMap.mockResolvedValue({ alice: { rows: grid(2) } })
    await store.load(true)
    expect(mocks.fetchAvatarMap).toHaveBeenCalledTimes(2)
    expect(store.state).toBe('ready')
    expect(store.error).toBe('')
    expect(store.rowsFor('alice')).toEqual(grid(2))
  })

  it('save() 就地更新缓存（用服务端解出的用户名），不需要再拉一次', async () => {
    mocks.fetchAvatarMap.mockResolvedValue({})
    mocks.saveMyAvatar.mockResolvedValue({ username: 'me', rows: grid(3), updatedAt: 'now' })
    const store = useAvatarStore()
    await store.load()

    const who = await store.save(grid(3))

    expect(who).toBe('me')
    expect(store.rowsFor('me')).toEqual(grid(3))
    expect(mocks.fetchAvatarMap).toHaveBeenCalledTimes(1)
  })

  it('save() 失败时把错误抛出去，缓存不动', async () => {
    mocks.fetchAvatarMap.mockResolvedValue({})
    mocks.saveMyAvatar.mockRejectedValue(new ApiError(401, '/avatar', null, '缺少令牌：保存点阵头像需要登录'))
    const store = useAvatarStore()
    await store.load()

    await expect(store.save(grid(4))).rejects.toThrow('缺少令牌')
    expect(store.map).toEqual({})
  })

  it('clear() 用服务端解出的用户名删掉那一条', async () => {
    mocks.fetchAvatarMap.mockResolvedValue({ me: { rows: grid(5) }, other: { rows: grid(6) } })
    mocks.clearMyAvatar.mockResolvedValue({ username: 'me', removed: true })
    const store = useAvatarStore()
    await store.load()

    await store.clear()

    expect(store.rowsFor('me')).toBeNull()
    expect(store.rowsFor('other')).toEqual(grid(6)) // 别人的不动
  })
})

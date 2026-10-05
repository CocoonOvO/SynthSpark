import { defineStore } from 'pinia'
import { ref } from 'vue'

import {
  type AvatarMap,
  type AvatarSaved,
  clearMyAvatar,
  fetchAvatarMap,
  saveMyAvatar,
} from '@/api/avatar'
import type { AvatarRows } from '@/signal/pixel-grid'

/**
 * 点阵头像（icespark 自己那份）的运行时状态。
 *
 * 三条口径：
 *  1. **整份拉一次、session 内缓存**：映射是一份本地小文件，没必要每个头像一次请求；
 *     页面里到处都要按作者名查，缓存之后就是一次 `Map` 查找。
 *  2. **拿不到就当没有**：`unavailable` 是**粘性**的（静态部署里 `/avatar` 不存在，
 *     不必每次进页面都重试一遍）。要重试就显式 `load(true)`。
 *  3. **不参与登录态**：`/avatar` 的读是公开的，未登录也能显示别人的点阵头像。
 */
export type AvatarRouteState = 'idle' | 'loading' | 'ready' | 'unavailable'

export const useAvatarStore = defineStore('avatars', () => {
  const map = ref<AvatarMap>({})
  const state = ref<AvatarRouteState>('idle')
  const error = ref('')

  /** 拉一次（默认幂等：ready / unavailable 之后不再打网络） */
  async function load(force = false): Promise<void> {
    if (state.value === 'loading') return
    if (!force && (state.value === 'ready' || state.value === 'unavailable')) return
    state.value = 'loading'
    try {
      map.value = await fetchAvatarMap()
      state.value = 'ready'
      error.value = ''
    } catch (err) {
      // 路由不存在 / 网络失败：都不是页面错误，安静退场
      state.value = 'unavailable'
      error.value = err instanceof Error ? err.message : String(err)
    }
  }

  /** 按用户名取点阵；没有则 null（调用方据此退回名字哈希那张脸） */
  function rowsFor(username: string | null | undefined): AvatarRows | null {
    if (!username) return null
    return map.value[username]?.rows ?? null
  }

  /** 我自己的那一条（保存成功后就地更新缓存，不用再拉一次） */
  async function save(rows: AvatarRows): Promise<string> {
    const saved: AvatarSaved = await saveMyAvatar(rows)
    map.value = {
      ...map.value,
      [saved.username]: { rows: saved.rows, userId: saved.userId, updatedAt: saved.updatedAt },
    }
    state.value = 'ready'
    error.value = ''
    return saved.username
  }

  /** 清掉我自己的那一条 */
  async function clear(): Promise<string> {
    const res = await clearMyAvatar()
    const next: AvatarMap = { ...map.value }
    delete next[res.username]
    map.value = next
    return res.username
  }

  return { map, state, error, load, rowsFor, save, clear }
})

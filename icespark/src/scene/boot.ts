import { ref } from 'vue'

import { applyTransition, beginTransition } from '@/scene/transition'

/**
 * 开机自检 —— 样机 `ui/scene.ts` 里「开机」那一件事，拆到这里（架构 §16.1：拆到 `scene/boot.ts`）。
 *
 * 样机里开机是**场景之一**（`frame` 的初始值是 `{ id: 'boot' }`，BootScene 播完再
 * `presentRoute()` 落到真实路由）；生产版开机**不是一条路由**，画面由外壳在 `booting`
 * 为真时渲染 `BootScreen`（见架构 §16.3），所以这里只保留状态：
 *
 * - URL 始终是真实路由 —— 深链接（如 `/post/xxx`）先播自检，播完直接落在用户要的那一页；
 * - 「开机」不在浏览器历史里留痕，按后退不会退回自检画面（架构 §11.1 已记）。
 *
 * 因此本文件**不操作 router、不碰 DOM、不自己写动画**。
 */

/** 开机动画是否还没播完（未播完时路由变化只改 URL，不动画面） */
export const booting = ref(true)

/** 开机动画播完：把 `booting` 置假，画面交给外壳按当前路由渲染 */
export function finishBoot(skip = false): void {
  if (!booting.value) return
  booting.value = false
  // 跳过自检（用户按键）时亮一下整屏闪白，和样机一样有个反馈；
  // 正常播完则瞬时落页 —— 样机那次 presentRoute('none') 就是不给遮罩。
  if (skip) {
    beginTransition('flash', 'boot-skip')
    applyTransition()
  }
}

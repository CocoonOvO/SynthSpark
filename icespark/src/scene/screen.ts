import { ref } from 'vue'

/**
 * 屏幕滚动 —— 样机 `ui/scene.ts` 里「滚动」那一件事，拆到这里（架构 §16.1：`ui/scene.ts` 的
 * 滚动 / 时钟 / 开机拆成 `scene/screen.ts` · `scene/clock.ts` · `scene/boot.ts`）。
 *
 * 样机的 `ui/scene.ts` 有 184 行，因为它同时管「现在在哪」「怎么过去」和「什么时候换画面」；
 * 生产版画面交给 vue-router + `scene/presenter.ts`，这里就只剩屏内容器的滚动。
 */

/**
 * 屏幕内层滚动容器（`.screen-inner`）。
 * 场景内部需要滚动正文时用它，而不是让方向键被全局吞掉。
 */
export const screenScroller = ref<HTMLElement | null>(null)

/** 按像素滚动屏幕内层，返回是否真的滚动了（到底了就返回 false，好把按键交还浏览器） */
export function scrollScreenBy(deltaY: number): boolean {
  const el = screenScroller.value
  if (!el) return false
  const before = el.scrollTop
  el.scrollBy({ top: deltaY, behavior: 'auto' })
  return el.scrollTop !== before
}

/** 滚到指定位置（文章页的「回到顶部」用） */
export function scrollScreenTo(top: number): boolean {
  const el = screenScroller.value
  if (!el) return false
  if (el.scrollTop === top) return false
  el.scrollTo({ top, behavior: 'auto' })
  return true
}

/** 滚回顶部（切场景时用） */
export function scrollScreenTop(): void {
  screenScroller.value?.scrollTo({ top: 0, behavior: 'auto' })
}

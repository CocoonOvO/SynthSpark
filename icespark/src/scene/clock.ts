import { ref, type Ref } from 'vue'

/**
 * 状态栏时钟 —— 样机 `ui/scene.ts` 的 `useStatusBar()` 原样搬过来（架构 §16.1：拆到 `scene/clock.ts`）。
 *
 * 秒级刷新：只显示到分钟，但每秒走一次，跨分钟时不会「慢一拍」才更新。
 * `stop()` 交给调用方在卸载时清掉定时器 —— 组件卸载后定时器还在跑就会一直改一个死掉的 ref。
 */

export function useStatusBar(): { clock: Ref<string>; stop: () => void } {
  const clock = ref(formatClock())
  const timer = window.setInterval(() => {
    clock.value = formatClock()
  }, 1000)
  return { clock, stop: () => window.clearInterval(timer) }
}

function formatClock(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

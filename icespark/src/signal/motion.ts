import { ref } from 'vue'

/**
 * 动效原语 —— 样机 `ui/pad.ts` 结尾那两个原语逐行搬过来（架构 §16.1 / §16.3：`ui/pad.ts` 的
 * 动效原语 → `signal/motion.ts`）。pad.ts 的其它内容（`usePad()` / `useFocusList()` /
 * 全局 `focusIndex` / `playFocusMove()`）按 §16.3 不迁：外壳已经挂了唯一的键盘监听器
 * （`@/input` 的 `mountInput`），焦点模型也换成 P2 的共享焦点。
 */

/** 逐字打字机：离散出字，不是平滑淡入 */
export function useTypewriter() {
  const text = ref('')
  const done = ref(false)
  let timer: number | null = null

  function type(full: string, speed = 28, onDone?: () => void) {
    if (timer) window.clearInterval(timer)
    text.value = ''
    done.value = false
    let i = 0
    timer = window.setInterval(() => {
      i += 1
      text.value = full.slice(0, i)
      if (i >= full.length) {
        if (timer) window.clearInterval(timer)
        timer = null
        done.value = true
        onDone?.()
      }
    }, speed)
  }

  function finish(full: string) {
    if (timer) window.clearInterval(timer)
    timer = null
    text.value = full
    done.value = true
  }

  return { text, done, type, finish }
}

/** 计数滚动：SCORE 累加用，离散跳数 */
export function useCountUp() {
  const value = ref(0)
  let timer: number | null = null

  function run(target: number, duration = 640) {
    if (timer) window.clearInterval(timer)
    const steps = Math.max(1, Math.floor(duration / 40))
    let i = 0
    value.value = 0
    timer = window.setInterval(() => {
      i += 1
      value.value = Math.round((target * i) / steps)
      if (i >= steps) {
        if (timer) window.clearInterval(timer)
        timer = null
        value.value = target
      }
    }, 40)
  }

  return { value, run }
}

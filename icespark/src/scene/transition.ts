import { ref } from 'vue'

import { motionEnabled } from '@/config/prefs'
import { playSfx } from '@/input/sfx'
import { lockInput } from '@/input/scopes'

/**
 * 整屏像素转场 —— 样机 `ui/scene.ts` 的 `runTransition` 搬过来，时序照旧。
 *
 * 样机里这段逻辑有个前提：**画面由 presenter 自己换**（`present()` 决定什么时候
 * 把新场景放上去），所以它能在「遮罩盖上」之后 120ms 再换内容。
 * 生产版把画面交给 vue-router，换内容的时间点不由我们定 —— 于是时序改成：
 *
 *   beforeEach  遮罩立刻出现 + 锁输入（点击到路由解析完成之间可能有懒加载等待，
 *               遮罩 0 延迟出现，用户马上得到反馈）
 *   afterEach   内容已换好 → **立刻解锁输入**（看到新画面就能操作）+ 动画从头重播
 *               一遍盖在新内容上，280ms 后撤掉遮罩
 *
 * 「同一目标重复触发只算一次、换目标立刻结算上一次」这两条也照搬：
 * 遮罩是装饰，不该排队，更不该把上一次的收尾动作拖到下一次身上。
 */

export type TransitionKind = 'flash' | 'wipe' | 'shake' | 'none'

/** 遮罩显示的时长：与 `.k-*` 的动画时长一致（`--motion-turn` = 280ms） */
const MASK_MS = 280

export const isTransitioning = ref(false)
export const transitionKind = ref<TransitionKind>('none')

/**
 * 遮罩序号。内容换好后 +1，作为 `.trans` 的 `key` 强制重建节点 ——
 * 不重建的话，如果导航比 280ms 动画还慢，动画早就播完了，
 * 遮罩会变成一块静止色块盖在新画面上（这是生产版独有的时序问题）。
 */
export const transitionSeq = ref(0)

/** 下一次导航想用的转场；`null` = 没指定，走默认 */
let pending: TransitionKind | null = null

/** 正在进行的转场标识（去重用） */
let runningKey: string | null = null

/** 遮罩撤下 / 输入解锁的定时器与解锁句柄 */
let timer = 0
let unlockInput: (() => void) | null = null

/** 指定下一次导航的转场（列表筛选这类「同页面只换数据」的导航用 `none`） */
export function requestTransition(kind: TransitionKind): void {
  pending = kind
}

/** 消费掉待用转场（presenter 在导航开始时取走） */
export function consumeTransition(fallback: TransitionKind = 'wipe'): TransitionKind {
  const kind = pending ?? fallback
  pending = null
  return kind
}

/** 收尾：撤遮罩、解锁输入、清定时器。所有结束路径都走它，避免状态卡住 */
function settle(): void {
  window.clearTimeout(timer)
  runningKey = null
  isTransitioning.value = false
  transitionKind.value = 'none'
  unlockInput?.()
  unlockInput = null
}

/**
 * 开始一次转场：遮罩出现、锁输入、出声。
 * `kind === 'none'`（同页面换数据）或用户关掉动效时什么都不做。
 */
export function beginTransition(kind: TransitionKind, key = ''): void {
  if (kind === 'none' || !motionEnabled.value) {
    settle()
    return
  }

  // 同一目标重复触发：忽略（防连点）
  if (isTransitioning.value && runningKey === key) return

  settle()
  runningKey = key
  isTransitioning.value = true
  transitionKind.value = kind
  transitionSeq.value += 1
  unlockInput = lockInput()
  playSfx('transition')
}

/** 内容换好了：解锁输入（立刻可操作），动画重播一遍，280ms 后撤掉遮罩 */
export function applyTransition(): void {
  if (!isTransitioning.value) return

  // 解锁输入，但**不**撤遮罩：看到新画面就能马上操作，动画只是装饰
  unlockInput?.()
  unlockInput = null

  transitionSeq.value += 1
  window.clearTimeout(timer)
  timer = window.setTimeout(settle, MASK_MS)
}

/** 导航被打断（守卫拦下 / 报错）：安静收尾，不留一块遮罩盖住画面 */
export function cancelTransition(): void {
  settle()
}

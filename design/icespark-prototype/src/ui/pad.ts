/**
 * 手柄输入层
 *
 * 反传统要点：
 * - 方向键移动焦点，A 确认，B 返回，START 呼出暂停菜单
 * - 鼠标 hover 不产生视觉变化之外的效果（焦点由共享焦点模型统一管理）
 * - 触摸降级：点击等同 A 键
 *
 * 关键机制「消费语义」：
 * emit 返回本次事件是否被消费，只有被消费才 preventDefault。
 * 这样正文页不接管 ↑↓ 时，浏览器原生滚动依然可用 —— 修复了
 * 「方向键被全局吞掉导致键盘用户无法滚动长文」的缺陷。
 *
 * 作用域（scope）：暂停菜单打开时屏蔽场景层监听，避免按键穿透。
 *
 * **两趟派发（第 5 轮新增）**：
 * 第一趟只给「当前作用域」的监听器（scene 或 pause），第二趟才给 'any' 监听器，
 * 并附带 `consumed` 参数说明第一趟是否已经用掉了这个键。
 * 为什么需要：Esc 在暂停菜单里是「关菜单」，在场景里是「开菜单」，
 * 若两者无序并发，关完菜单后全局监听会立刻再把它打开（同一按键一次生效原则被破坏）。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { playSfx } from './sfx'

export type PadAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'confirm'
  | 'cancel'
  | 'start'
  /** 上一页 / 下一页：PageUp / PageDown（列表翻页专用，与方向键的焦点移动分开） */
  | 'pagePrev'
  | 'pageNext'
  /** 切标签页：Tab / Shift+Tab（只在「有标签栏的页面」生效，文章详情页不切换） */
  | 'tabPrev'
  | 'tabNext'
  /** 历史前进 / 后退：Q / E */
  | 'back'
  | 'forward'
  /** 跳页：J（文章列表） */
  | 'jump'
  /** 聚焦分组选择：G（列表的筛选区 / 文章页的分组·标签芯片） */
  | 'focusGroup'
  /** 聚焦标签行：T（文章列表） */
  | 'focusTag'
  /** 聚焦点赞·评论栏：L（文章详情） */
  | 'focusLike'
  /** 回到文章顶部：U（文章详情） */
  | 'toTop'

/** 输入作用域：any 永远接收（用于 START 这类全局键），但排在第二趟 */
export type PadScope = 'scene' | 'pause' | 'any'

/** 全局焦点索引（场景内单选列表用） */
export const focusIndex = ref(0)
export const focusCount = ref(0)

/** 当前生效的作用域 */
export const activeScope = ref<Exclude<PadScope, 'any'>>('scene')

/** 输入是否被锁定（转场中） */
export const inputLocked = ref(false)

/**
 * 焦点分区：内容区 / 顶部标签栏。
 * 放在输入层是因为它是一条**输入路由规则**：焦点在标签栏上时，
 * scene 作用域的监听器收不到按键（否则光标会在标签栏和列表里同时移动）。
 */
export const focusZone = ref<'tabs' | 'content'>('content')

/**
 * 监听器签名。第二个参数 `consumed` 只对作用域 'any' 有意义：
 * 第一趟（当前作用域的监听器）已经处理掉这个键时为 true，
 * 全局监听器据此让位（例如暂停菜单已经吃掉了 Esc，全局就别再开菜单）。
 */
type Handler = (a: PadAction, consumed: boolean) => boolean | void

const listeners = new Map<Handler, PadScope>()

export function onPad(handler: Handler, scope: PadScope = 'scene'): () => void {
  listeners.set(handler, scope)
  return () => listeners.delete(handler)
}

/** 按插入顺序遍历某一批监听器，返回是否被消费 */
function runPass(pred: (scope: PadScope) => boolean, a: PadAction, consumed: boolean): boolean {
  let used = false
  listeners.forEach((scope, fn) => {
    if (!pred(scope)) return
    if (fn(a, consumed || used) === true) used = true
  })
  return used
}

/** 派发事件，返回是否被消费 */
function emit(a: PadAction): boolean {
  if (inputLocked.value && a !== 'start') return false

  // 第一趟：当前作用域的监听器。焦点停在标签栏上时，内容层收不到按键
  // （否则一次按键会同时移动标签高亮和列表光标）。
  // 注意作用域在此刻取值，第二趟再取可能已经被改（关菜单会把作用域切回 scene）。
  const scope = activeScope.value
  const skipScene = focusZone.value === 'tabs'
  let consumed = runPass(
    (s) => s === scope && !(s === 'scene' && skipScene),
    a,
    false
  )

  // 第二趟：全局监听器（标签栏切换、启动键、Esc 开菜单…）
  if (runPass((s) => s === 'any', a, consumed)) consumed = true

  if (consumed) ensureFocusedVisible()
  return consumed
}

/**
 * 焦点走到哪，屏幕就跟到哪。
 *
 * 为什么必须有：焦点是我们自己用 class 画的，不是 DOM 焦点，
 * 因此浏览器不会像 Tab 键那样自动把元素滚进视野。
 * 页面一长（主页 / 关于页 / 长文），键盘用户就会「焦点跑到屏幕外面去了」。
 * 写法上直接交给 `scrollIntoView({ block: 'nearest', inline: 'nearest' })`：
 * 'nearest' 的语义是「已经在视野里就什么也不做」，因此不需要自己量可见性；
 * 而且它会**逐层处理可滚动祖先** —— 列表的筛选条是单行横向滚动（overflow-x: auto），
 * 只检查纵向的话，被挤到右边的标签永远滚不进来。
 */
function ensureFocusedVisible() {
  if (typeof requestAnimationFrame === 'undefined') return
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>('.screen-inner .is-focused')
    if (!el) return
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
  })
}

/**
 * 按键映射
 *
 * 单字符键一律小写（handler 里做过归一化），
 * Tab 需要在 handler 里单独处理（要区分 Shift+Tab）。
 */
const KEYMAP: Record<string, PadAction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  Enter: 'confirm',
  ' ': 'confirm',
  z: 'confirm',
  Escape: 'cancel',
  Backspace: 'back', // 返回上一页（与 Q 同义：历史后退）
  x: 'back',
  p: 'start',
  PageUp: 'pagePrev',
  PageDown: 'pageNext',
  Tab: 'tabNext', // Shift+Tab 在 handler 里改成 tabPrev
  q: 'back', // 返回上一页（历史后退）
  e: 'forward', // 回到下一页（历史前进）
  j: 'jump', // 跳页
  g: 'focusGroup',
  t: 'focusTag',
  l: 'focusLike',
  u: 'toTop',
}

/** 在组件中使用：自动挂载/卸载键盘监听 */
export function usePad() {
  function handler(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null
    const inField =
      !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

    // 输入框内不劫持按键：只保留 Esc 交给上层处理
    // （登录框 / 设置框 / 跳页输入框里的 Tab、字母、回车都归浏览器与表单本身）
    if (inField) {
      if (e.key === 'Escape') {
        e.preventDefault()
        emit('cancel')
      }
      return
    }

    // 单字符键归一化小写，否则开着大写锁定或按住 Shift 时会静默失效
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    let action = KEYMAP[key]
    if (key === 'Tab' && e.shiftKey) action = 'tabPrev'
    if (!action) return

    // 转场遮罩期间不接管按键（屏幕还是旧画面），但 Tab 必须吞掉：
    // 放任它，浏览器会把原生焦点挪到某个按钮上 —— 那个焦点没有任何视觉指示，
    // 而且之后按回车会「莫名其妙」触发它。
    if (inputLocked.value && (action === 'tabNext' || action === 'tabPrev')) {
      e.preventDefault()
      return
    }

    // 只有被消费才阻止默认行为，否则把按键还给浏览器（原生滚动等）
    if (emit(action)) e.preventDefault()
  }

  onMounted(() => window.addEventListener('keydown', handler))
  onUnmounted(() => window.removeEventListener('keydown', handler))
}

/** 焦点列表管理：越界时返回 false（由调用方决定是否抖动提示） */
export function useFocusList(count: () => number) {
  function move(dir: 1 | -1) {
    const n = count()
    if (n === 0) return false
    const next = focusIndex.value + dir
    if (next < 0 || next >= n) return false
    focusIndex.value = next
    return true
  }
  return { move }
}

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

/** 键盘移动焦点时的音效（鼠标移动焦点必须静音，见 sfx.ts） */
export function playFocusMove() {
  playSfx('move')
}

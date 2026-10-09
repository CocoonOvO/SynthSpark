import { activeScope, focusZone, inputLocked } from './scopes'

/**
 * 手柄输入层 —— 8bit 掌机的「按键」抽象。
 *
 * 三件事照样机定稿原样搬：
 *
 * 1. **按键语义**：方向键移焦点、A(Enter/Z/Space) 确认、B(Esc) 返回、START(P) 呼出菜单，
 *    外加一批场景级快捷键（Q/E 历史前进后退、PageUp/PageDown 翻页、J 跳页、G 分组…）。
 *
 * 2. **消费语义**：监听器返回 true 才算「用掉」这个键，只有被用掉才 `preventDefault`。
 *    这样正文页不接管 ↑↓ 时，浏览器原生滚动依然可用 —— 修的是
 *    「方向键被全局吞掉导致键盘用户无法滚动长文」这个真实缺陷。
 *
 * 3. **两趟派发**：第一趟只给当前作用域的监听器，第二趟才给 `any` 监听器，
 *    并告诉后者第一趟是否已经用掉这个键（`consumed`）。
 *    没有它就会出现「Esc 关掉菜单 → 全局监听立刻又打开菜单」这种同键双触发。
 */

export type PadAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  /**
   * `Shift + 方向键`：**在输入框里**做焦点切换（用户裁决 2026-10-09）。
   *
   * 为什么要另开四个动作、而不是借用 `left` / `right`：输入框里 `Shift + 方向键` 本来是**选字**，
   * 而 `left` / `right` 在别的页面（列表、写作页）也被用着 —— 借用就等于把选字一并抢走
   * （写作页那条「选中一段再点插入」当场挂掉）。单开一组：**只有真要用它做焦点切换的页面
   * 才消费**，没人消费就还给浏览器选字，和其它组合键同一条纪律。
   */
  | 'focusUp'
  | 'focusDown'
  | 'focusLeft'
  | 'focusRight'
  | 'confirm'
  | 'cancel'
  | 'start'
  /** 上一页 / 下一页：PageUp / PageDown（列表翻页，与方向键的焦点移动分开） */
  | 'pagePrev'
  | 'pageNext'
  /** 切标签页：Tab / Shift+Tab（只在有标签栏的页面生效） */
  | 'tabPrev'
  | 'tabNext'
  /** 历史前进 / 后退：Q / E */
  | 'back'
  | 'forward'
  /** 跳页：J */
  | 'jump'
  /** 聚焦分组选择：G */
  | 'focusGroup'
  /** 聚焦标签行：T */
  | 'focusTag'
  /** 聚焦点赞·评论栏：L */
  | 'focusLike'
  /**
   * 聚焦关于页的条目组：F（只在 `/about` 上有人监听）
   *
   * 为什么关于页需要一个专用键而不是 TAB：`/about` 是四个标签页之一，
   * TAB 在标签页上是「切页」（`App.vue` 的全局分派，样机定稿），焦点永远到不了条目上 ——
   * 于是「纯键盘打不开条目链接」，输入等价性当场破（用户裁决 2026-10-05）。
   * 语义与 `focusLike` / `focusGroup` / `focusTag` 一致：把共享光标送进一组内容。
   */
  | 'focusFact'
  /** 存草稿：`Shift+S`（写作页；Ctrl/⌘+S 由编辑框自己接，两条并存） */
  | 'saveDraft'
  /** 发布：`Shift+P`（写作页） */
  | 'publish'
  /** 回到顶部：U */
  | 'toTop'
  /**
   * 写作页的三个面板（P6 新增，只在 `/write` 上有人监听）。
   *
   * 为什么不是「页面自己再挂一个 DOM 监听」：这个内核是唯一的键盘入口，
   * 页面绕过它就等于把「同一个键在不同页面走不同链路」引进来。
   * 三个键选得都不与既有的撞：N（文稿）/ M（资料）/ V（预览）在 KEYMAP 里原本空着。
   * 注意**它们在正文里按不出来** —— 可编辑目标只放 ESC 过去（`input/index.ts`），
   * 所以正确用法是先 TAB 出正文再按（写作页的键位提示就是这么写的）。
   */
  /** 文稿面板（分组 · 已发布/草稿 · 篇目列表）：N */
  | 'panelDocs'
  /** 资料面板（标签 · 封面 · 分组归属 · 文章操作）：M */
  | 'panelMeta'
  /** 预览面板（窄屏用；宽屏本来就有常驻预览栏）：V */
  | 'panelPreview'

/**
 * 监听器签名。第二个参数 `consumed` 只对作用域 `any` 有意义：
 * 第一趟（当前作用域）已经处理掉这个键时为 true，全局监听器据此让位。
 */
export type PadHandler = (action: PadAction, consumed: boolean) => boolean | void

const listeners = new Map<PadHandler, PadScopeInternal>()

type PadScopeInternal = 'scene' | 'pause' | 'any'

/**
 * 注册监听器。默认 `scene`；全局键（Tab 切换、START、Esc）用 `any`。
 * 返回注销函数。
 */
export function onPad(handler: PadHandler, scope: PadScopeInternal = 'scene'): () => void {
  listeners.set(handler, scope)
  return () => {
    listeners.delete(handler)
  }
}

/** 按插入顺序遍历一批监听器，返回这一趟是否有人用掉了按键 */
function runPass(
  predicate: (scope: PadScopeInternal) => boolean,
  action: PadAction,
  consumed: boolean,
): boolean {
  let used = false

  listeners.forEach((scope, handler) => {
    if (!predicate(scope)) return
    if (handler(action, consumed || used) === true) used = true
  })

  return used
}

/**
 * 派发一个按键动作，返回是否被消费。
 *
 * 作用域在**此刻**取值：第二趟再取可能已经被改（关菜单会把作用域切回 scene），
 * 那样第一趟的判定就错了。
 */
export function dispatchPadAction(action: PadAction): boolean {
  // 锁输入期间只放行 START（开机自检时按 P 仍能进菜单）
  if (inputLocked.value && action !== 'start') return false

  const scope = activeScope.value
  // 焦点停在标签栏上时，内容层收不到按键：否则一次按键会同时移动两处
  const skipScene = focusZone.value === 'tabs'

  let consumed = runPass((s) => s === scope && !(s === 'scene' && skipScene), action, false)

  // 第二趟：全局监听器
  if (runPass((s) => s === 'any', action, consumed)) consumed = true

  if (consumed) ensureFocusedVisible()
  return consumed
}

/**
 * 焦点走到哪，屏幕就跟到哪。
 *
 * 为什么必须有：焦点是我们自己用 class 画的、不是 DOM 焦点，
 * 浏览器不会像 Tab 那样自动把元素滚进视野。页面一长（首页 / 关于页 / 长文），
 * 键盘用户就会「焦点跑到屏幕外面去了」。
 *
 * 交给 `scrollIntoView({ block: 'nearest', inline: 'nearest' })`：
 * 'nearest' 的语义是「已经在视野里就什么都不做」，因此不用自己量可见性；
 * 而且它会**逐层处理可滚动祖先** —— 列表的筛选条是单行横向滚动，
 * 只看纵向的话，被挤到右边的标签永远滚不进来。
 */
function ensureFocusedVisible(): void {
  if (typeof requestAnimationFrame === 'undefined') return

  requestAnimationFrame(() => {
    const element = document.querySelector<HTMLElement>('.screen-inner .is-focused')
    if (!element) return
    element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
  })
}

/**
 * 按键映射。单字符键一律小写（`resolvePadAction` 里做过归一化），
 * Tab 要区分 Shift，单独处理。
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
  Backspace: 'back',
  x: 'back',
  p: 'start',
  PageUp: 'pagePrev',
  PageDown: 'pageNext',
  Tab: 'tabNext',
  q: 'back',
  e: 'forward',
  j: 'jump',
  g: 'focusGroup',
  t: 'focusTag',
  l: 'focusLike',
  f: 'focusFact',
  u: 'toTop',
  // 写作页专用（P6）：N 文稿 / M 资料 / V 预览。三个字母此前都空着，不动既有键位
  n: 'panelDocs',
  m: 'panelMeta',
  v: 'panelPreview',
}

/** 方向键 → 「输入框里的焦点切换」动作（只有 `Shift + 方向键` 这条路走它） */
const FOCUS_ACTION_BY_ARROW: Record<string, PadAction> = {
  ArrowUp: 'focusUp',
  ArrowDown: 'focusDown',
  ArrowLeft: 'focusLeft',
  ArrowRight: 'focusRight',
}

export function focusActionForArrow(key: string): PadAction | null {
  return FOCUS_ACTION_BY_ARROW[key] ?? null
}

/** 事件目标是不是「正在输入的表单域」——输入框里不劫持按键 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable === true
  )
}

/**
 * 键盘事件 → 按键动作（纯函数，方便单测）。
 *
 * 单字符键做小写归一化，否则开着大写锁定或按住 Shift 时字母快捷键会静默失效。
 */
export function resolvePadAction(event: Pick<KeyboardEvent, 'key' | 'shiftKey'>): PadAction | null {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (key === 'Tab') return event.shiftKey ? 'tabPrev' : 'tabNext'
  return KEYMAP[key] ?? null
}

/** 组合键真正读的字段：修饰键与输入法状态都可缺省（缺省＝没按住 / 没在组字），单测好写 */
export type ComboKeyEvent = Pick<KeyboardEvent, 'key' | 'shiftKey'> & {
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  isComposing?: boolean
}

/**
 * 编辑框里允许用 `Shift + 字母` 触发的动作 —— **只放这三个面板键**。
 *
 * 为什么不「有映射就放行」：场景监听器是**按「可编辑目标永远到不了这里」写的**。
 * 写作页的方向键分支就是明证 —— 它先 `dropNativeFocus()` 再返回 false，于是
 * 把 W / A / S / D 放进编辑框只会得到「想打大写 A，光标掉了、字也没进去」；
 * 而 X / Q / E 是历史前进后退，在正文里误按一下就是整页跳走。这两类键的正路都是
 * 先 `ESC` 失焦（见 `input/index.ts`），回到「不在输入」的状态再按原键。
 * 面板键不一样：它们本来就是「离开编辑区去看别的东西」，开面板时收掉原生焦点正是应有之义。
 */
/**
 * `Shift + 字母` 的**独立**映射表（不再借 `KEYMAP`）。
 *
 * 为什么不借：`s` 在 `KEYMAP` 里是 WASD 的"下"（用户要做方向键式的直观移动），
 * 借过来就分不开「Shift+S 存草稿」与「Shift+S 当方向键」了。分开之后两边各说各话：
 * 方向键/WASD 走 `KEYMAP`，连击快捷键走这张表。
 *
 * 代价要写清楚（用户口径）：在正文里打字时 `Shift+S` / `Shift+P` 会被接走，
 * 也就是**打不出大写的 S / P**；`Shift+S` 也不再等于"往下"。
 * 这是「连击快捷键」这套机制的固有取舍（`Shift+N/M/V` 早就是这样），
 * 换来的是"写正文时也能一键存草稿 / 发布"。不想付这个代价就用 `Ctrl/⌘+S`、`Ctrl/⌘+Enter`。
 */
const COMBO_KEYMAP: Record<string, PadAction> = {
  n: 'panelDocs',
  m: 'panelMeta',
  v: 'panelPreview',
  s: 'saveDraft',
  p: 'publish',
}

const COMBO_ACTIONS: ReadonlySet<PadAction> = new Set<PadAction>(Object.values(COMBO_KEYMAP))

/**
 * `Shift + 字母` → 白名单内的按键动作（纯函数，方便单测）。
 *
 * 三种情况必须让开：
 *   - 没按 Shift：那是正常输入，一个字都不能抢；
 *   - 带 Ctrl / Alt / Meta：`Ctrl+S` 存草稿、`Ctrl+A` 全选、`⌘+P` 打印是浏览器与系统的键，
 *     抢过来就成了「想存草稿却开了面板」这类事故；
 *   - 输入法组字期间（`isComposing`）：中文输入里 Shift 常用来切中英文 / 选字。
 *
 * 另外只认字母：`Shift+1` 打出来的是 `!`，那是符号输入，与快捷键无关。
 * 单字符键照样做小写归一化 —— 按住 Shift 时 `event.key` 是大写。
 */
export function resolveComboAction(event: ComboKeyEvent): PadAction | null {
  if (!event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return null
  if (event.isComposing) return null
  if (event.key.length !== 1 || !/[a-z]/i.test(event.key)) return null
  const action = COMBO_KEYMAP[event.key.toLowerCase()]
  return action && COMBO_ACTIONS.has(action) ? action : null
}

/** 注销全部监听器（测试与卸载用） */
export function clearPadListeners(): void {
  listeners.clear()
}

/**
 * **模态内的 Tab 循环**（焦点陷阱）——用户 2026-10-01 裁决做的那个。
 *
 * 起因：登录框里 Tab 走到「登录」按钮之后，Tab 与 Shift+Tab 都被外壳吞掉（模态期间
 * 导航类全局键一律不生效），焦点当场卡死，只剩 ESC 能脱身（探针实录见 §53.1）。
 *
 * 做法：**显式声明**要圈闭的容器 —— 容器上挂 `data-focus-trap="cycle"`，
 * 内核（`input/index.ts`）在 Tab 时先问这里一句。为什么不做成「凡 `aria-modal` 都圈」：
 * 暂停菜单是**自绘光标**的（行上有 `.is-focused`），把原生焦点也循环进去会出现两个光标；
 * 带表单的对话框（登录框 / 长文本编辑框）没有自绘光标，循环原生焦点才是对的。
 * 判定与口径都留在这里，内核只管「问一句、吞一下」。
 *
 * 边界口径：
 *   - 焦点**不在**容器里 → 不管（这样「菜单刚打开、焦点还在外壳根节点」时行为不变）；
 *   - 容器里可见可聚焦的元素不足两个 → 不管（没得循环，照旧让外壳吞掉）；
 *   - 只挑**看得见**的（隐藏的 file input 之类不许成为焦点停靠点）；
 *   - 循环到底／到顶是**回绕**（最后一个 → 第一个），这正是「卡死」的对立面。
 */

/** 循环取下一个下标（纯函数，单测用）：到顶回底、到底回顶 */
export function nextFocusIndex(current: number, count: number, dir: 1 | -1): number {
  if (count <= 0) return -1
  const from = current < 0 ? (dir === 1 ? -1 : 0) : current
  return (from + dir + count) % count
}

/** 可聚焦元素的选择器（与 `input/index.ts` 的 `FOCUSABLE_SELECTOR` 同口径） */
export const TRAP_FOCUSABLE = 'a[href], button, input, textarea, select, [tabindex]'

/** 元素是否**看得见**（隐藏的 file input 不许当焦点停靠点） */
function visible(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false
  if (el.tabIndex < 0) return false
  return el.getClientRects().length > 0
}

/** 当前应当被圈闭的容器（`null` = 没有） */
function activeTrap(doc: Document): HTMLElement | null {
  const root = doc.activeElement
  if (!root || root === doc.body) return null
  const holder = (root as HTMLElement).closest<HTMLElement>('[data-focus-trap="cycle"]')
  return holder
}

/**
 * 把焦点在圈闭容器内挪一格；**挪动了才返回 true**（内核据此决定要不要 `preventDefault`）。
 */
export function cycleFocusInTrap(doc: Document, dir: 1 | -1): boolean {
  const trap = activeTrap(doc)
  if (!trap) return false

  const items = [...trap.querySelectorAll<HTMLElement>(TRAP_FOCUSABLE)].filter(visible)
  if (items.length < 2) return false

  const current = items.indexOf(doc.activeElement as HTMLElement)
  const next = items[nextFocusIndex(current, items.length, dir)]
  if (!next || next === doc.activeElement) return false

  next.focus()
  return true
}

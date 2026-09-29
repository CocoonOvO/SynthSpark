import { dispatchPadAction, isEditableTarget, resolvePadAction } from './pad'
import { inputLocked } from './scopes'

/**
 * 把输入层挂到**外壳根节点**上（不挂 window）。
 *
 * 为什么不挂 window：这是一条输入路由规则，不是洁癖 ——
 * 挂 window 意味着页面里任何地方（表单、未来的内嵌编辑器、第三方部件）的按键
 * 都会先经过手柄层；挂在外壳根节点上，只有外壳内部的按键才进入这套派发。
 *
 * 代价要显式补上：键盘事件只沿着**当前焦点**的祖先链冒泡，
 * 而刚打开页面时焦点在 `body` 上，所以这里要主动接管一次焦点，
 * 并在点到不可聚焦的空白处（焦点会掉回 body）时把焦点拉回来。
 * 少了这两句，键盘用户在按第一下之前得先用鼠标点一下 —— 那就不是「单独用键盘」了。
 */
export function mountInput(root: HTMLElement): () => void {
  /** 可聚焦元素选择器：点在它们身上时不动焦点，交给浏览器 */
  const FOCUSABLE_SELECTOR = 'a, button, input, textarea, select, [tabindex]'

  function onKeydown(event: KeyboardEvent): void {
    // 输入框里不劫持按键，只留 Esc 给上层：
    // 登录框 / 设置框里的 Tab、字母、回车都归浏览器与表单本身
    if (isEditableTarget(event.target)) {
      if (event.key === 'Escape') {
        event.preventDefault()
        dispatchPadAction('cancel')
      }
      return
    }

    const action = resolvePadAction(event)
    if (!action) return

    // 锁输入期间不接管按键（屏幕还是旧画面），但 Tab 必须吞掉：
    // 放任它，浏览器会把原生焦点挪到某个按钮上 —— 那个焦点没有任何视觉指示，
    // 之后按回车会「莫名其妙」触发它
    if (inputLocked.value && (action === 'tabNext' || action === 'tabPrev')) {
      event.preventDefault()
      return
    }

    // 只有被消费才阻止默认行为，否则把按键还给浏览器（原生滚动等）
    if (dispatchPadAction(action)) event.preventDefault()
  }

  function onPointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement | null
    if (target?.closest(FOCUSABLE_SELECTOR)) return
    root.focus({ preventScroll: true })
  }

  root.addEventListener('keydown', onKeydown)
  root.addEventListener('pointerdown', onPointerDown)

  // 首次加载：焦点在 body 上，先接管一次
  root.focus({ preventScroll: true })

  return () => {
    root.removeEventListener('keydown', onKeydown)
    root.removeEventListener('pointerdown', onPointerDown)
  }
}

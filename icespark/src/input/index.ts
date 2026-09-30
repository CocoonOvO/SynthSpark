import { dispatchPadAction, isEditableTarget, resolveComboAction, resolvePadAction } from './pad'
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
/**
 * 外壳根节点（`mountInput` 挂的那一个）。
 * 页面把焦点从「Tab 走出来的链接」收回来时必须回到它这里，**不能 `blur()` 到 body** ——
 * 键盘事件只沿当前焦点的祖先链冒泡，焦点掉到 body 之后外壳的 `keydown` 监听器就再也收不到按键，
 * 整块键盘当场失灵（实测：文章页 Tab 到正文链接 → 按方向键 → 之后按 P 菜单都打不开）。
 */
let shellRoot: HTMLElement | null = null

/** 把焦点收回外壳根节点（页面自定义焦点模型接管时用，见上面的注释） */
export function focusShellRoot(): void {
  shellRoot?.focus({ preventScroll: true })
}

export function mountInput(root: HTMLElement): () => void {
  shellRoot = root

  /** 可聚焦元素选择器：点在它们身上时不动焦点，交给浏览器 */
  const FOCUSABLE_SELECTOR = 'a, button, input, textarea, select, [tabindex]'

  function onKeydown(event: KeyboardEvent): void {
    // 焦点在输入框 / 可编辑区里时按键归输入本身（登录框 / 设置框里的 Tab、字母、
    // 回车都交给浏览器与表单），只有两条例外：
    //   ① `ESC`  = 从编辑框里出来（失焦），把焦点交回外壳；
    //   ② `Shift + 字母` = 把被输入吃掉的字母快捷键按组合键还回来（见 `resolveComboAction`）。
    if (isEditableTarget(event.target)) {
      // 输入法正在组字：这时的 `ESC` 是「取消这次组字」、`Shift` 常用来切中英文 / 选字，
      // 抢过来就会打断正在打的词 —— 组字期间内核整个让开（中文输入是本站的主路径）
      if (event.isComposing) return

      // ESC = 失焦（2026-09-30 用户裁定：菜单留到失焦之后）。
      // **不能** `blur()` 到 body —— 焦点掉到 body 之后外壳再也收不到按键，整块键盘当场失灵
      // （见上面 `shellRoot` 的注释），所以这里是把焦点交回外壳根节点。
      // 第二下 ESC 时焦点已经不在编辑框里，根本走不到这一支，由页面 / 外壳照常决定它干什么。
      if (event.key === 'Escape') {
        event.preventDefault()
        focusShellRoot()
        return
      }

      // 只有当前场景真的用掉了这个动作才吞掉按键，否则还给浏览器（大写字母照常输入）
      const combo = resolveComboAction(event)
      if (combo && dispatchPadAction(combo)) event.preventDefault()
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

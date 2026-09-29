import { ref } from 'vue'

/**
 * 输入路由状态 —— 决定「一个按键先给谁」。
 *
 * 这一层存在的理由：手柄只有一个方向键，而屏幕上有多个区域能用它。
 * 谁在什么条件下收不到按键，必须有个**唯一**的判定处，否则会出现
 * 「一次按键同时移动标签高亮和列表光标」这类双触发。
 *
 * 三件事：
 * - `activeScope`：当前作用域（scene / pause）。暂停菜单打开时场景层收不到按键。
 * - `focusZone`：焦点分区（content / tabs）。焦点停在标签栏上时，内容层收不到方向键。
 * - `inputLocked`：转场遮罩期间锁输入（屏幕还是旧画面，按键不该生效）。
 */

/** 输入作用域。`any` 是监听器的归属，不是可设置的当前作用域 */
export type PadScope = 'scene' | 'pause' | 'any'

/** 可被设为「当前」的作用域 */
export type ActiveScope = Exclude<PadScope, 'any'>

/** 焦点分区：内容区 / 顶部标签栏 */
export type FocusZone = 'tabs' | 'content'

/** 当前生效的作用域 */
export const activeScope = ref<ActiveScope>('scene')

/** 焦点分区（见上） */
export const focusZone = ref<FocusZone>('content')

/** 输入是否被锁定（转场中 / 开机自检中） */
export const inputLocked = ref(false)

/** 切换作用域，返回恢复函数（模态打开/关闭用，避免忘了恢复） */
export function setScope(scope: ActiveScope): () => void {
  const previous = activeScope.value
  activeScope.value = scope
  return () => {
    activeScope.value = previous
  }
}

/** 锁输入，返回解锁函数（配合转场动画时长） */
export function lockInput(): () => void {
  inputLocked.value = true
  return () => {
    inputLocked.value = false
  }
}

/** 设焦点分区 */
export function setFocusZone(zone: FocusZone): void {
  focusZone.value = zone
}

/**
 * 重置到「什么都没打开」的状态。
 * 路由切换时必须调用：否则从一个开着菜单的页面跳走，作用域会停在 pause，
 * 新页面的按键全部石沉大海。P2 的转场层负责在导航时调用它。
 */
export function resetInputState(): void {
  activeScope.value = 'scene'
  focusZone.value = 'content'
  inputLocked.value = false
}

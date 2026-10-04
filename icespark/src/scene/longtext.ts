/**
 * 「长文本编辑」的页面侧接线（`machine/TextEditorDialog.vue` 的控制器）。
 *
 * 为什么抽这一层：同一个弹窗要接两张设置页上好几格「文档型」文本框，
 * 每页都手写一遍「谁在编辑 / 原文是什么 / 关掉后焦点还给谁」既啰嗦又容易漏掉焦点那一句
 * （漏了就是键盘当场失灵，见下面的注释）。
 *
 * 三条约定：
 * 1. **一次只开一个**：`editing` 非空就是「弹窗开着」，页面拿它当 `onPad` 的首行守卫。
 *    守卫必须写在页面自己的监听器里 —— 外壳的 `runPass` 会遍历**全部**同作用域监听器、
 *    不提前退出，弹窗后注册一个也挡不住页面先注册的那个。
 * 2. **不实时写回**：`value` 只是开弹窗那一刻的快照，怎么落库由页面在 `@save` 里决定。
 * 3. **焦点还给原来那一格**：`focusId` 是那一格的 DOM id。弹窗卸载时会 `focusShellRoot()`，
 *    这一句排在它**之后**（`nextTick`）—— 焦点若掉回 `body`，键盘事件就不再冒泡到外壳了。
 */
import { nextTick, ref } from 'vue'

/** 一格「文档型」文本框的自我介绍（单行的名称 / 邮箱之类不配这个弹窗） */
export interface LongTextField {
  /** 字段标识：页面在自己的 `@save` 里靠它决定写回哪儿 */
  key: string
  /** 中文标签（弹窗标题与 `aria-labelledby` 都用它） */
  label: string
  /** 打开那一刻的原文（快照，不实时同步） */
  value: string
  /** 与那一格同一个上限（计数与 `maxlength` 都用它） */
  maxlength?: number
  placeholder?: string
  /** 等宽字体（整段 JSON 用） */
  mono?: boolean
  /** 关掉弹窗后焦点还给谁 —— 那一格输入框的 DOM id */
  focusId?: string
}

export function useLongText() {
  const editing = ref<LongTextField | null>(null)

  /** 打开弹窗（`F2` 与框内右上角那个图标都走这里） */
  function openLongText(field: LongTextField): void {
    editing.value = field
  }

  /** 关闭弹窗；页面若已经写回数据，先写回再调它（`editing` 是唯一的开关） */
  function closeLongText(): void {
    const back = editing.value?.focusId
    editing.value = null
    if (!back) return
    void nextTick(() => {
      document.getElementById(back)?.focus()
    })
  }

  return { editing, openLongText, closeLongText }
}

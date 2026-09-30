<script setup lang="ts">
/**
 * 放大编辑（M 层对话框）：把一格窄输入框里的文本拿到弹窗里写。
 *
 * 为什么需要它（用户反馈）：设置类页面上的文本框宽度都按版面定，
 * 窄列里那一格（`/admin/site` 左列只有 260 来像素）写「站点描述」「关于页正文」
 * 这类长文本，等于在一道缝里改字。这一层给同一份数据换一块大画布，
 * **不新增字段、不改契约、不改数据流** —— 保存时仍旧走那一格原来的写回路径。
 *
 * 三条自己定的规矩（都能从别处找到出处）：
 * 1. **打开期间置 `pageModalOpen`**：页内模态必须拦住外壳的导航键，
 *    否则按 P 会在编辑框上再压一层暂停菜单（§17.8 的单模态口径，来源见 §21 的教训）。
 * 2. **点遮罩不关**：这里可能写着几百字，一次误点就没了 —— 与二次确认框（点了也没损失）
 *    有意不同，只认 ESC / 取消 / 保存三个出口。
 * 3. **卸载时 `focusShellRoot()`**：对话框一卸载，原生焦点会掉回 `body`，
 *    键盘整块失灵（§21 记的那个真 bug）。父页面若要把焦点还给原来那一格，
 *    在 `close` 之后 `nextTick` 里 `.focus()` 即可 —— 它跑在这句之后，是最后一句。
 *
 * 保存语义：**不实时写回**。`draft` 是本地副本，点保存才 emit，
 * ESC 取消即丢弃 —— 这样「改了又后悔」不会污染表单，计数与校验的时机也照旧
 * （页面在 `@save` 里写回时该清的「已保存」反馈照清）。
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

import { focusShellRoot } from '@/input'
import { pageModalOpen } from '@/input/scopes'
import { playSfx } from '@/input/sfx'

const props = withDefaults(
  defineProps<{
    /** 这一格的中文标签（标题与 `aria-labelledby` 都用它） */
    label: string
    /** 打开时的原文 */
    value: string
    /** 多行：ENTER 换行、靠 CTRL/⌘+ENTER 保存；单行：ENTER 即保存 */
    multiline?: boolean
    /** 与那一格同一个上限（`maxlength` 原样搬过来，计数也用它） */
    maxlength?: number
    placeholder?: string
    /** 等宽字体（整段 JSON 用），默认走表单字体 */
    mono?: boolean
    /** 标题下面的一句说明，例如「原本只有 260px 宽」 */
    hint?: string
  }>(),
  { multiline: false, mono: false, maxlength: undefined, placeholder: undefined, hint: '' },
)

const emit = defineEmits<{ save: [value: string]; close: [] }>()

const draft = ref(props.value)
const control = ref<HTMLTextAreaElement | null>(null)
const over = computed(() => props.maxlength !== undefined && draft.value.length >= props.maxlength)
const titleId = 'long-text-title'

function save(): void {
  playSfx('confirm')
  emit('save', draft.value)
}

function cancel(): void {
  // 不发声：`SfxKind` 只有 move / confirm / heart / transition，
  // 样机里那些 `playSfx('cancel')` 本来是取不到配方、被内部 catch 掉的静默调用（见 PostDetailView 注释）
  emit('close')
}

/** ESC 这层由自己收：焦点在文本框里时内核按 `isEditableTarget` 跳过按键，不会有人替我处理 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancel()
    return
  }
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    event.stopPropagation()
    save()
    return
  }
  // 单行模式：ENTER 就是「写完了」（多行模式里 ENTER 是换行，不能抢）
  if (event.key === 'Enter' && !props.multiline) {
    event.preventDefault()
    event.stopPropagation()
    save()
  }
}

/**
 * 兜底：焦点万一飘到遮罩上（点空白处、或从按钮 Tab 出去）也要能收到这两个键。
 *
 * 遮罩上这份监听走**内核之外的普通 DOM 事件** —— 它们在 `pad.ts` 里没有对应动作，
 * 用 `onPad` 反而要多改内核，不划算。
 */
function onMaskKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancel()
  }
}

onMounted(() => {
  pageModalOpen.value = true
  // 光标落在**末尾**而不是全选：这里多半是接着改一段已有的长文本，
  // 全选会让下一次按键直接抹掉原文（比「按到行尾」危险得多）
  void nextTick(() => {
    const el = control.value
    if (!el) return
    el.focus()
    const end = el.value.length
    el.setSelectionRange(end, end)
  })
})

onUnmounted(() => {
  pageModalOpen.value = false
  focusShellRoot()
})

/*
 * 打开期间「背景不响应导航键」这件事**不在这里做**：`dispatchPadAction` 的 `runPass`
 * 会遍历全部同作用域监听器、不提前退出，对话框后注册就挡不住页面上先注册的那个
 * （实测：ESC 会让页面的 `cancel` 分支顺手把焦点推到标签栏）。
 * 所以各页面在自己的 `onPad` 首行写守卫 `if (editing.value) return true` ——
 * 与 `AdminLinksView` 的删除确认框同一写法（`if (delTarget.value) return dialogPad(a)`）。
 */
</script>

<template>
  <div class="lt-mask" data-testid="long-text-mask" @keydown="onMaskKeydown">
    <div
      class="lt-panel"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      data-testid="long-text-dialog"
    >
      <div class="lt-head">
        <h2 :id="titleId" class="lt-title">
          放大编辑 · {{ label }}
        </h2>
        <span class="lt-dither dither-25" aria-hidden="true"></span>
      </div>

      <p v-if="hint" class="lt-hint hint">{{ hint }}</p>

      <textarea
        ref="control"
        v-model="draft"
        class="lt-area"
        :class="{ mono }"
        data-testid="long-text-area"
        spellcheck="false"
        :maxlength="maxlength"
        :placeholder="placeholder"
        :aria-label="`${label}（放大编辑）`"
        @keydown="onKeydown"
      ></textarea>

      <div class="lt-foot">
        <span class="lt-count px" :class="{ over }" data-testid="long-text-count">
          {{ draft.length }}<template v-if="maxlength !== undefined"> / {{ maxlength }}</template> 字
        </span>
        <span class="lt-keys hint">
          {{ multiline ? 'CTRL/⌘ + ENTER 保存 · ENTER 换行 · ESC 取消' : 'ENTER 保存 · ESC 取消' }}
        </span>
      </div>

      <div class="actions">
        <button class="btn" data-testid="long-text-save" type="button" @click="save">
          保存并关闭
        </button>
        <button class="btn ghost" data-testid="long-text-cancel" type="button" @click="cancel">
          取消
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 遮罩：与页内二次确认框同一套（`position: fixed` 才盖得住滚动中的页面） */
.lt-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--veil-deep);
  display: grid;
  place-items: center;
  padding: 24px;
}

.lt-panel {
  width: min(760px, 100%);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--paper);
  border: var(--border-frame) solid var(--edge);
  box-shadow:
    inset 1px 1px 0 0 var(--paper),
    inset -2px -2px 0 0 var(--blue-300);
  padding: 14px 16px 16px;
}

.lt-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lt-title {
  margin: 0;
  font-size: 15px;
  color: var(--blue-700);
}

.lt-dither {
  flex: 1;
  height: 8px;
  border: 2px solid var(--blue-300);
}

.lt-hint {
  margin: 0;
}

/* 主场：这一块就是「大画布」，横向铺满面板、纵向吃掉剩余高度 */
.lt-area {
  flex: 1 1 auto;
  height: 38vh;
  min-height: 180px;
  resize: vertical;
  font: inherit;
  line-height: 1.9;
  color: var(--ink);
  background: var(--paper);
  border: 3px solid var(--blue-400);
  padding: 8px 10px;
}

.lt-area:focus {
  outline: none;
  border-color: var(--blue-500);
  background: var(--blue-100);
}

/* 整段 JSON：等宽，且不换行（结构与缩进才是重点） */
.lt-area.mono {
  font-family: 'ArkPixel', 'JetBrains Mono', 'Noto Sans Mono', monospace;
  font-size: var(--px-sm);
  line-height: 1.7;
  white-space: pre;
  overflow: auto;
}

.lt-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.lt-count {
  color: var(--ink-soft);
}

.lt-count.over {
  color: var(--spark);
}

.lt-keys {
  margin-left: auto;
}

.actions {
  display: flex;
  gap: 10px;
}

/*
 * 按钮样式自己带一份：`.btn` 在本仓是**每个组件各写一遍**的局部类（`PauseMenu` / `LoginDialog`
 * 都这么干），父页面的 scoped 样式够不到子组件内部的元素 —— 少这一份，
 * 「保存并关闭」就是个裸按钮。
 */
.btn {
  font: inherit;
  background: var(--paper);
  border: var(--border-frame) solid var(--blue-400);
  color: var(--blue-700);
  padding: 6px 12px;
  cursor: pointer;
}

.btn.ghost {
  color: var(--ink-soft);
}
</style>

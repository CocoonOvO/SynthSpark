<script setup lang="ts">
/**
 * 长文本编辑弹窗（M 层）：把「文档型」文本框里的内容拿到一块大画布上写。
 *
 * 为什么需要它（用户反馈）：设置页的文本框宽度按版面定，站点描述 / 关于页正文 / 整段 JSON
 * 这类要写几百字的框，在一道缝里改字很别扭。这一层给同一份数据换一块大画布，
 * **不新增字段、不改契约、不改数据流** —— 保存时仍旧走那一格原来的写回路径。
 *
 * 界面口径（用户第二轮反馈后收敛成这样）：
 * · 只有**文档型**文本框才配这个弹窗（单行的名称 / 邮箱不需要），入口是框内右上角一个小图标；
 * · 弹窗本身**只留必要的东西**：一行字段名 + 字数、一块尽可能大的编辑区、两个按钮。
 *   没有说明文字、没有快捷键说明、没有装饰条 —— 键位说明在页脚那一行里已经有了。
 * · 面板固定高度（78vh，上限 680px），编辑区吃掉除标题与按钮外的全部高度。
 *
 * 三条自己定的规矩（都能从别处找到出处）：
 * 1. **打开期间置 `pageModalOpen`**：页内模态必须拦住外壳的导航键，
 *    否则按 P 会在编辑框上再压一层暂停菜单（§17.8 的单模态口径）。
 * 2. **点遮罩不关**：这里可能写着几百字，一次误点就没了 —— 与二次确认框（点了也没损失）
 *    有意不同，只认 ESC / 取消 / 保存三个出口。
 * 3. **卸载时 `focusShellRoot()`**：对话框一卸载，原生焦点会掉回 `body`，
 *    键盘整块失灵（§21 记的那个真 bug）。父页面若要把焦点还给原来那一格，
 *    在 `close` 之后 `nextTick` 里 `.focus()` 即可 —— 它跑在这句之后，是最后一句。
 *
 * 保存语义：**不实时写回**。`draft` 是本地副本，点保存才 emit，ESC 取消即丢弃 ——
 * 这样「改了又后悔」不会污染表单，计数与校验的时机也照旧。
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
    /** 与那一格同一个上限（`maxlength` 原样搬过来，计数也用它） */
    maxlength?: number
    placeholder?: string
    /** 等宽字体（整段 JSON 用），默认走表单字体 */
    mono?: boolean
  }>(),
  { mono: false, maxlength: undefined, placeholder: undefined },
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

/**
 * 面板里只有两个键归自己：`ESC` 取消、`CTRL/⌘ + ENTER` 保存。
 * 焦点在文本框里时内核按 `isEditableTarget` 跳过按键，不会有人替我处理。
 * **单独一个 ENTER 有意不抢**：这一层只服务文档型文本框，换行是它的头号用途。
 */
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
  }
}

/**
 * 兜底：焦点万一飘到遮罩上（点空白处、或从按钮 Tab 出去）也要能收到 ESC。
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
 * 所以各页面在自己的 `onPad` 首行写守卫 `if (editing.value) return longTextPad(a)` ——
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
      :class="{ wide: mono }"
      data-testid="long-text-dialog"
    >
      <div class="lt-head">
        <h2 :id="titleId" class="lt-title">{{ label }}</h2>
        <span class="lt-count px" :class="{ over }" data-testid="long-text-count">
          {{ draft.length }}<template v-if="maxlength !== undefined"> / {{ maxlength }}</template>
        </span>
      </div>

      <textarea
        ref="control"
        v-model="draft"
        class="lt-area"
        :class="{ mono }"
        data-testid="long-text-area"
        spellcheck="false"
        :maxlength="maxlength"
        :placeholder="placeholder"
        :aria-label="`${label}（编辑全文）`"
        @keydown="onKeydown"
      ></textarea>

      <div class="lt-foot">
        <button class="btn" data-testid="long-text-save" type="button" @click="save">保存</button>
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
  padding: 16px;
}

/*
 * 面板固定高度、编辑区吃掉除标题与按钮外的全部高度（「UI 做小、文本框大」）。
 * 高度按视口给但留一圈边，免得整屏被盖住；宽度给两档：整段 JSON 行更长，给它宽一档。
 */
.lt-panel {
  width: min(760px, 100%);
  height: min(70vh, 620px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--paper);
  border: var(--border-frame) solid var(--edge);
  box-shadow:
    inset 1px 1px 0 0 var(--paper),
    inset -2px -2px 0 0 var(--blue-300);
  padding: 10px 12px 12px;
}

.lt-panel.wide {
  width: min(1000px, 100%);
}

/* 标题行：字段名 + 字数，一行了事（说明文字全删了，键位在页脚那一行） */
.lt-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 6px;
  border-bottom: 2px solid var(--blue-200);
}

.lt-title {
  margin: 0;
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-weight: 700;
  font-size: 13px;
  color: var(--blue-700);
}

.lt-count {
  margin-left: auto;
  color: var(--ink-faint);
}

.lt-count.over {
  color: var(--spark);
}

/* 主场：横向铺满、纵向吃掉剩余高度 */
.lt-area {
  flex: 1 1 auto;
  min-height: 0;
  resize: none;
  font: inherit;
  font-size: 14px;
  line-height: 1.8;
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

/* 按钮靠右、小一号：它们是配角，主角是上面那块画布 */
.lt-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/*
 * 按钮样式自己带一份：`.btn` 在本仓是**每个组件各写一遍**的局部类（`PauseMenu` / `LoginDialog`
 * 都这么干），父页面的 scoped 样式够不到子组件内部的元素 —— 少这一份，「保存」就是个裸按钮。
 */
.btn {
  font: inherit;
  font-size: 13px;
  background: var(--paper);
  border: 2px solid var(--blue-400);
  color: var(--blue-700);
  padding: 4px 16px;
  cursor: pointer;
}

.btn.ghost {
  color: var(--ink-soft);
}

.btn:hover,
.btn:focus-visible {
  background: var(--blue-100);
  border-color: var(--blue-500);
  outline: none;
}
</style>

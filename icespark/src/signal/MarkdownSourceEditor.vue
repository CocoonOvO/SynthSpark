<script setup lang="ts">
/**
 * MarkdownSourceEditor：写作页的正文编辑器（P6 · 定稿 E2「Markdown 源码 + 实时预览」）。
 *
 * 为什么不是 WYSIWYG：用户裁定走 E2（架构 §28.5）。一句话理由 —— 这一页的主画面是
 * **一个纯 markdown 文本**，编辑器只要「把光标处的文字改掉」这一件事；
 * 换 ProseMirror 进来要额外装约 10 个包，还要把它那套实色背景 / 光标 / 选区
 * 全部重对齐像素皮（AGENTS.md §7.5 记过那个坑）。预览由 `signal/MarkdownBody.vue`
 * 实时渲染，用的是**阅读页同一个渲染器**，所见即所发。
 *
 * ── 工具条是「插入条」，不是「格式命令」──
 *
 * 旧版那一排按钮发的是 ProseMirror 命令（改富文本节点）。E2 下同一个位置只能变成
 * **往光标处插入 markdown 片段**（`**x**` / `## ` / `> ` / 围栏…），这是形态的必然结果，
 * 已与用户在 §28 二次确认（D9：保留一行插入条）。
 *
 * 「删除线」这颗按钮**曾经被误删过**：当时的理由是「GFM 的 `~~x~~` 需要 markdown-it 打开
 * `strikethrough` 规则，而本项目渲染器用的是默认 preset，删除线没开」。这个前提是**错的** ——
 * markdown-it 的 default preset 本来就开了 `strikethrough`（`gfm-like` 的表格与删除线都在），
 * `signal/MarkdownBody.vue` 的 `PURIFY_TAGS` 里也一直有 `s`。实测 `~~删掉这段~~` 渲染为
 * `<s>删掉这段</s>`，所以按钮已按旧版顺序（粗体 · 斜体 · **删除线** · 行内码…）恢复，
 * 并由 `md-and-pixels.spec.ts` 的渲染门 + `write.spec.ts` 的插入门两边守住。
 * 要恢复这个按钮就得先改 `MarkdownBody`，那是样机已定稿的渲染器（硬要求 1：不许擅自改
 * 既有页面效果）。所以本轮**不做**，把这件事留给用户裁决（已写进 §28.9 交付记录）。
 *
 * ── 键盘 ──
 *
 * - 正文里内核只留两条例外（`input/index.ts` 里 `isEditableTarget` 那一支）：
 *   `ESC` 做**失焦**（焦点交回外壳根节点，菜单留到第二下），`Shift + 字母` 走
 *   `resolveComboAction` 的白名单。所以 `Shift+N` / `Shift+M` / `Shift+V` 在正文里直接就能开面板，
 *   不必先退出正文；其余按键（字母、方向键）仍是浏览器与 textarea 的。
 *   唯一的例外是 `Tab` 本身：它被本组件接过来送进插入条（理由见 `focusToolbar`），
 *   因为原生 Tab 从正文往后走会撞上页面末尾那两个隐藏的文件输入框。
 * - `Ctrl/⌘ + S` 存草稿、`Ctrl/⌘ + Enter` 发布：这两个组合键落在 textarea 上，
 *   内核不管（可编辑目标放行），所以在组件里自己接，并 `preventDefault()` 掉浏览器
 *   自己的「保存网页」对话框。与 §27 的长文本弹窗同一套手感（那边是 Ctrl+Enter 保存）。
 *
 * 图层：本文件在 `src/signal/`，**不得 import `src/machine/`**（独立性门）。工具条按钮
 * 走浏览器原生点击（Tab + Enter），不引输入内核的 `onPad`。
 */
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** markdown 正文 */
    modelValue: string
    /** 占位提示 */
    placeholder?: string
  }>(),
  { placeholder: '在这里写正文……支持 Markdown。' },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  /** Ctrl/⌘ + S：存草稿 */
  (e: 'save'): void
  /** Ctrl/⌘ + Enter：发布 / 更新 */
  (e: 'publish'): void
  /** 「图片」按钮：交给页面去选文件、上传，再回调用 `insertText()` 插进来 */
  (e: 'image'): void
}>()

const area = ref<HTMLTextAreaElement | null>(null)
/** 插入条容器（只为「Tab 出正文」找首格按钮，见 `focusToolbar`） */
const toolbar = ref<HTMLElement | null>(null)

/**
 * 围栏语言清单 —— 与旧版 `PostEditView.vue` 的下拉**逐项一致**（用户裁决 D5：原样保留）。
 * 顺序也照旧版，不改。
 */
const LANGS = [
  ['', '纯文本'],
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['python', 'Python'],
  ['java', 'Java'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['cpp', 'C++'],
  ['c', 'C'],
  ['csharp', 'C#'],
  ['php', 'PHP'],
  ['ruby', 'Ruby'],
  ['swift', 'Swift'],
  ['kotlin', 'Kotlin'],
  ['sql', 'SQL'],
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['json', 'JSON'],
  ['yaml', 'YAML'],
  ['xml', 'XML'],
  ['markdown', 'Markdown'],
  ['bash', 'Bash'],
  ['powershell', 'PowerShell'],
  ['dockerfile', 'Dockerfile'],
  ['lua', 'Lua'],
  ['perl', 'Perl'],
  ['r', 'R'],
  ['scala', 'Scala'],
  ['dart', 'Dart'],
  ['elixir', 'Elixir'],
  ['haskell', 'Haskell'],
  ['clojure', 'Clojure'],
  ['julia', 'Julia'],
  ['vim', 'Vim'],
] as const

/** 当前选中的围栏语言（只作用于「代码块」按钮插入的那一段） */
const lang = ref('')

/* ══════════════ 光标处的文本改写 ══════════════ */

function value(): string {
  return props.modelValue ?? ''
}

/** 写回 + 让 textarea 保持焦点（改完要能接着打字） */
function commit(next: string, selStart: number, selEnd = selStart): void {
  emit('update:modelValue', next)
  const el = area.value
  if (!el) return
  // DOM 的值要等 Vue 把新 value patch 上来才能设选区，所以放在微任务里
  void Promise.resolve().then(() => {
    el.focus()
    el.setSelectionRange(selStart, selEnd)
  })
}

interface Cursor {
  start: number
  end: number
  selected: string
}

function cursor(): Cursor {
  const el = area.value
  const text = value()
  if (!el) return { start: text.length, end: text.length, selected: '' }
  const start = el.selectionStart ?? text.length
  const end = el.selectionEnd ?? start
  return { start, end, selected: text.slice(start, end) }
}

/**
 * 把选区包起来（粗体 / 斜体 / 行内代码 / 链接的方括号部分）。
 * 没选中任何东西时插入占位文字并**选中它** —— 用户接着打字就把它替换掉，
 * 不用先删占位（这是插入条能不能用的关键手感）。
 */
function wrap(before: string, after: string, placeholder: string): void {
  const text = value()
  const { start, end, selected } = cursor()
  const inner = selected || placeholder
  const next = text.slice(0, start) + before + inner + after + text.slice(end)
  commit(next, start + before.length, start + before.length + inner.length)
}

/** 在**当前行行首**加前缀（标题 / 引用 / 列表）；空行补一个占位文字 */
function prefixLine(prefix: string, placeholder: string): void {
  const text = value()
  const { start, end } = cursor()
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const nl = text.indexOf('\n', end)
  const lineEnd = nl === -1 ? text.length : nl
  const line = text.slice(lineStart, lineEnd)
  const body = line || placeholder
  const next = text.slice(0, lineStart) + prefix + body + text.slice(lineEnd)
  const from = lineStart + prefix.length
  commit(next, from, from + body.length)
}

/** 插一段**独立成块**的文本（围栏代码块 / 上传回来的图片），前后补好换行 */
function insertBlock(block: string): void {
  const text = value()
  const { start, end } = cursor()
  const before = text.slice(0, start)
  const lead = before === '' || before.endsWith('\n') ? '' : '\n'
  const next = `${before}${lead}${block}\n${text.slice(end)}`
  const caret = start + lead.length + block.length + 1
  commit(next, caret)
}

/** 行内插入一段（图片语法）：不留块级换行，光标落在语法之后 */
function insertInline(snippet: string): void {
  const text = value()
  const { start, end } = cursor()
  const next = text.slice(0, start) + snippet + text.slice(end)
  commit(next, start + snippet.length)
}

/** 图片按钮 → 交给页面（选文件 + 上传），好了再调 `insertText()` */
function onImage(): void {
  emit('image')
}

/* ══════════════ 围栏语言：光标已经在代码块里就改它，否则只记住给下一次插入用 ══════════════ */

interface Fence {
  /** 开头那行 ``` 的起止偏移（含 info string） */
  openStart: number
  openEnd: number
  /** info string 里现在写的语言 */
  current: string
}

/**
 * 光标是不是落在某个围栏代码块**内部**（含它开头那一行）。
 *
 * 从头顶逐行扫到光标位置，用一个开关记住「现在在不在块里」——
 * 比正则回溯好懂，也不会被正文里的 ``` 误伤（成对才算数）。
 */
function fenceAtCursor(): Fence | null {
  const text = value()
  const el = area.value
  if (!el) return null
  const pos = el.selectionStart ?? 0

  let offset = 0
  let open: Fence | null = null
  for (const line of text.split('\n')) {
    const lineStart = offset
    const lineEnd = offset + line.length
    if (line.trimStart().startsWith('```')) {
      if (open) {
        open = null
      } else {
        open = { openStart: lineStart, openEnd: lineEnd, current: line.trim().slice(3).trim() }
      }
    }
    if (pos >= lineStart && pos <= lineEnd) return open
    offset = lineEnd + 1
  }
  return null
}

/**
 * 换语言。旧版是「改当前代码块的语言」，E2 下同样保留这个语义：
 * 光标在块里 → 改那个块开头那一行；不在块里 → 只记住，下次点「代码块」时用它。
 */
function changeLang(next: string): void {
  lang.value = next
  const text = value()
  const fence = fenceAtCursor()
  if (!fence) return
  const line = `\`\`\`${next}`.trimEnd()
  const after = text.slice(0, fence.openStart) + line + text.slice(fence.openEnd)
  const delta = line.length - (fence.openEnd - fence.openStart)
  const el = area.value
  const caret = (el?.selectionStart ?? fence.openEnd) + delta
  commit(after, caret)
}

/** 「代码块」按钮：插一段三引号围栏，用当前选中的语言 */
function insertFence(): void {
  insertBlock(`\`\`\`${lang.value}\n代码\n\`\`\``)
}

/* ══════════════ 记法按钮 ══════════════ */

const TOOLS = [
  { id: 'bold', label: '粗体', title: '粗体 **文字**', run: () => wrap('**', '**', '粗体') },
  { id: 'italic', label: '斜体', title: '斜体 *文字*', run: () => wrap('*', '*', '斜体') },
  { id: 'strike', label: '删除线', title: '删除线 ~~文字~~', run: () => wrap('~~', '~~', '删除线') },
  { id: 'code', label: '行内码', title: '行内代码 `文字`', run: () => wrap('`', '`', 'code') },
  { id: 'h2', label: '标题', title: '二级标题 ## ', run: () => prefixLine('## ', '标题') },
  { id: 'quote', label: '引用', title: '引用 > ', run: () => prefixLine('> ', '引用') },
  { id: 'ul', label: '无序', title: '无序列表 - ', run: () => prefixLine('- ', '列表项') },
  { id: 'ol', label: '有序', title: '有序列表 1. ', run: () => prefixLine('1. ', '列表项') },
  { id: 'link', label: '链接', title: '链接 [文字](url)', run: () => wrap('[', '](https://)', '链接文字') },
] as const

/* ══════════════ 键盘：textarea 上的两个组合键 + Tab 出正文 ══════════════ */

/**
 * Tab 从正文里出去，落到插入条的第一颗按钮上。
 *
 * 为什么这一段要自己接（而不是交给浏览器原生遍历）：插入条在**正文上方**，
 * 而 DOM 里它排在正文**前面** —— 原生 Tab 只会往后走，永远够不到它。
 * 于是正文里的 Tab 会落到页面末尾那两个隐藏的文件输入框上（不可见的焦点停靠点，
 * 看起来就是"Tab 坏了"）。这里把它接过来，明确送到插入条首格：
 *
 *   正文 --Tab--> 插入条（在插入条内部继续 Tab 会原生走到正文，形成一个小环）
 *   正文 --Shift+Tab--> 交给浏览器，一路向后退出编辑区（→ 标题 → 动作条）
 *
 * 这个小环有意闭在编辑区里：插入条上的按钮**不是可编辑目标**，输入内核照常派发按键，
 * 所以「Tab 出正文 → 按 N / M 开面板」这条路才立得住（键位提示写的就是这件事）。
 */
function focusToolbar(): void {
  toolbar.value?.querySelector<HTMLElement>('button')?.focus()
}

function onKeydown(event: KeyboardEvent): void {
  // Tab（不带 Shift）出正文，落到插入条首格（理由见 focusToolbar 上面那段）
  if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault()
    focusToolbar()
    return
  }

  const mod = event.ctrlKey || event.metaKey
  if (!mod) return
  const key = event.key.toLowerCase()
  if (key === 's') {
    // 不拦的话浏览器会弹「保存网页」对话框，正文一个字都存不下来
    event.preventDefault()
    emit('save')
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('publish')
  }
}

/* 页面（上传完图片）需要往光标处塞一段 markdown —— 只暴露这一件事 */
defineExpose({
  insertText: insertInline,
  focus: () => area.value?.focus(),
})
</script>

<template>
  <div class="md-source">
    <!-- 插入条：一行，横向可滚（窄屏不换行，免得把正文高度挤掉） -->
    <div ref="toolbar" class="md-tool px" role="toolbar" aria-label="插入 Markdown 记法">
      <button
        v-for="t in TOOLS"
        :key="t.id"
        type="button"
        class="tool-btn"
        :title="t.title"
        :aria-label="t.title"
        :data-tool="t.id"
        @mousedown.prevent
        @click="t.run()"
      >
        {{ t.label }}
      </button>

      <span class="tool-gap" aria-hidden="true"></span>

      <label class="tool-lang">
        <span class="sr-only">代码块语言</span>
        <select
          class="lang-select"
          :value="lang"
          data-testid="write-lang"
          title="代码块语言（光标在代码块里时改的是那一段）"
          @change="changeLang(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="[value, text] in LANGS" :key="value" :value="value">{{ text }}</option>
        </select>
      </label>

      <button
        type="button"
        class="tool-btn"
        title="代码块 ```lang"
        aria-label="代码块"
        data-tool="fence"
        @mousedown.prevent
        @click="insertFence()"
      >
        代码块
      </button>

      <button
        type="button"
        class="tool-btn"
        title="上传图片并插入 ![](url)"
        aria-label="插入图片"
        data-tool="image"
        @mousedown.prevent
        @click="onImage()"
      >
        图片
      </button>
    </div>

    <!--
      正文。`spellcheck=false`：像素皮下面那些红色波浪线非常吵，而且这是中文正文。
      这里的 `TAB` 被组件接去插入条（`onKeydown`），真正的「离开正文」两条路是
      `ESC`（内核把焦点交回外壳）与插入条上的 Tab —— 出去之后 N / M / V 才响；
      在正文里想直接开面板就用 `Shift+N / Shift+M / Shift+V`（组件头部注释写了这件事）。
    -->
    <textarea
      ref="area"
      class="md-area read"
      data-testid="write-content"
      :value="modelValue"
      :placeholder="placeholder"
      spellcheck="false"
      aria-label="正文 Markdown"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      @keydown="onKeydown"
    ></textarea>
  </div>
</template>

<style scoped>
.md-source {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  border: 3px solid var(--blue-300);
  background: var(--paper);
}

.md-tool {
  display: flex;
  align-items: center;
  /* gap / padding 都收紧一档：宽屏左右分屏时源码列只有半个屏（1280 下约 587px），
     原先 4px 间隙 + 7px 内边距正好多出 26px，把最后一颗「图片」切掉半个字，
     还带出一条 12px 的横向滚动条。收紧后 1280 能完整放下，更窄的视口才需要横滚。 */
  gap: 3px;
  padding: 6px 7px;
  border-bottom: 3px solid var(--blue-300);
  background: var(--blue-100);
  overflow-x: auto;
  flex: 0 0 auto;
}

.tool-btn {
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  background: var(--paper);
  color: var(--blue-700);
  border: 2px solid var(--blue-400);
  padding: 2px 5px;
  cursor: pointer;
}

.tool-btn:hover {
  background: var(--blue-200);
}

.tool-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 分隔：编辑记法与代码块/图片之间留一道竖线 */
.tool-gap {
  flex: 0 0 auto;
  width: 2px;
  align-self: stretch;
  margin: 2px 3px;
  background: var(--blue-300);
}

.tool-lang {
  flex: 0 0 auto;
}

.lang-select {
  font: inherit;
  font-size: 12px;
  background: var(--paper);
  color: var(--blue-700);
  border: 2px solid var(--blue-400);
  padding: 2px 4px;
  max-width: 130px;
}

.md-area {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  resize: none;
  border: 0;
  outline: none;
  background: var(--paper);
  color: var(--ink);
  padding: 14px 16px;
  font-family: 'ArkPixel', 'Noto Sans Mono', monospace;
  font-size: 13px;
  line-height: 2;
  tab-size: 2;
}

.md-area::placeholder {
  color: var(--ink-faint);
}

/* 视觉隐藏（只给屏幕阅读器），与 .px 像素字体无关 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>

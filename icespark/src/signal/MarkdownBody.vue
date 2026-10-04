<script setup lang="ts">
/**
 * Markdown 正文渲染器 —— 照搬样机 `ui/MarkdownBody.vue`。
 *
 * 渲染策略：「像素是外壳，文档是本体」（用户确认的皮肤式方案）
 * - 标题 / 标签 / 表格 / 代码块 → 像素字体，保留机器感
 * - 正文段落 → 中文黑体 + 舒展行距，长文可读性优先
 *   像素字体只用于「结构性文字」，绝不用于大段正文
 *
 * 链接（第六轮补齐）：
 * - 渲染出的链接挂 `.focusable`，好让原生 Tab 焦点吃到全站唯一那套 8bit 光标
 * - 站内链接（`/` 开头）接管成前端路由跳转，不再整页刷新；
 *   外链原样交给浏览器。演示参数 `?demo=1` 会被沿用，否则点一篇
 *   正文里的链接就掉回实时数据，前后不一致。
 *
 * 安全：markdown-it 以 html:false 渲染，原始 HTML 被转义；
 * 链接协议由 markdown-it 默认的 validateLink 过滤（javascript: / vbscript: 等一律拒绝）。
 * 生产版会再叠一层 DOMPurify（见 design/icespark-ARCHITECTURE.md）。
 */
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import '@/styles/highlight.css'
import { highlightCodeBlocks } from '@/signal/highlight'

const props = defineProps<{ source: string }>()

const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false })

// 正文链接挂上 .focusable：文章详情页的 Tab 交还给浏览器（按 DOM 顺序遍历），
// 原生焦点要能吃到全站唯一那套 8bit 焦点视觉（见 styles/pixel.css）。
// 注意 link_open 默认没有规则（默认渲染走 renderToken），所以给 self.renderToken 加类。
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx]!.attrJoin('class', 'focusable')
  return self.renderToken(tokens, idx, options)
}

// 代码块外包一层容器：给「语言标签」一个安身之处，同时方便单独处理横向滚动
const baseFence = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const lang = (tokens[idx]!.info || '')
    .trim()
    .split(/\s+/)[0]!
    .replace(/[^a-zA-Z0-9+#._-]/g, '')
  const inner = baseFence(tokens, idx, options, env, self)
  return `<div class="md-fence"${lang ? ` data-lang="${lang}"` : ''}>${inner}</div>`
}

// markdown-it 的原始产出（未清洗）。清洗放在 v-html 调用处：clean(rendered)。
const rendered = computed(() => md.render(props.source || ''))

/**
 * 代码高亮：**渲染之后再染色**（用户裁决 §59）。
 *
 * 为什么不接进 markdown-it 的 `highlight` 选项：那样高亮产物要穿过 DOMPurify，
 * 就得把 `span` 加进白名单（每一行都要能说清出处的那个表）；这里改在清洗**之后**
 * 对 DOM 后处理，白名单一个字都不用动。
 *
 * 为什么用 `watch + nextTick`：`v-html` 换内容之后才谈得上染色；高亮库是**延迟加载**的
 * （`signal/highlight.ts` 里动态 import），所以正文先照常显示，颜色随后补上。
 * 没有代码块时那一步会直接返回，库根本不会下载。
 */
const bodyEl = ref<HTMLElement | null>(null)

watch(
  // 观察**渲染结果**而不是 `clean(...)`：getter 里一旦调用 `clean()`，
  // `immediate: true` 会在 setup 期间就跑到它，而它引用的 `PURIFY_TAGS` 是文件后面
  // 才声明的 `const` —— 当场 TDZ 报错、整个组件渲染不出来（本门踩过一次）。
  rendered,
  async () => {
    await nextTick()
    const el = bodyEl.value
    if (el) void highlightCodeBlocks(el)
  },
  { immediate: true },
)

/**
 * 安全：生产版在样机之上**唯一**的增强，就是这一层 DOMPurify。
 *
 * 为什么两道都要（只留一道都不够）：
 * 1) markdown-it 的 `html: false` 是第一道：它把作者写的原始 HTML **转义成文本**，
 *    并把 `javascript:` / `vbscript:` / `file:` 这类协议的链接直接判为无效（不成链接）——
 *    这一道管的是「markdown 解析期」，而且它只是一份**配置**：将来谁把 `html` 打开、
 *    或换掉 `validateLink`，这一道就没了，且不会有任何报错。
 * 2) DOMPurify 是第二道：它管的是「字符串交给 v-html 之前」。v-html 会把字符串当真实
 *    HTML 解析，`onerror` / `<script>` 这类东西一旦漏过去就是一次 XSS。而正文来自后端
 *    （文章 content、关于页 MD），属于**外部内容**，不能假定它是干净的。
 *    DOMPurify 只看最终 HTML 串，对任何来源一律按白名单裁一遍 —— 纵深防御，
 *    不依赖上游配置永远不变。
 * 两道都过之后，v-html 拿到的只可能是「本渲染器白名单内」的结构。
 *
 * 白名单只列本渲染器（`html:false` + 上面两条自定义规则）**实际会产出**的标签：
 * 实测把所有 markdown 语法喂一遍统计得到 —— 标题 h1-h6、段落 p、换行 br、分隔线 hr、
 * 强调 strong/em/s、代码 code/pre、引用 blockquote、列表 ul/ol/li、链接 a、图片 img、
 * 表格 table/thead/tbody/tr/th/td，以及代码块外包容器 div。
 * 用白名单而不是黑名单：漏一个标签最坏是少显示一点，而黑名单漏一个（`<svg onload>`）
 * 就是一个可执行入口。
 *
 * ⚠️ 加代码高亮（highlight.js，架构 §10.6）时必须同时把 `span` 加进这份白名单：
 * 它的产物是 `<span class="hljs-…">`，不在白名单里会被 DOMPurify **静默剥掉**，
 * 表现为「高亮代码块只剩纯文本、却什么错也不报」。
 */
const PURIFY_TAGS = [
  'a',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
]

/**
 * 属性白名单，每一项都能说清出处：
 * - `href` / `title`：链接（`link_open` 产出 title＝`[x](url "标题")`）
 * - `src` / `alt` / `title`：图片
 * - `class`：链接上的 `.focusable`（原生 Tab 焦点视觉）与代码块的 `language-xx`
 * - `data-lang`：代码块容器上的语言铭牌，样式靠 `attr(data-lang)` 取它，
 *   不放行的话语言标签会静默消失
 * - `style`：表格对齐 —— markdown-it 对带 `:---` / `:--:` 的表格会在 th/td 上写
 *   `style="text-align:…"`，不放行则表格对齐失效，与样机渲染不一致。
 *   注意：DOMPurify 把 `style` 当「URI 安全属性」整值放行（它不解析 CSS 内容），
 *   但上游 `html: false` 拿不到作者写的 style，能到这里的 style 只有上面那三种
 *   表格对齐值，所以这一项在本链路上没有可达的注入面。
 * - `start`：有序列表从非 1 开始时 markdown-it 会写 `start`
 */
const PURIFY_ATTR = ['href', 'title', 'alt', 'src', 'class', 'data-lang', 'style', 'start']

/**
 * 清洗：markdown-it 的输出按白名单过一遍再交给 v-html。
 * - 不设 `ALLOW_UNKNOWN_PROTOCOLS`：DOMPurify 默认只放 http(s) / mailto / tel 等安全协议，
 *   站内相对链接（`/posts/x`）照常通过，`img` 的 `data:image/*` 也按它自己的规则放行。
 * - 关掉 `ALLOW_DATA_ATTR` / `ALLOW_ARIA_ATTR`：这两类是**整类默认放行**的，
 *   而本渲染器一个都不产出（`data-lang` 已在上面显式列出），所以关掉 —— 白名单只要「恰好够用」。
 */
function clean(raw: string): string {
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: PURIFY_TAGS,
    ALLOWED_ATTR: PURIFY_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  })
}

const router = useRouter()

/**
 * 站内链接走前端路由（不整页刷新）。
 * 只在链接确实指向站内时接管：`/` 开头且不是 `//`（协议相对 = 站外）。
 */
function onBodyClick(e: MouseEvent) {
  // 新窗口 / 新标签的意图（中键、Ctrl、Cmd、Shift）一律不拦
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return
  const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!a) return
  const href = a.getAttribute('href') || ''
  if (!href.startsWith('/') || href.startsWith('//')) return

  e.preventDefault()
  const url = new URL(href, window.location.origin)
  // 样机原话：「站内跳转沿用当前的演示参数，免得正文链接把评审者从样张数据踢回实时数据」。
  // 生产版没有 `?demo=1` 这个开关（架构 §16.2 不迁样张），所以这两行在这里**不可达** ——
  // 保留是为了与样机逐字一致；真要清掉，删这两行即可，行为不变。
  const demo = new URL(window.location.href).searchParams.get('demo')
  if (demo && !url.searchParams.has('demo')) url.searchParams.set('demo', demo)
  void router.push(url.pathname + url.search + url.hash)
}
</script>

<template>
  <div
    ref="bodyEl"
    class="md-body"
    data-testid="md-body"
    v-html="clean(rendered)"
    @click="onBodyClick"
  />
</template>

<style scoped>
.md-body {
  /* 宽度自适应：跟随容器，只设上限，不写死像素宽度（用户反馈第 5 条） */
  width: 100%;
  color: var(--ink);
}

.md-body :deep(h1),
.md-body :deep(h2),
.md-body :deep(h3),
.md-body :deep(h4) {
  font-family: 'ArkPixel', 'Noto Sans Mono', monospace;
  font-weight: 400;
  line-height: 1.5;
  color: var(--blue-700);
  margin: 30px 0 12px;
}

.md-body :deep(h1) {
  font-size: 24px;
}

.md-body :deep(h2) {
  font-size: 24px;
  border-bottom: 3px solid var(--blue-200);
  padding-bottom: 6px;
}

.md-body :deep(h3) {
  font-size: 12px;
  color: var(--blue-600);
}

/* 段首加一个像素方点，替代首行缩进 —— 8bit 的分段记号 */
.md-body :deep(p) {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 16.5px;
  line-height: 1.95;
  margin: 0 0 18px;
}

.md-body :deep(strong) {
  color: var(--blue-700);
  font-weight: 700;
}

.md-body :deep(a) {
  color: var(--blue-600);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.md-body :deep(a:hover) {
  background: var(--blue-200);
}

.md-body :deep(ul),
.md-body :deep(ol) {
  font-family: 'Source Han Sans CN', 'Noto Sans CJK SC', sans-serif;
  font-size: 16px;
  line-height: 1.95;
  margin: 0 0 18px;
  padding-left: 4px;
  list-style: none;
}

.md-body :deep(li) {
  position: relative;
  padding-left: 20px;
  margin-bottom: 6px;
}

/* 列表符号：8px 实心方块，与全站点阵语言一致 */
.md-body :deep(li)::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 0.72em;
  width: 8px;
  height: 8px;
  background: var(--blue-400);
}

.md-body :deep(ol) {
  counter-reset: md-ol;
}

.md-body :deep(ol > li) {
  counter-increment: md-ol;
}

.md-body :deep(ol > li)::before {
  content: counter(md-ol, decimal-leading-zero);
  background: none;
  width: auto;
  height: auto;
  top: 0;
  left: 0;
  color: var(--blue-500);
  font-family: 'ArkPixel', monospace;
  font-size: 12px;
  line-height: 2.6;
}

.md-body :deep(blockquote) {
  margin: 20px 0;
  padding: 12px 16px;
  border-left: 8px solid var(--blue-400);
  background: var(--blue-100);
  color: var(--ink-soft);
}

.md-body :deep(blockquote p:last-child) {
  margin: 0;
}

/* 行内代码：像素字体 + 浅蓝块 */
.md-body :deep(code) {
  font-family: 'ArkPixel', 'Noto Sans Mono', monospace;
  font-size: 12px;
  background: var(--blue-100);
  border: 1.5px solid var(--blue-200);
  padding: 1px 5px;
  color: var(--blue-700);
}

.md-body :deep(.md-fence) {
  position: relative;
  margin: 22px 0;
}

.md-body :deep(.md-fence pre) {
  margin: 0;
  padding: 16px;
  background: var(--blue-100);
  border: 3px solid var(--blue-400);
  overflow-x: auto;
}

.md-body :deep(.md-fence code) {
  background: none;
  border: 0;
  padding: 0;
  font-size: 12px;
  line-height: 2;
  color: var(--ink);
  white-space: pre;
}

/* 语言标签：贴在代码块右上角的机器铭牌 */
.md-body :deep(.md-fence[data-lang])::after {
  content: attr(data-lang);
  position: absolute;
  top: -1px;
  right: -1px;
  padding: 2px 8px;
  background: var(--blue-400);
  color: var(--paper);
  font-family: 'ArkPixel', monospace;
  font-size: 12px;
}

.md-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 22px 0;
  font-family: 'ArkPixel', monospace;
  font-size: 12px;
}

.md-body :deep(th),
.md-body :deep(td) {
  border: 2px solid var(--blue-300);
  padding: 7px 10px;
  text-align: left;
}

.md-body :deep(th) {
  background: var(--blue-200);
  color: var(--blue-700);
}

.md-body :deep(tr:nth-child(even) td) {
  background: var(--blue-100);
}

.md-body :deep(hr) {
  border: 0;
  border-top: 3px solid var(--blue-200);
  margin: 26px 0;
}

/* 正文插图同样走像素画框 */
.md-body :deep(img) {
  display: block;
  max-width: 100%;
  border: 3px solid var(--edge);
  image-rendering: pixelated;
  background: var(--blue-100);
}
</style>

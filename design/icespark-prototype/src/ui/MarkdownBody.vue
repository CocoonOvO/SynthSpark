<script setup lang="ts">
/**
 * Markdown 正文渲染器
 *
 * 渲染策略：「像素是外壳，文档是本体」（用户确认的皮肤式方案）
 * - 标题 / 标签 / 表格 / 代码块 → 像素字体，保留机器感
 * - 正文段落 → 中文黑体 + 舒展行距，长文可读性优先
 *   像素字体只用于「结构性文字」，绝不用于大段正文
 *
 * 安全：markdown-it 以 html:false 渲染，原始 HTML 被转义；
 * 链接协议由 markdown-it 默认的 validateLink 过滤（javascript: / vbscript: 等一律拒绝）。
 * 生产版会再叠一层 DOMPurify（见 design/icespark-ARCHITECTURE.md）。
 */
import MarkdownIt from 'markdown-it'
import { computed } from 'vue'

const props = defineProps<{ source: string }>()

const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false })

// 代码块外包一层容器：给「语言标签」一个安身之处，同时方便单独处理横向滚动
const baseFence = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const lang = (tokens[idx].info || '').trim().split(/\s+/)[0].replace(/[^a-zA-Z0-9+#._-]/g, '')
  const inner = baseFence(tokens, idx, options, env, self)
  return `<div class="md-fence"${lang ? ` data-lang="${lang}"` : ''}>${inner}</div>`
}

const html = computed(() => md.render(props.source || ''))
</script>

<template>
  <div class="md-body" data-testid="md-body" v-html="html" />
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

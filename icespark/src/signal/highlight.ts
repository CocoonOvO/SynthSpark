import type { HLJSApi } from 'highlight.js'

/**
 * **代码高亮**（用户 2026-10-01 裁决「装吧」）—— 只做一件事：把已经渲染好的正文里的
 * 代码块染色，**在清洗之后**做。
 *
 * 三个刻意的设计决定：
 *
 * 1. **后处理 DOM，不改 markdown-it 的渲染链。** 走 markdown-it 的 `highlight` 选项意味着
 *    高亮产物要穿过 DOMPurify —— 那就得把 `span` 放进白名单，而白名单每一行都要能说清出处
 *    （见 `MarkdownBody.vue` 的注释）。这里改在**清洗之后**动手：输入是我们自己刚写进 DOM 的
 *    `textContent`（已清洗的纯文本），输出由 highlight.js 自己转义，既不动白名单，
 *    也不影响「markdown 渲染门」原有的断言。
 * 2. **延迟加载，而且真有代码块才加载。** 高亮库单独一个 chunk；正文先照常渲染
 *    （纯文本也完全可读），等它到了再把颜色补上 —— 首屏与性能预算都不受牵连。
 * 3. **语言清单与编辑器下拉一致**（`MarkdownSourceEditor.vue` 的 `LANGS`，用户裁决 D5 原样保留），
 *    外加 `bash`/`sh`（写脚本的文章常这么标）。清单外的语言不染色，但代码照旧显示。
 */

/**
 * 语言加载器表 —— **每一项的模块说明符都必须是字面量**：Vite 没法静态分析
 * 「用模板串拼出来的动态导入」，那样写浏览器会拿到裸模块名并报
 * `Failed to resolve module specifier`（实测踩过）。表里每一项都是静态写法，
 * Vite 会给每种语言切一个懒加载 chunk —— 于是"只把正文里真的出现的语言拉下来"
 * 这件事是**真的**（一篇文章通常也就一两种语言）。
 *
 * 注意：这段注释里刻意不写导入语句的示例字面量 —— 独立性门的扫描会把注释里的
 * 导入写法也当成真依赖（本文件踩过一次），要举例就用文字描述。
 */
type LanguageModule = { default: unknown }

const LOADERS: Record<string, () => Promise<LanguageModule>> = {
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  python: () => import('highlight.js/lib/languages/python'),
  java: () => import('highlight.js/lib/languages/java'),
  go: () => import('highlight.js/lib/languages/go'),
  rust: () => import('highlight.js/lib/languages/rust'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  c: () => import('highlight.js/lib/languages/c'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  php: () => import('highlight.js/lib/languages/php'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  swift: () => import('highlight.js/lib/languages/swift'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  sql: () => import('highlight.js/lib/languages/sql'),
  html: () => import('highlight.js/lib/languages/xml'),
  xml: () => import('highlight.js/lib/languages/xml'),
  css: () => import('highlight.js/lib/languages/css'),
  json: () => import('highlight.js/lib/languages/json'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  bash: () => import('highlight.js/lib/languages/bash'),
  shell: () => import('highlight.js/lib/languages/shell'),
}

/** 语言别名：围栏里写 `js` / `ts` / `sh` 这些短写也要认 */
const ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'cpp',
  'c#': 'csharp',
}

let corePromise: Promise<{ hljs: HLJSApi; registered: Set<string> } | null> | null = null
const registered = new Set<string>()

/**
 * 拿到 highlight.js 核心（只加载一次），并把**这一篇里用到的语言**注册进去。
 * 失败返回 null：高亮只是锦上添花，库加载失败绝不能让正文变得不可读。
 */
async function instance(
  needed: string[],
): Promise<{ hljs: HLJSApi; registered: Set<string> } | null> {
  if (!corePromise) {
    corePromise = (async () => {
      try {
        const core = await import('highlight.js/lib/core')
        registered.add('plaintext')
        core.default.registerLanguage('plaintext', (await import('highlight.js/lib/languages/plaintext')).default as never)
        return { hljs: core.default, registered }
      } catch {
        return null
      }
    })()
  }
  const ready = await corePromise
  if (!ready) return null

  await Promise.all(
    needed.map(async (lang) => {
      const loader = LOADERS[lang]
      if (!loader || ready.registered.has(lang)) return
      try {
        const mod = await loader()
        ready.hljs.registerLanguage(lang, mod.default as never)
        ready.registered.add(lang)
      } catch {
        // 这一种语言没拿到就跳过它（其余语言照常染色）
      }
    }),
  )
  return ready
}

/** 围栏上写的语言名归一化（小写 + 别名） */
function normalizeLang(raw: string): string {
  const lower = raw.trim().toLowerCase()
  return ALIASES[lower] ?? lower
}

/**
 * 把根节点里所有代码块染上色（**幂等**：已经染过的跳过）。
 *
 * 只认 `.md-fence pre > code`：那是 `MarkdownBody.vue` 给围栏代码块包的结构，
 * 行内代码（`<code>` 不带围栏）不碰。
 */
export async function highlightCodeBlocks(root: HTMLElement): Promise<void> {
  const blocks = [...root.querySelectorAll<HTMLElement>('.md-fence pre > code')].filter(
    (code) => code.dataset.highlighted !== 'yes',
  )
  if (blocks.length === 0) return // 没有代码块就**不加载**高亮库

  // 先看这一篇里到底用了哪些语言，再只把它们拉下来
  const langs = new Map<HTMLElement, string>()
  for (const code of blocks) {
    const raw =
      code.closest('.md-fence')?.getAttribute('data-lang') ??
      /(?:^|\s)language-([\w+#.-]+)/.exec(code.className)?.[1] ??
      ''
    const lang = normalizeLang(raw)
    if (lang && LOADERS[lang]) langs.set(code, lang)
  }
  if (langs.size === 0) return // 全是清单外的语言：不加载库、照旧显示纯文本

  const ready = await instance([...new Set(langs.values())])
  if (!ready) return

  for (const [code, lang] of langs) {
    if (!ready.hljs.getLanguage(lang)) continue
    try {
      const source = code.textContent ?? ''
      code.innerHTML = ready.hljs.highlight(source, { language: lang, ignoreIllegals: true }).value
      code.dataset.highlighted = 'yes'
    } catch {
      // 单块失败就留着纯文本 —— 不许因为一块代码把整篇正文搞崩
    }
  }
}

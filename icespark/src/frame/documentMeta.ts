import { onUnmounted, ref, watchEffect } from 'vue'

/**
 * **浏览器标题与页面描述**（`<title>` / `<meta name="description">`）。
 *
 * 口径（用户 2026-10-01 裁决）：
 * - 标题拼成 **`页面名 · 站点名`**，两段都来自**配置**而不是写死 ——
 *   站点名读三级合并后的 `site.name`（后台可改），页面名默认取路由 `meta.title`
 *   （`router/routes.ts` 里那张表，此前是**没人消费的死数据**）。
 * - 有些名字**打开才知道**（文章标题、用户显示名），这类页面用 `usePageTitle()`
 *   在自己的数据到位后覆盖页面名；组件卸载即自动让位，不会把上一个页面的名字留在标签页上。
 * - 页面描述统一取 `site.description`（同样来自配置）。**没做** JSON-LD 与 sitemap：
 *   前者要部署域名，后者属服务端（用户裁决：sitemap 将来交给后端）。
 *
 * 为什么要有独立文件：App.vue 只管「把算好的值写进 `<head>`」，
 * 拼接规则在这里，可以单独跑单测（`src/frame/__tests__/documentMeta.spec.ts`）。
 */

/** 拼接规则：缺哪边就只留另一边，两边都空给空串（绝不留下孤零零的分隔符） */
export function composeTitle(pageName: string | null | undefined, siteName: string): string {
  const page = (pageName ?? '').trim()
  const site = (siteName ?? '').trim()
  if (page && site) return `${page} · ${site}`
  return page || site
}

/**
 * 页面级标题覆盖（`null` = 不覆盖，用路由那张表）。
 *
 * 用模块级 ref 而不是 provide/inject：标题是**全站唯一一份**的文档级状态，
 * 页面之间不可能并发设置（同一时刻只有一个场景在屏上）。
 */
const override = ref<string | null>(null)

/** 当前生效的页面名（`App.vue` 读它；算标题的活儿也在这里） */
export function pageTitleOverride(): string | null {
  return override.value
}

/** 给「打开才知道名字」的页面用：传一个取名字的函数，数据到位自动跟上、卸载自动让位 */
export function usePageTitle(source: () => string | null | undefined): void {
  watchEffect(() => {
    const name = source()
    override.value = name && name.trim() !== '' ? name : null
  })
  onUnmounted(() => {
    override.value = null
  })
}

/**
 * 把标题与描述写进 `<head>`（描述只在有值时写，避免把空描述挂上去）。
 *
 * `meta[name=description]` 不存在就建一个 —— `index.html` 里刻意没写死它，
 * 因为描述是配置项，写死在静态模板里就绕过了三级合并。
 */
export function applyDocumentMeta(doc: Document, title: string, description: string): void {
  if (doc.title !== title) doc.title = title

  const meta =
    doc.querySelector('meta[name="description"]') ??
    (() => {
      const created = doc.createElement('meta')
      created.setAttribute('name', 'description')
      doc.head.appendChild(created)
      return created
    })()

  const text = (description ?? '').trim()
  if (text !== '' && meta.getAttribute('content') !== text) meta.setAttribute('content', text)
}

/**
 * 格式化助手（架构 §16.2 冻结接口）：`shortDate` / `shortNum` / `postKey`，行为与样机一致。
 *
 * 为什么放在 api/ 下：三个函数的入参都直接来自接口字段（日期戳、统计条数字、文章 URL 标识），
 * 而且都被三个以上页面用到，散在各页面里迟早会长出三种写法。
 *
 * `postKey` 原先写在 `api/search.ts`，本轮按 §16.2 搬到这一处（只留一份实现）；
 * search.ts 改成从这里转出，`machine/PauseMenu.vue` 的既有 import 不受影响。
 */

/**
 * 文章在 URL 里的标识：优先 slug（可读、可分享），没有才退回 id。
 * 列表页、搜索命中、文章页互相跳转都必须用它，否则同一个标题会有两种地址。
 */
export function postKey(p: { id: string; slug?: string | null }): string {
  return p.slug || p.id
}

/** 日期短格式 */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`
}

/** 大数字的短表达，用于统计条 */
export function shortNum(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

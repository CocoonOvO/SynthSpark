/**
 * 封面状态：一张卡片该走「有封面」还是「无封面」版式
 *
 * 为什么要单独一处：`cover_image` 有值不等于图出得来 —— 上传文件 404 时字段是满的、图是空的。
 * 缺图要换版式（文字卡），所以「字段有值」和「图真的加载成功」必须合成一个判断，
 * 并且列表页、首页、文章页三个地方要用同一套判断，否则同一条数据在不同页面上会变成两种形态。
 */
import { ref } from 'vue'
import { shortDate } from '../data/api'

/** 加载失败的封面 URL。模块级：同一条坏链接不必每个组件各失败一次 */
const failedCovers = ref<Set<string>>(new Set())

/** 这张卡片有可用封面吗（没有就该走无封面版式） */
export function coverOk(url?: string | null): boolean {
  return !!url && !failedCovers.value.has(url)
}

/** <img> 报错时调用：记下来，下一次渲染就换版式 */
export function markCoverFailed(url?: string | null) {
  if (!url) return
  const next = new Set(failedCovers.value)
  next.add(url)
  failedCovers.value = next
}

/** 文字卡的日期戳：把 2026.09.18 拆成「年 / 月 / 日」三块，日字号最大、当图形用 */
export function stampParts(iso?: string | null): { y: string; m: string; d: string } {
  const [y = '', m = '', d = ''] = shortDate(iso || '').split('.')
  return { y, m, d }
}

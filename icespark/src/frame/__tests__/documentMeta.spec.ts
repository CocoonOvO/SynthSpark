import { describe, expect, it } from 'vitest'

import { composeTitle } from '../documentMeta'

describe('浏览器标题拼接（页面名 · 站点名）', () => {
  it('两边都有：用 ` · ` 连接', () => {
    expect(composeTitle('文章详情', 'SynthSpark')).toBe('文章详情 · SynthSpark')
  })

  it('页面名缺失：只留站点名（不留孤零零的分隔符）', () => {
    expect(composeTitle('', 'SynthSpark')).toBe('SynthSpark')
    expect(composeTitle(null, 'SynthSpark')).toBe('SynthSpark')
    expect(composeTitle(undefined, 'SynthSpark')).toBe('SynthSpark')
    expect(composeTitle('   ', 'SynthSpark')).toBe('SynthSpark')
  })

  it('站点名缺失：只留页面名', () => {
    expect(composeTitle('文章详情', '')).toBe('文章详情')
    expect(composeTitle('文章详情', '   ')).toBe('文章详情')
  })

  it('两边都空：给空串（不抛异常、也不留 ` · `）', () => {
    expect(composeTitle('', '')).toBe('')
    expect(composeTitle(null, null as unknown as string)).toBe('')
  })

  it('两边首尾的空白都去掉', () => {
    expect(composeTitle('  文章  ', '  站点  ')).toBe('文章 · 站点')
  })
})

/*
 * `applyDocumentMeta()` 那半（真的往 `<head>` 里写标题与 meta）**不在这里测**：
 * 本仓库的 vitest 环境是 `node`（`vitest.config.ts` 里写明"将来要测组件再换 jsdom"），
 * 没有 DOM 就给不了真实文档。它的行为由 e2e 的 `document-title.spec.ts` 在真浏览器里守：
 * 逐页断言 `<title>` 的形状、文章页断言标题跟着文章走、并断言 `<meta description>` 等于配置值。
 */

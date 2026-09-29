import { describe, expect, it } from 'vitest'

import { DEFAULT_SITE_CONFIG } from '@/config/defaults'
import { deepMerge, footerSegments } from '@/config/site'

/**
 * 站点配置合并语义的单测 —— 这套语义是从旧前端搬过来的，
 * 而且是「看不出错、但会让人少一个导航项」的那种错：
 * 数组若不整体替换，管理员删掉的导航项会永远删不掉。
 *
 * 另外覆盖页脚状态行的分段规则（空字段要省略，不能留下孤零零的分隔点）。
 */
describe('deepMerge：三级配置合并的语义', () => {
  it('null / undefined 跳过，保持下层原值', () => {
    const merged = deepMerge({ a: 'base', b: 'base' }, { a: null, b: undefined })
    expect(merged).toEqual({ a: 'base', b: 'base' })
  })

  it('数组整体替换（不是逐元素合并）', () => {
    const merged = deepMerge(
      { nav: [{ label: '首页' }, { label: '文章' }, { label: '关于' }] },
      { nav: [{ label: '首页' }] },
    )
    // 删掉两项要真的只剩一项
    expect(merged.nav).toEqual([{ label: '首页' }])
  })

  it('嵌套对象深合并：只覆盖给出的字段', () => {
    const merged = deepMerge(
      { site: { name: 'A', icp: 'x' }, home: { title: 'T' } },
      { site: { name: 'B' } },
    )
    expect(merged).toEqual({ site: { name: 'B', icp: 'x' }, home: { title: 'T' } })
  })

  it('基本类型直接覆盖，空字符串也算覆盖（清空就是清空）', () => {
    const merged = deepMerge({ slogan: '原口号', copyright: 'x' }, { slogan: '' })
    expect(merged).toEqual({ slogan: '', copyright: 'x' })
  })

  it('不改动任何入参', () => {
    const base = { site: { name: 'A' }, nav: ['x'] }
    const overlay = { site: { name: 'B' }, nav: ['y'] }
    deepMerge(base, overlay)

    expect(base).toEqual({ site: { name: 'A' }, nav: ['x'] })
    expect(overlay).toEqual({ site: { name: 'B' }, nav: ['y'] })
  })

  it('第二参不是普通对象时原样返回下层（数组、null、基本类型都不算合并项）', () => {
    const base = { a: 1 }
    expect(deepMerge(base, null)).toBe(base)
    expect(deepMerge(base, ['a'])).toBe(base)
    expect(deepMerge(base, 'x')).toBe(base)
  })
})

describe('footerSegments：页脚状态行（硬要求 3）', () => {
  it('默认配置下给出 版权 / 口号 两段，顺序固定', () => {
    const segments = footerSegments(DEFAULT_SITE_CONFIG)
    expect(segments.map((segment) => segment.kind)).toEqual(['copyright', 'slogan'])
    expect(segments[0]?.text).toBe('© 2026 SynthSpark')
  })

  it('备案号为空时整段省略，不留下多余的段落', () => {
    const segments = footerSegments({
      ...DEFAULT_SITE_CONFIG,
      site: { ...DEFAULT_SITE_CONFIG.site, icp: '' },
    })
    expect(segments.some((segment) => segment.kind === 'icp')).toBe(false)
    expect(segments).toHaveLength(2)
  })

  it('备案号有值时排在最后', () => {
    const segments = footerSegments({
      ...DEFAULT_SITE_CONFIG,
      site: { ...DEFAULT_SITE_CONFIG.site, icp: '京ICP备00000000号' },
    })
    expect(segments.map((segment) => segment.kind)).toEqual(['copyright', 'slogan', 'icp'])
    expect(segments[segments.length - 1]?.text).toBe('京ICP备00000000号')
  })

  it('全空时返回空数组（状态行不会输出一个孤零零的 ·）', () => {
    const segments = footerSegments({
      ...DEFAULT_SITE_CONFIG,
      site: { ...DEFAULT_SITE_CONFIG.site, icp: '' },
      footer: { ...DEFAULT_SITE_CONFIG.footer, copyright: '', slogan: '' },
    })
    expect(segments).toEqual([])
  })
})

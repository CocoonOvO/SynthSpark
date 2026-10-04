import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { DEFAULT_SITE_CONFIG } from '@/config/defaults'
import { deepMerge, footerSegments, tabLabels } from '@/config/site'

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

/** 标签栏的四个固定页（与 `scene/tabs.ts` 的 TABS 同形，这里只取 tabLabels 用得到的两个字段） */
const FIXED_TABS = [
  { path: '/', label: '主页' },
  { path: '/posts', label: '文章' },
  { path: '/links', label: '关联' },
  { path: '/about', label: '关于' },
]

describe('tabLabels：导航文字走配置，标签栏固定四项（硬要求 2）', () => {
  it('按 path 取配置里的标签（顺序照样机：主页 / 文章 / 关联 / 关于）', () => {
    expect(tabLabels(DEFAULT_SITE_CONFIG, FIXED_TABS)).toEqual(['主页', '文章', '关联', '关于'])
  })

  it('管理员改文字生效', () => {
    const config = deepMerge(DEFAULT_SITE_CONFIG, {
      navbar: { navItems: [{ label: '首页', path: '/' }] },
    })
    // 数组整体替换：只给了主页一项，其余三项回退兜底标签
    expect(tabLabels(config, FIXED_TABS)).toEqual(['首页', '文章', '关联', '关于'])
  })

  it('配置里多出来的项被忽略：不能凭空多出一个标签', () => {
    const config = deepMerge(DEFAULT_SITE_CONFIG, {
      navbar: {
        navItems: [
          ...DEFAULT_SITE_CONFIG.navbar.navItems,
          { label: '搜索', path: '/search' },
          { label: '编辑器', path: '/write' },
        ],
      },
    })
    expect(tabLabels(config, FIXED_TABS)).toEqual(['主页', '文章', '关联', '关于'])
  })

  it('结尾斜杠视为同一项；空标签回退兜底（页签不能一个字都没有）', () => {
    const config = deepMerge(DEFAULT_SITE_CONFIG, {
      navbar: {
        navItems: [
          { label: '主页', path: '/' },
          { label: '  文章  ', path: '/posts/' },
          { label: '   ', path: '/links' },
        ],
      },
    })
    const labels = tabLabels(config, FIXED_TABS)
    expect(labels[1]).toBe('  文章  ')
    expect(labels[2]).toBe('关联')
  })
})

describe('内置默认文案与样机逐字一致（P3 尾巴的回归网）', () => {
  it('首页：英雄区那两句话、统计条三个标签、三段标题与两张卡都是样机原文', () => {
    const home = DEFAULT_SITE_CONFIG.home
    expect(home.title).toBe('SYNTHSPARK')
    expect(home.desc).toBe(
      '一个由人和 Agent 共同写作的地方。左侧是他们在想什么，右侧是他们在做什么。',
    )
    expect(home.stats).toEqual({ creators: '作者', articles: '文章', reads: '总浏览' })
    expect(home.articles).toEqual({ title: '最新文章', viewAll: '查看全部 ▶' })
    expect(home.groups.title).toBe('分组')
    expect(home.tags.title).toBe('标签')
    expect(home.allCard).toEqual({ title: '全部文章', hint: '按分组与标签筛选' })
  })

  it('关于页：要点块五行、正文是那篇 markdown', () => {
    const about = DEFAULT_SITE_CONFIG.about
    expect(about.facts.map((fact) => fact.key)).toEqual([
      '站点',
      '前端代号',
      '技术栈',
      '渲染',
      '输入',
    ])
    expect(about.facts[0]?.value).toBe('SynthSpark · 多智能体博客')
    // 正文逐字比过一次（与样机 AboutScene 的 MD 字节相同，记录在架构 §18.3），
    // 这里只钉住开头与两个关键结构，避免以后被顺手改写
    expect(about.body.startsWith('## 这里是什么地方')).toBe(true)
    expect(about.body).toContain('## 三条设计铁律')
    expect(about.body).toContain('| 操作 | 键盘 | 鼠标 |')
  })
})

describe('public/site.config.example.json：模板必须与内置默认一致', () => {
  /**
   * 这一条守的是一个很隐蔽的坑：模板文件是**第二级覆盖**，
   * 它一旦和内置默认跑偏，本机 dev / e2e 看到的就不是样机文案了
   * （而且只有改了 defaults.ts 却忘了改模板的人才会撞上）。
   * 只比「会渲染出来的部分」：footer.links 那种不渲染的结构允许模板里多写一组示例。
   */
  const template = JSON.parse(
    readFileSync(new URL('../../../public/site.config.example.json', import.meta.url), 'utf-8'),
  ) as unknown

  it('按三级合并跑一遍后，可见内容与内置默认完全相同', () => {
    const merged = deepMerge(DEFAULT_SITE_CONFIG, template)

    expect(tabLabels(merged, FIXED_TABS)).toEqual(tabLabels(DEFAULT_SITE_CONFIG, FIXED_TABS))
    expect(merged.site).toEqual(DEFAULT_SITE_CONFIG.site)
    expect(merged.home).toEqual(DEFAULT_SITE_CONFIG.home)
    expect(merged.about).toEqual(DEFAULT_SITE_CONFIG.about)
    expect(footerSegments(merged)).toEqual(footerSegments(DEFAULT_SITE_CONFIG))
  })
})

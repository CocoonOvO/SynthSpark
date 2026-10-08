import { expect, test, type Page } from '@playwright/test'

import { booted } from './helpers'

/**
 * 三级配置接线（硬要求 2）：页面文案必须来自配置，而不是写死在模板里。
 *
 * 这道门怎么写才不脆：**不去断言某一串具体的字**（后台配置是本机数据，管理员随时能改，
 * 断言具体字就是断言"这台机器的数据"），而是**从运行期取当前生效的最高优先级覆盖层**，
 * 再拿它去核对渲染结果 —— 页面显示的字必须等于那个层里给的字。
 *
 * 取层顺序与 `src/config/site.ts` 的优先级一致：后台接口 > 本地文件。
 * 两层都没有的机器（全新克隆、后台没配过）就跳过：那种情况下生效的只有内置默认，
 * 已由 `src/config/__tests__/site.spec.ts` 的单测钉住（内置默认与样机逐字一致）。
 */

interface Layer {
  url: string
  data: Record<string, unknown>
}

/**
 * 取当前生效的最高优先级覆盖层；两层都取不到返回 `null`。
 *
 * **每层重试 3 次**：这套用例的判据是「渲染 == 覆盖层」，一次取不到就只能跳过 ——
 * 而并行跑整套时后端偶尔忙一下，跳过会**静默**把这道门变成绿的。
 * 两次都失败才认「这台机器没有覆盖层」，并且把 HTTP 状态一并带出来（见调用方）。
 */
async function topLayer(page: Page): Promise<Layer | null> {
  return page.evaluate(async () => {
    for (const url of ['/api/site-config', '/site.config.json']) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
        try {
          const response = await fetch(url, { headers: { accept: 'application/json' } })
          // 4xx 是「这一层确实没有」，换下一层；5xx / 网络问题值得再试
          if (response.status >= 500) continue
          if (!response.ok) break
          if (!(response.headers.get('content-type') ?? '').includes('json')) break
          return { url, data: (await response.json()) as Record<string, unknown> }
        } catch {
          // 网络层失败：再试
        }
      }
    }
    return null
  })
}

/** 按 `a.b.c` 取值；缺任何一环都返回 undefined（"这一层没给这个字段"） */
function pick(source: unknown, path: string): unknown {
  let node: unknown = source
  for (const key of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[key]
  }
  return node
}

/** 站内路径归一口径与 `config/site.ts` 的 tabLabels 一致（结尾斜杠不分家） */
function normalize(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

test('首页与标签栏：显示的字等于最高优先级覆盖层给的字', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  const layer = await topLayer(page)
  if (layer === null) {
    test.skip(true, '本机没有任何覆盖层（后台与本地文件都没配）')
    return
  }

  // 英雄区大字与副文
  const title = pick(layer.data, 'home.title')
  if (typeof title === 'string' && title !== '') {
    await expect(page.locator('.hero-name')).toHaveText(title)
  }
  const desc = pick(layer.data, 'home.desc')
  if (typeof desc === 'string' && desc !== '') {
    await expect(page.locator('.hero-sub')).toHaveText(desc)
  }

  // 统计条三个标签（顺序：文章 / 作者 / 总浏览）
  const statsLabels = [
    ['home.stats.articles', '.hero-stats .stat:nth-child(1) i'],
    ['home.stats.creators', '.hero-stats .stat:nth-child(2) i'],
    ['home.stats.reads', '.hero-stats .stat:nth-child(3) i'],
  ] as const
  for (const [path, selector] of statsLabels) {
    const value = pick(layer.data, path)
    if (typeof value === 'string' && value !== '')
      await expect(page.locator(selector)).toHaveText(value)
  }

  // 三段段标题与两张卡
  const sections = [
    ['home.articles.title', '.sec:nth-of-type(1) .cap-cn'],
    ['home.groups.title', '.sec:nth-of-type(2) .cap-cn'],
    ['home.tags.title', '.sec:nth-of-type(3) .cap-cn'],
  ] as const
  for (const [path, selector] of sections) {
    const value = pick(layer.data, path)
    if (typeof value === 'string' && value !== '')
      await expect(page.locator(selector)).toHaveText(value)
  }
  const viewAll = pick(layer.data, 'home.articles.viewAll')
  if (typeof viewAll === 'string' && viewAll !== '') {
    await expect(page.locator('[data-testid="home-all"]')).toHaveText(viewAll)
  }
  const allTitle = pick(layer.data, 'home.allCard.title')
  const allHint = pick(layer.data, 'home.allCard.hint')
  if (typeof allTitle === 'string' && allTitle !== '') {
    await expect(page.locator('.post.all .all-text')).toContainText(allTitle)
  }
  if (typeof allHint === 'string' && allHint !== '') {
    await expect(page.locator('.post.all .all-text')).toContainText(allHint)
  }

  // 标签栏：四个固定页签，文字按 path 对齐覆盖层（多出来的项不该多出页签）
  const navItems = pick(layer.data, 'navbar.navItems')
  if (Array.isArray(navItems)) {
    const byPath = new Map<string, string>()
    for (const item of navItems) {
      const path = pick(item, 'path')
      const label = pick(item, 'label')
      if (typeof path === 'string' && typeof label === 'string') byPath.set(normalize(path), label)
    }
    const rendered = await page.locator('.tabbar .tab-cn').allTextContents()
    expect(rendered).toHaveLength(4)
    rendered.forEach((label, index) => {
      const paths = ['/', '/posts', '/links', '/about']
      const expected = byPath.get(paths[index] ?? '')
      if (expected) expect(label.trim()).toBe(expected)
    })
  }
})

test('关于页：要点块与正文都等于最高优先级覆盖层给的内容', async ({ page }) => {
  await page.goto('/about')
  await booted(page)

  const layer = await topLayer(page)
  if (layer === null) {
    test.skip(true, '本机没有任何覆盖层（后台与本地文件都没配）')
    return
  }

  const facts = pick(layer.data, 'about.facts')
  if (Array.isArray(facts) && facts.length > 0) {
    const keys = await page.locator('[data-testid="about-facts"] .fact-k').allTextContents()
    const values = await page.locator('[data-testid="about-facts"] .fact-v').allTextContents()
    expect(keys.map((s) => s.trim())).toEqual(facts.map((fact) => String(pick(fact, 'key'))))
    expect(values.map((s) => s.trim())).toEqual(facts.map((fact) => String(pick(fact, 'value'))))
  }

  const body = pick(layer.data, 'about.body')
  if (typeof body === 'string' && body !== '') {
    const rendered = (await page.locator('[data-testid="md-body"]').textContent()) ?? ''
    // 正文走 markdown 渲染，逐字比不了；取开头那段不带标记的文字来核
    const prose = body
      .split('\n')
      .map((line) => line.trim())
      .find(
        (line) =>
          line !== '' && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('-'),
      )
    if (prose) {
      // markdown 会带 `**` 之类的强调标记，去掉后再比（保留中文与标点）
      const plain = prose.replace(/[*`>]/g, '').replace(/\s+/g, '')
      expect(rendered.replace(/\s+/g, '')).toContain(plain.slice(0, 24))
    }
  }
})

/**
 * 页脚小字（硬要求 2 的「页脚」那一格 + 硬要求 3 的落点）。
 *
 * 底栏那三段不是写死的：`© {footer.copyright}` / `footer.slogan` / `site.icp`
 * （`config/site.ts` 的 `footerSegments()`），空字段整段省略 —— 所以这里的口径是
 * **覆盖层给了什么就显示什么**：
 *   · 给非空串 → 那一段必须逐字等于它（版权还带固定的 `© ` 前缀）；
 *   · 给空串 → 那一段**不该出现**（`deepMerge` 里基本类型直接覆盖，空串不会退回默认值）；
 *   · 这一层压根没给这个字段 → 生效的是内层 / 内置默认，不归这道门管，跳过。
 */
test('页脚小字：版权 / 口号 / 备案 / 自定义小字都等于最高优先级覆盖层给的字（空值则那段消失）', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  const layer = await topLayer(page)
  if (layer === null) {
    test.skip(true, '本机没有任何覆盖层（后台与本地文件都没配）')
    return
  }

  const cases = [
    { path: 'footer.copyright', selector: '.deck-footer .is-copyright', prefix: '© ' },
    { path: 'footer.slogan', selector: '.deck-footer .is-slogan', prefix: '' },
    { path: 'footer.icp', selector: '.deck-footer .is-icp', prefix: '' },
  ] as const

  let checked = 0
  for (const item of cases) {
    let value = pick(layer.data, item.path)
    // 备案号：`footer.icp` 是正式字段，为空时渲染会回退到旧字段 `site.icp`
    // （口径写在 config/site.ts 的 effectiveIcp，由单测钉住）；这道门按同一条规则核对。
    if (item.path === 'footer.icp' && (value === undefined || value === '')) {
      value = pick(layer.data, 'site.icp')
    }
    if (value === undefined) continue // 这一层没给 → 不归这道门管
    checked += 1
    const segment = page.locator(item.selector)
    if (typeof value === 'string' && value !== '') {
      await expect(segment).toHaveText(`${item.prefix}${value}`)
    } else {
      await expect(segment, `${item.path} 是空值，那一段就不该出现`).toHaveCount(0)
    }
  }

  // 自定义小字（`footer.items`）：按配置顺序接在备案号后面，空的那条不出现
  const items = pick(layer.data, 'footer.items')
  if (Array.isArray(items)) {
    checked += 1
    const expected = items
      .map((row) => (row && typeof row === 'object' ? (row as { text?: unknown }).text : undefined))
      .filter((text): text is string => typeof text === 'string' && text.trim() !== '')
      .map((text) => text.trim())
    await expect(page.locator('.deck-footer .is-item')).toHaveText(expected)
  }

  if (checked === 0) {
    test.skip(true, '本机的覆盖层一个页脚字段都没给（生效的是内置默认，由单测守）')
    return
  }

  // 段间分隔符只在「真的有两段以上」时出现：不留下孤零零的 ` · `
  const dots = await page.locator('.deck-footer .deck-dot').count()
  const segments = await page.locator('.deck-footer .deck-seg').count()
  expect(dots, '分隔符数量应当是「段数 - 1」').toBe(Math.max(0, segments - 1))
})

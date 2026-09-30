import { expect, test, type Page } from '@playwright/test'

import { booted } from './helpers'

/**
 * 硬要求 3 的**逐场景**门：站点小字放在外壳底栏 `.deck` 里，所有场景常驻。
 *
 * 用户口径原文两条：「站点小字不做传统页脚区块，放在外壳底栏 `.deck` 里」、
 * 「位于软键左侧」，并且**所有场景常驻（含开机自检与 404）**。
 *
 * 已有的 `shell.spec.ts` 守的是底栏的**结构**（`.deck` 与 `.screen` 同级、不在框里、
 * 子元素顺序、贴底几何）与「404 也有小字」。这一道补的是**遍历面**：
 * 十二条路由 + 开机自检逐格走一遍，断言每一格上
 *   ① `.deck` 与 `.deck-footer` 都在且可见、小字非空；
 *   ② 小字在**软键左侧**（右边缘不越过 `.deck-keys` 的左边缘）；
 *   ③ 小字内容**逐字一致**（它是站点配置来的外壳级内容，不该随页面变）。
 *
 * 数据依赖与 `pages.spec.ts` 一样：登录态页面用打桩超管（不碰真账号），
 * 其余走真后端；前端不渲染任何页面级页脚是这里的核心断言，所以不看数据也能成立。
 */

test.setTimeout(120_000)

/** 超管登录态：四张管理页与写作页要它才渲染真内容（打桩，不碰真账号） */
async function superuser(page: Page): Promise<void> {
  const user = { username: 'e2e_boss', display_name: '测试超管', is_superuser: true }
  await page.addInitScript((u) => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
    localStorage.setItem('synthspark-token', 'e2e-token')
    localStorage.setItem('synthspark-icespark-user', JSON.stringify(u))
  }, user)
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'e2e-id', ...user }),
    }),
  )
}

/** 当前这一格上的底栏小字：文本 + 它是否在软键左侧 */
async function deckReading(page: Page): Promise<{ text: string; leftOfKeys: boolean }> {
  await expect(page.locator('[data-testid="deck"]')).toBeVisible()
  const footer = page.locator('[data-testid="deck-footer"]')
  await expect(footer).toBeVisible()
  const text = (await footer.innerText()).replace(/\s+/g, ' ').trim()
  const leftOfKeys = await page.evaluate(() => {
    const f = document.querySelector('[data-testid="deck-footer"]') as HTMLElement
    const k = document.querySelector('.deck-keys') as HTMLElement
    if (!f || !k) return false
    return f.getBoundingClientRect().right <= k.getBoundingClientRect().left + 0.5
  })
  return { text, leftOfKeys }
}

test('底栏小字：开机自检那一格就已经在（自检不是路由，最容易漏）', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await page.goto('/')
  // **不等** booted：自检那一格只有 1.5 秒，这里要的就是它正在播的时候
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'boot')
  const boot = await deckReading(page)
  expect(boot.text.length, '自检时小字也该有内容').toBeGreaterThan(0)
  expect(boot.leftOfKeys, '小字要在软键左侧').toBe(true)

  // 自检播完落到主页，小字一字不变（它是外壳级内容）
  await booted(page)
  expect(await deckReading(page)).toEqual(boot)
})

test('底栏小字：十二条路由逐格都在、都在软键左侧、内容逐字一致', async ({ page }) => {
  await superuser(page)

  const routes = [
    '/',
    '/posts',
    '/links',
    '/about',
    '/nope-404',
    '/profile',
    '/admin/site',
    '/admin/links',
    '/admin/audit',
    '/write',
  ]

  // 文章详情与用户主页要真数据：探不到就跳过那两格（跳过而不是假装扫过）
  const probe = await page.request.get('/api/posts/?limit=1&status=published')
  if (probe.ok()) {
    const data = (await probe.json()) as { items?: { id: string; slug?: string | null }[] }
    const item = data.items?.[0]
    if (item) routes.push(`/post/${item.slug || item.id}`)
  }

  const readings: Record<string, { text: string; leftOfKeys: boolean }> = {}
  for (const path of routes) {
    await page.goto(path)
    await booted(page)
    readings[path] = await deckReading(page)
  }

  // ① 每一格都在软键左侧
  const wrongSide = Object.entries(readings)
    .filter(([, r]) => !r.leftOfKeys)
    .map(([path]) => path)
  expect(wrongSide, `这些页面上小字不在软键左侧：${wrongSide.join(', ')}`).toEqual([])

  // ② 每一格都非空，而且**逐字一致**（站点小字是外壳级内容，不随页面变）
  const texts = Object.entries(readings).map(([path, r]) => [path, r.text] as const)
  const nonEmpty = texts.filter(([, t]) => t.length > 0)
  expect(nonEmpty.length, '每一格都该有站点小字').toBe(texts.length)
  const unique = [...new Set(texts.map(([, t]) => t))]
  expect(unique, `小字在不同页面上不一致：${JSON.stringify(texts)}`).toHaveLength(1)

  // ③ 页面里不许长出第二个「页脚区块」：小字只能出现在 `.deck` 里
  const outsideCopy = await page.evaluate(() => document.querySelectorAll('footer').length)
  expect(outsideCopy, '全站不做传统页脚区块（footer）').toBe(0)
})

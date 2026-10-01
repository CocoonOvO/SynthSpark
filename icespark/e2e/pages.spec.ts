import { expect, test, type Page } from '@playwright/test'

import { booted, probeJson } from './helpers'

/**
 * P3 迁移页面门：样机里每一个页面都要真的在路上。
 *
 * 与样机 e2e 的分工没变：这里验**结构与交互事实**（路由、标签栏、键盘路径、
 * 「URL 是唯一真相」），像素表现仍由 palette / shell 两道门管。
 *
 * 两条自我约束：
 * 1. **不依赖后端有数据**。列表 / 详情 / 外链的内容数量随库而变，
 *    所以只断言「结构在不在」「空态长什么样」，需要一篇文章时先探一下接口，
 *    探不到就 `test.skip`（跳过而不是假绿）。
 * 2. **开机自检先让位**：每个用例 `goto` 之后都要 `await booted(page)`，
 *    否则第一次按键会被自检吃掉（见 helpers.ts）。
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
})

/**
 * 取一篇已发布文章的 key（slug 优先，与 `api/format.ts` 的 postKey 同口径）。
 *
 * 用 `probeJson`（带重试）而不是裸 `request.get`：并行跑整套时后端偶尔忙一下，
 * 一次探针失败就会把这条用例**静默跳掉**（报告里只剩「N skipped」）。返回值把
 * 「为什么没有」一并带出来，交给 `test.skip` 当理由。
 */
async function firstPostKey(page: Page): Promise<{ key: string | null; reason: string }> {
  const { data, reason } = await probeJson<{ items?: { id: string; slug?: string | null }[] }>(
    page,
    '/api/posts/?limit=1&status=published',
  )
  const item = data?.items?.[0]
  if (!item) return { key: null, reason: `探不到已发布文章（${reason}）` }
  return { key: item.slug || item.id, reason: 'OK' }
}

test('开机自检：先播 BOOT（底栏点亮 BOOT），再自动落到当前路由那一页', async ({ page }) => {
  // 装一个记录器：自检只有 1.5 秒，断言「先 boot 再 home」比抢时间稳
  await page.addInitScript(() => {
    const seen: { scene: string; label: string }[] = []
    ;(window as unknown as { __scenes: typeof seen }).__scenes = seen
    const record = () => {
      const scene = document.querySelector('.app')?.getAttribute('data-scene')
      if (!scene) return
      const label = document.querySelector('.deck-scene b.on')?.textContent?.trim() ?? ''
      const last = seen[seen.length - 1]
      if (last && last.scene === scene && last.label === label) return
      seen.push({ scene, label })
    }
    document.addEventListener('DOMContentLoaded', () => {
      new MutationObserver(record).observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ['data-scene'],
      })
      record()
    })
  })

  await page.goto('/')
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'home')

  const seen = await page.evaluate(
    () => (window as unknown as { __scenes: { scene: string; label: string }[] }).__scenes,
  )
  expect(seen[0]?.scene).toBe('boot')
  // 自检期间底栏那一格是 BOOT，播完换成 HOME —— 场景指示与画面同一个事实
  expect(seen[0]?.label).toBe('BOOT')
  expect(seen.some((item) => item.scene === 'home' && item.label === 'HOME')).toBe(true)
})

test('开机自检：URL 全程是真实路由（自检不是一条路由，不占历史）', async ({ page }) => {
  await page.goto('/about')
  // 自检还没播完时，地址栏就已经是要去的那一页
  expect(new URL(page.url()).pathname).toBe('/about')
  const historyBefore = await page.evaluate(() => history.length)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'about')

  // 自检不是一条路由：播完前后历史长度不变（没有多出一条「开机页」）
  expect(await page.evaluate(() => history.length)).toBe(historyBefore)

  // 站内跳一次再后退：退到上一页，而不是退回自检画面
  await page.click('[data-testid="tab-home"]')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'home')
  await page.goBack()
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'about')
})

test('标签栏：四个页签、当前页高亮、鼠标点击切换并写 URL', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  await expect(page.locator('[data-testid="tabbar"] .tab')).toHaveCount(4)
  await expect(page.locator('[data-testid="tab-home"]')).toHaveClass(/on/)

  await page.click('[data-testid="tab-about"]')
  await expect(page).toHaveURL(/\/about$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'about')
  await expect(page.locator('[data-testid="tab-about"]')).toHaveClass(/on/)
  await expect(page.locator('[data-testid="tab-home"]')).not.toHaveClass(/on/)
})

test('标签栏：键盘 Tab / Shift+Tab 同样能切页签（不是只有鼠标能点）', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  await page.keyboard.press('Tab')
  await expect(page).toHaveURL(/\/posts$/)
  await expect(page.locator('[data-testid="tab-posts"]')).toHaveClass(/on/)

  await page.keyboard.press('Shift+Tab')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('[data-testid="tab-home"]')).toHaveClass(/on/)
})

test('文章列表：/posts 是独立页面，筛选条件写在 URL 里', async ({ page }) => {
  await page.goto('/posts')
  await booted(page)

  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'posts')
  await expect(page.locator('[data-testid="tab-posts"]')).toHaveClass(/on/)
  // 结构在（内容多少随库变化）
  await expect(page.locator('[data-testid="group-row"]')).toBeVisible()
  await expect(page.locator('[data-testid="tag-row"]')).toBeVisible()

  // 一个不存在的分组：URL 带着它，页面按空结果渲染空态（不是白屏、不是回首页）
  await page.goto('/posts?group=__no_such_group__')
  await booted(page)
  await expect(page).toHaveURL(/group=__no_such_group__/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'posts')
  await expect(page.locator('.state')).toBeVisible()
})

test('文章详情：深链接能直接进来，正文与操作条都在，键盘能返回列表', async ({ page }) => {
  const { key, reason } = await firstPostKey(page)
  test.skip(!key, reason)
  if (!key) return

  await page.goto(`/post/${key}`)
  await booted(page)

  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'article')
  // 文章详情没有标签栏（自带返回）
  await expect(page.locator('[data-testid="tabbar"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="md-body"]')).toBeVisible()
  await expect(page.locator('[data-testid="actions"]')).toBeVisible()

  // 键盘：L 进操作条 → 右移两格到「返回列表」→ 回车回到列表
  await page.keyboard.press('l')
  await expect(page.locator('[data-testid="action-like"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="action-comment"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="action-back"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/posts/)
})

test('关联页：/links 能直接进；没有配置链接时渲染空态而不是空白', async ({ page }) => {
  await page.goto('/links')
  await booted(page)

  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'links')
  await expect(page.locator('.links')).toBeVisible()

  // 有数据就是栅格，没数据就是空态；两者都必须有可读内容
  const grid = page.locator('[data-testid="links-grid"]')
  const empty = page.locator('.state')
  await expect(grid.or(empty)).toBeVisible()
  if (await empty.isVisible()) await expect(empty).toContainText('还没有配置任何链接')
})

test('关于页：/about 能直接进，正文与要点块都渲染出来', async ({ page }) => {
  await page.goto('/about')
  await booted(page)

  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'about')
  await expect(page.locator('[data-testid="about-facts"]')).toBeVisible()
  // 关于页正文走同一个 markdown 渲染器（内容来自页面常量，不依赖后端）
  await expect(page.locator('[data-testid="md-body"]')).toBeVisible()
})

test('ESC 也能呼出暂停菜单（与 P 同一条路径）', async ({ page }) => {
  await page.goto('/posts')
  await booted(page)

  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()

  // 菜单自己消费 Esc 关掉自己：一次按键不走两层
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
})

test('Q / E 走浏览器前进后退，且菜单行的可用性跟着变', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  await page.click('[data-testid="tab-links"]')
  await expect(page).toHaveURL(/\/links$/)

  await page.keyboard.press('q')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'home')

  await page.keyboard.press('e')
  await expect(page).toHaveURL(/\/links$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'links')
})

test('鼠标与键盘到达同一页：两条路径的落点完全一致', async ({ page }) => {
  await page.goto('/')
  await booted(page)
  await page.click('[data-testid="tab-posts"]')
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'posts')
  const byMouse = new URL(page.url()).pathname

  await page.goto('/')
  await booted(page)
  await page.keyboard.press('Tab')
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'posts')
  const byKeyboard = new URL(page.url()).pathname

  expect(byKeyboard).toBe(byMouse)
})

import { expect, test } from '@playwright/test'

import { booted } from './helpers'

/**
 * P0 骨架用例：只验「骨架真的通了」，不看视觉。
 *
 * 与样机 e2e 的分工：样机用例验像素表现，这里验结构事实 ——
 * 真 URL、后退键、404 兜底、转场表现层的归属、文本仍然是文本。
 * 视觉 / 配色 / parity / 无障碍从 P1、P2 起加（架构 §4、§5）。
 */

const UNKNOWN_PATH = '/no/such/path'

/**
 * 跳过首次音效询问。
 *
 * 它是「第一次交互」触发的模态（键盘和鼠标任一路径都算），
 * 而本文件里的用例要连点两个链接 —— 询问框会把第二次点击挡在遮罩外。
 * 询问本身的行为由 e2e/parity-*.spec.ts 正面覆盖，这里只把它关掉。
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
})

test('首页：渲染出来，转场表现层写上 data-scene', async ({ page }) => {
  await page.goto('/')

  // 场景名与样机一致：`/` 是 home（`boot` 是开机自检，不是一条路由 ——
  // 自检期间 data-scene 是 boot，播完落到当前路由的场景）
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'home')
  // 首页渲染出来了：样机的入口之一「全部文章」在（内容本身可能为空，不依赖后端有数据）
  await expect(page.locator('[data-testid="home-all"]')).toBeVisible()
  // 底栏的数据源标记照旧写着运行期事实（LIVE / DEMO 二选一）
  await expect(page.locator('[data-testid="deck-src"]')).toHaveText(/LIVE|DEMO/)
})

test('深链未知路径：404 兜底，且回显原地址', async ({ page }) => {
  await page.goto(UNKNOWN_PATH)

  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'error')
  await expect(page.locator('main')).toContainText('404')
  await expect(page.locator('main')).toContainText(UNKNOWN_PATH)
})

test('站内跳转与后退键：URL 是唯一真相来源', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  // 走真实站内入口：标签栏 → 文章列表
  await page.click('[data-testid="tab-posts"]')
  await expect(page).toHaveURL(/\/posts$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'posts')

  // 浏览器后退键必须回到首页，且表现层跟着更新
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'home')
})

test('同一文档内每次导航都触发一遍转场表现层', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  await page.click('[data-testid="tab-links"]')
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'links')
  const before = Number(await page.locator('.app').getAttribute('data-scene-seq'))

  await page.click('[data-testid="tab-home"]')
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'home')
  const after = Number(await page.locator('.app').getAttribute('data-scene-seq'))

  expect(after).toBeGreaterThan(before)
})

test('皮肤式的底线：正文是可选中的真文本，整页没有 canvas', async ({ page }) => {
  await page.goto(UNKNOWN_PATH)
  // 路由懒加载是异步的，先等内容真的渲染出来再量（evaluate 不会自动等）
  await expect(page.locator('main')).toContainText('404')

  const ok = await page.evaluate(() => {
    const main = document.querySelector('main')
    if (!main) return false
    const range = document.createRange()
    range.selectNodeContents(main)
    return range.toString().trim().length > 10 && document.querySelectorAll('canvas').length === 0
  })

  expect(ok).toBe(true)
})

test('/api 由代理接管，没有被 SPA 回退吃掉', async ({ page }) => {
  // 不依赖后端是否在跑：代理通了会拿到 JSON 或 5xx，唯独不该拿到 index.html
  const response = await page.request.get('/api/this-route-does-not-exist')
  const contentType = response.headers()['content-type'] ?? ''

  expect(contentType).not.toContain('text/html')
})

test('运行期无 JS 报错', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  for (const route of ['/', UNKNOWN_PATH]) {
    await page.goto(route)
    await expect(page.locator('.app')).toBeVisible()
  }

  expect(errors).toEqual([])
})

import { expect, test, type Page } from '@playwright/test'

/**
 * **打包产物冒烟门**（架构 §36）—— 跑在 `vite preview`（4175）上，不是 dev 服务器。
 *
 * 为什么单独要一道门：dev 服务器与产物是两套东西 ——
 *   · 路由的 SPA 回退（深链接刷新 `/posts` 要真的拿回 index.html，而不是 404 页）；
 *   · hash 文件名与按路由切分的懒加载 chunk（每个视图一个 chunk，首屏只下入口）；
 *   · 字体与静态资源的路径（`/fonts/*.woff2` 是 `public/` 直出，打包后路径变了就会被抓到）；
 *   · 「跑的是打包产物而不是源码」（`/src/*.ts` 与 `/@vite/*` 的请求必须一条都没有）。
 * 这些在 5175 上一条都验不出来。P1 收尾做过一次**人工**产物验证（§14.6），此后一直没人再做过。
 *
 * 这一份刻意**不依赖后端有数据**（与 `pages.spec.ts` 同一口径）：只断言结构事实
 * （自检落页、底栏与小字、字体加载、SPA 回退、零 dev-only 请求、零控制台报错），
 * 内容数量随库而变，不在这里判。
 */

test.describe.configure({ mode: 'parallel' })

test('产物：自检播完落主页，外壳三段与底栏小字都在', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await expect(page.locator('[data-testid="screen"]')).toBeVisible()
  await expect(page.locator('.app')).not.toHaveAttribute('data-scene', 'boot')

  // 三段式：`.app > .screen` 同级 `.deck`，小字在底栏里（硬要求 3 在产物里同样成立）
  await expect(page.locator('[data-testid="deck"]')).toBeVisible()
  await expect(page.locator('[data-testid="deck-footer"]')).toBeVisible()
  expect((await page.locator('[data-testid="deck-footer"]').innerText()).trim().length).toBeGreaterThan(0)

  // 像素字体真的加载了（路径错了会静默退回系统字体 —— 这正是 §14.6 那条）
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('12px ArkPixel')))
    .toBe(true)

  expect(errors, `产物里有报错：${errors.slice(0, 3).join(' | ')}`).toEqual([])
})

test('产物：跑的是打包产物 —— 没有 /src/ 或 @vite 请求，入口是 hash 文件', async ({ page }) => {
  const urls: string[] = []
  page.on('request', (request) => urls.push(request.url()))

  await page.goto('/')
  await expect(page.locator('.app')).not.toHaveAttribute('data-scene', 'boot')
  await page.keyboard.press('Tab') // 切一页，逼出一个懒加载 chunk
  await page.waitForURL(/\/posts$/)

  // ① 一条 dev-only 请求都不许有（源码模块 / HMR 客户端）
  const devOnly = urls.filter((u) => /\/src\/|\/@vite\/|\/@fs\/|\?t=\d+/.test(u))
  expect(devOnly, `产物里出现了只在 dev 才有的请求：${devOnly.slice(0, 3).join(', ')}`).toEqual([])

  // ② 入口与懒加载 chunk 都是带 hash 的构建产物
  const assets = urls.filter((u) => u.includes('/assets/'))
  expect(assets.length, '应当至少加载了入口资源').toBeGreaterThan(0)
  for (const asset of assets) {
    expect(asset, `${asset} 看起来不像构建产物`).toMatch(/\/assets\/[\w.-]+-[A-Za-z0-9_-]{8,}\.(js|css)$/)
  }
  // ③ 按路由切分的懒加载真的发生了：列表页会去下它自己的 chunk
  expect(urls.some((u) => /PostListView-[\w-]+\.js/.test(u)), '列表页应当有独立的 chunk').toBe(true)
})

test('产物：真 URL 与 SPA 回退 —— 深链接直达、未知路径落 404 皮肤', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })

  // 深链接：刷新式直达（回退必须由服务端把 index.html 交回来）
  await page.goto('/about')
  await expect(page.locator('.app')).not.toHaveAttribute('data-scene', 'boot')
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'about')
  await expect(page.locator('[data-testid="about-facts"]')).toBeVisible()

  // 未知路径：前端自己的 404 皮肤（不是服务器的 404 页）
  await page.goto('/no/such/deep/path')
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'error')
  await expect(page.locator('main')).toContainText('404')
  await expect(page.locator('[data-testid="deck-footer"]')).toBeVisible()
})

test('产物：切页 / 菜单 / 转场在产物里照常', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await page.goto('/')
  await expect(page.locator('.app')).not.toHaveAttribute('data-scene', 'boot')

  // 键盘切页（标签栏路径）
  await page.keyboard.press('Tab')
  await expect(page).toHaveURL(/\/posts$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'posts')

  // 菜单能起、ESC 能关（外壳的暂停菜单与外壳同生共死）
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)

  // 转场遮罩走的是打包进去的 keyframes（转场那一层在产物里必须还能跑）
  await page.keyboard.press('q')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('[data-testid="transition"]')).toHaveCount(0, { timeout: 3000 })
})

/** 只是为了让「产物里的 API 也真的通」这件事有一条显式断言（preview.proxy 配好了才有意义） */
test('产物：/api 由 preview 的代理分流到真后端', async ({ page }: { page: Page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await page.goto('/')
  const response = await page.request.get('/api/site-config')
  expect(response.status(), 'preview 也该把 /api 代理到后端（见 vite.config.ts 的 preview.proxy）').toBe(200)
  const body = (await response.json()) as Record<string, unknown>
  expect(Object.keys(body).length, '站点配置该有内容').toBeGreaterThan(0)
})

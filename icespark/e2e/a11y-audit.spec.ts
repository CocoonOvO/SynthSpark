import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { scanViolations } from './a11y-known'

/**
 * **axe 审计收口门**（P7，架构 §33）。
 *
 * 各页自己的 spec 里已经各扫一次（`a11y.spec.ts` + 四张管理页 + profile / write / user-profile），
 * 那些门守的是「这一页别退步」。这一道补的是**整站视角的两件事**：
 *
 * 1. **每一条路由 + 三个外壳模态都真的被扫过**，而且放行清单只有一份
 *    （`e2e/a11y-known.ts`）—— 以前 `admin-links` / `profile` / `write` 各抄了一份，
 *    口径漂移了没人发现；谁再想放行新的东西，只能改那一个文件（改这里会在评审里被看到）。
 * 2. **把唯一的「结构性放行」配上补偿断言**：`/about` 的 `.screen-inner` 被 axe 判为
 *    「可滚动但键盘够不到」，而关于页其实自己接管了 `↑↓` / `PgUp PgDn` ——
 *    那条路径就是这条放行的**代价等价物**，它必须被机器守着，否则哪天键盘滚动坏了，
 *    放行理由就成了空话。
 *
 * 与 `a11y.spec.ts` 同源的两条口径照旧：屏幕外框里的文字 axe 判不了（CRT 扫描线让它落进
 * `incomplete`），底栏小字的对比度是用户裁决保留的样式 —— 都记在 `a11y-known.ts` 的文件头。
 *
 * 数据依赖与 `pages.spec.ts` 一致：**不依赖后端有数据**，需要文章 / 用户时先探一下接口，
 * 探不到就跳过那一格（跳过而不是假装扫过）。
 */

test.setTimeout(180_000)

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
})

/** 超管登录态（打桩 `/api/auth/me`，不碰真账号）：四张管理页与写作页要它才渲染真内容 */
async function superuser(page: Page): Promise<void> {
  const user = { username: 'e2e_boss', display_name: '测试超管', is_superuser: true }
  await page.addInitScript((u) => {
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

/** 扫一页：等自检过去、等一帧稳定，再按**唯一清单**判定 */
async function scan(page: Page): Promise<{ violations: string[]; allowed: string[] }> {
  await page.waitForFunction(
    () => document.querySelector('.app')?.getAttribute('data-scene') !== 'boot',
    null,
    { timeout: 20_000 },
  )
  await page.waitForTimeout(250)
  return scanViolations(await new AxeBuilder({ page }).analyze())
}

/** 取一篇已发布文章的 key、一个真实用户名（探不到返回 null，调用方跳过该格） */
async function probe(page: Page): Promise<{ key: string | null; username: string | null }> {
  const posts = await page.request.get('/api/posts/?limit=1&status=published')
  const users = await page.request.get('/api/posts/?limit=1&status=published&include_author=1')
  let key: string | null = null
  let username: string | null = null
  if (posts.ok()) {
    const data = (await posts.json()) as { items?: { id: string; slug?: string | null }[] }
    const item = data.items?.[0]
    key = item ? item.slug || item.id : null
  }
  if (users.ok()) {
    const data = (await users.json()) as { items?: { author_username?: string | null }[] }
    username = data.items?.[0]?.author_username ?? null
  }
  return { key, username }
}

test('a11y 收口：公开页面（含文章详情与用户主页）只有清单里的已知违规', async ({ page }) => {
  const { key, username } = await probe(page)
  const paths = ['/', '/posts', '/links', '/about', '/nope-404', '/nope-404/deeper']
  if (key) paths.push(`/post/${key}`)
  else test.info().annotations.push({ type: 'skip-article', description: '库里没有已发布文章' })
  if (username) paths.push(`/user/${username}`)
  else test.info().annotations.push({ type: 'skip-user', description: '取不到作者用户名' })

  const report: Record<string, string[]> = {}
  for (const path of paths) {
    await page.goto(path)
    const scan1 = await scan(page)
    if (scan1.violations.length) report[path] = scan1.violations
  }

  expect(report, `这些页面出现了清单外的违规：${JSON.stringify(report, null, 1)}`).toEqual({})
  expect(paths.length, '至少要扫到六个公开路由').toBeGreaterThanOrEqual(6)
})

test('a11y 收口：登录态页面与三个外壳模态也只有清单里的已知违规', async ({ page }) => {
  await superuser(page)

  const report: Record<string, string[]> = {}
  for (const path of ['/profile', '/admin/site', '/admin/links', '/admin/audit', '/write']) {
    await page.goto(path)
    const scan1 = await scan(page)
    if (scan1.violations.length) report[path] = scan1.violations
  }

  // 模态一：暂停菜单（未登录 6 行那一档）
  await page.goto('/')
  await scan(page)
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  const paused = scanViolations(await new AxeBuilder({ page }).analyze())
  if (paused.violations.length) report['pause'] = paused.violations

  // 模态二：设置弹窗（用鼠标点行名：菜单行数随登录态变化，数箭头很脆）
  await page.click('[data-testid="pause-settings"]')
  await expect(page.locator('[data-testid="settings-dialog"]')).toBeVisible()
  const settings = scanViolations(await new AxeBuilder({ page }).analyze())
  if (settings.violations.length) report['settings'] = settings.violations
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // 模态三：登录弹窗 —— 必须在**未登录**的页面上开（登录态那一行的动作是「退出登录」）。
  // 新开一个 page：`superuser()` 的两处打桩都是页级的，新页面天然是匿名态
  const anon = await page.context().newPage()
  await anon.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await anon.goto('/')
  await scan(anon)
  await anon.keyboard.press('p')
  await anon.click('[data-testid="pause-account"]')
  await expect(anon.locator('[data-testid="login-dialog"]')).toBeVisible()
  const login = scanViolations(await new AxeBuilder({ page: anon }).analyze())
  if (login.violations.length) report['login'] = login.violations
  await anon.close()

  expect(report, `这些位置出现了清单外的违规：${JSON.stringify(report, null, 1)}`).toEqual({})
})

test('a11y 收口：/about 那条「可滚动区域」放行有等价的键盘路径', async ({ page }) => {
  await page.goto('/about')
  await scan(page)

  // 前提：这一页确实比屏幕高（否则这条断言就是空转）
  const scrollable = await page.evaluate(() => {
    const el = document.querySelector('.screen-inner') as HTMLElement
    return el.scrollHeight - el.clientHeight
  })
  expect(scrollable, '关于页要比屏幕高，这条补偿断言才有意义').toBeGreaterThan(100)

  // 前提：**可滚动容器自己**里面没有可聚焦元素（axe 就是因此判定「键盘够不到」）。
  // 注意范围是 `.screen-inner`：标签栏在它外面，`.screen` 里当然有可聚焦的页签
  const focusables = await page.evaluate(
    () => document.querySelectorAll('.screen-inner a[href]').length,
  )
  expect(focusables, '关于页正文里没有可聚焦元素，这正是那条放行的原因').toBe(0)

  // 补偿物：键盘真的滚得动（方向键 + 整屏键两条路径）
  await page.evaluate(() => {
    ;(document.querySelector('.screen-inner') as HTMLElement).scrollTop = 0
  })
  await page.keyboard.press('ArrowDown')
  await expect
    .poll(() => page.evaluate(() => (document.querySelector('.screen-inner') as HTMLElement).scrollTop))
    .toBeGreaterThan(0)

  await page.evaluate(() => {
    ;(document.querySelector('.screen-inner') as HTMLElement).scrollTop = 0
  })
  await page.keyboard.press('PageDown')
  await expect
    .poll(() => page.evaluate(() => (document.querySelector('.screen-inner') as HTMLElement).scrollTop))
    .toBeGreaterThan(64)
})

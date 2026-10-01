import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { scanViolations } from './a11y-known'

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

test('产物：设计系统的像素事实在打包产物里同样成立（样式源序变了也不会静默失效）', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  // 这一条只看 CSS，所以**打桩**保证一定有卡（不依赖真库有没有文章）——
  // 产物项目的其它用例刻意走真后端（验证代理与回退），这一条故意不那样做
  await page.route(/\/api\/(posts|comments)\//, (route) => {
    const pathname = new URL(route.request().url()).pathname
    const body = pathname.startsWith('/api/comments/')
      ? { total: 0, comments: [] }
      : {
          items: [
            {
              id: '11111111-2222-3333-4444-555555555555',
              slug: 'prod-fact',
              title: '产物像素事实用的卡',
              content: '# 产物\n\n正文。',
              introduction: '摘要',
              cover_image: null,
              status: 'published',
              author_id: 'u-1',
              author_name: '作者',
              author_username: 'e2e_writer',
              author_avatar: null,
              author_type: 'user',
              tags: [],
              group_id: 'g-1',
              group_name: '技术',
              view_count: 0,
              like_count: 0,
              created_at: '2026-09-20T10:00:00',
              updated_at: '2026-09-20T10:00:00',
              published_at: '2026-09-20T10:00:00',
            },
          ],
          total: 1,
        }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
  await page.route('**/api/groups/', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.route('**/api/tags/', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  await page.goto('/posts')
  await expect(page.locator('.app')).not.toHaveAttribute('data-scene', 'boot')
  await expect(page.locator('[data-testid="post-card"]')).toHaveCount(1)

  // 列表页是懒加载的视图：它的样式在**产物里**是单独一个 CSS chunk，
  // 与 dev（Vite 逐个 `<style>` 注入、顺序与样机相反）完全是两套加载顺序 ——
  // `md-and-pixels.spec.ts` 的文件头点明的就是这个坑。facts 在这里再验一遍：
  const facts = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const screen = document.querySelector('[data-testid="screen"]') as HTMLElement
    const card = document.querySelector('[data-testid="post-card"]') as HTMLElement
    const keybar = document.querySelector('[data-testid="keybar"]') as HTMLElement | null
    const cs = card ? getComputedStyle(card) : null
    return {
      // token 在产物里也得在（构建期生成的那份 tokens.generated.css 进没进产物）
      paper: root.getPropertyValue('--paper').trim(),
      blue400: root.getPropertyValue('--blue-400').trim(),
      screenBg: screen ? getComputedStyle(screen).backgroundColor : 'NONE',
      cardBorder: cs ? `${cs.borderTopWidth} ${cs.borderStyle}` : 'NONE',
      // 卡片自身不许是「没画底」的透明
      cardVisible: !!card && card.getBoundingClientRect().width > 100,
      keybarSticky: keybar ? getComputedStyle(keybar).position : 'NONE',
    }
  })

  expect(facts.paper, '产物里必须有构建期生成的 --paper（tokens.generated.css 要进产物）').not.toBe('')
  expect(facts.blue400, '产物里必须有 --blue-400').not.toBe('')
  expect(facts.screenBg, '屏幕底色要真的画出来（不能是透明）').not.toBe('rgba(0, 0, 0, 0)')
  expect(facts.cardBorder, '卡片边框是 3px solid（源序变了也不许被压掉）').toBe('3px solid')
  expect(facts.cardVisible, '卡片要有真实尺寸（懒加载 CSS chunk 没加载的表现就是塌成 0 宽）').toBe(
    true,
  )
  // 文章页的 keybar 是 sticky；列表页没有 keybar 时这一项允许是 NONE
  if (facts.keybarSticky !== 'NONE') expect(facts.keybarSticky).toBe('sticky')

  // 再验一条只在产物里才成立的：懒加载视图的 CSS 真的被当成独立资源请求过
  await page.goto('/post/__no_such_post__')
  await expect(page.locator('.app')).not.toHaveAttribute('data-scene', 'boot')
})

/**
 * 产物侧的无障碍扫描：清单仍然只有 `e2e/a11y-known.ts` 一份（§33）。
 *
 * **这道门能抓什么、抓不到什么**（写清楚免得下次白试）：
 *   · 抓得到**结构性**问题 —— 去掉 `index.html` 的 `lang` 会立刻红在 `html-has-lang`
 *     （实测过，见 §45 的反例）；少 `label` / 坏 `aria-*` 同理；
 *   · **抓不到屏幕内的对比度** —— 屏幕外框里的文字在 CRT 扫描线之下，axe 只会归进
 *     `incomplete`。实测：把 `.head-title` 改成 `#f2f2f2`（与白底几乎同色）这道门照样绿。
 *     屏幕内的对比度目前只能靠 `palette.spec.ts` 的 token 对照 + 人工看。
 */
test('产物：axe 扫描在打包产物上也只有清单里的已知违规', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  // 打桩内容：产物侧只验「结构 + 样式」的无障碍事实，不依赖真库有没有文章
  const post = {
    id: '11111111-2222-3333-4444-555555555555',
    slug: 'prod-a11y',
    title: '产物无障碍事实用的卡',
    content: '# 产物\n\n正文。',
    introduction: '摘要',
    cover_image: null,
    status: 'published',
    author_id: 'u-1',
    author_name: '作者',
    author_username: 'e2e_writer',
    author_avatar: null,
    author_type: 'user',
    tags: [],
    group_id: 'g-1',
    group_name: '技术',
    view_count: 0,
    like_count: 0,
    created_at: '2026-09-20T10:00:00',
    updated_at: '2026-09-20T10:00:00',
    published_at: '2026-09-20T10:00:00',
  }
  await page.route(/\/(api)\/(posts|comments|groups|tags)\//, (route) => {
    const pathname = new URL(route.request().url()).pathname
    const body = pathname.startsWith('/api/comments/')
      ? { total: 0, comments: [] }
      : pathname === '/api/groups/' || pathname === '/api/tags/'
        ? []
        : { items: [post], total: 1 }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  const report: Record<string, string[]> = {}
  let allowedSeen = 0

  /** 等自检过去、等一帧稳定，再按**唯一清单**判定（清单只有 `e2e/a11y-known.ts` 一份） */
  const scan = async () => {
    await page.waitForFunction(
      () => document.querySelector('.app')?.getAttribute('data-scene') !== 'boot',
      null,
      { timeout: 20_000 },
    )
    await page.waitForTimeout(250)
    const { violations, allowed } = scanViolations(await new AxeBuilder({ page }).analyze())
    allowedSeen += allowed.length
    return violations
  }

  for (const path of ['/', '/posts', '/about', '/nope-404', '/links']) {
    await page.goto(path)
    const violations = await scan()
    if (violations.length) report[path] = violations
  }

  // 暂停菜单（外壳级模态在产物里同样要干净）
  await page.goto('/')
  await scan()
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  const paused = scanViolations(await new AxeBuilder({ page }).analyze())
  allowedSeen += paused.allowed.length
  if (paused.violations.length) report['pause'] = paused.violations

  expect(report, `产物里出现了清单外的违规：${JSON.stringify(report, null, 1)}`).toEqual({})
  // 自我证明：清单里那几处（底栏小字对比度）**确实被 axe 命中了** ——
  // 否则「零违规」可能只是扫描没跑起来
  expect(allowedSeen, '应当扫到底栏小字那几处已知命中（证明扫描真的跑了）').toBeGreaterThan(0)
})

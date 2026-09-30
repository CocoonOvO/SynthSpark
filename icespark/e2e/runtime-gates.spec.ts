import { expect, test, type Page, type Route } from '@playwright/test'

import { booted } from './helpers'

/**
 * P2 运行期门：样机 `design/icespark-prototype/e2e/gates.mjs` 里冻结的两条断言，
 * 生产版此前**只有静态等价物、没有运行期版本**。
 *
 * 为什么非要运行期这一份：
 * `scripts/check-independence.mjs` 的 STORAGE_KEY 门（第 7 条）只看**字面量** ——
 * `localStorage.setItem('x')` 这种。可生产的键名全都长在常量里再传进去
 * （`src/config/prefs.ts` 的 `NS`、`src/api/client.ts` 的 `TOKEN_KEY`、
 * `src/stores/auth.ts` 的 `LS_USER`），静态门根本照不到。
 * 那份文件头注释亲口写着「靠 P2 的运行时门（枚举 localStorage）兜底」——
 * 这就是那道兜底。同理，「前端只打本站 /api、不猜后端内部路径」也只有真跑一段旅程才算数。
 *
 * 三条门：
 *   A 运行期资源请求全部落在本站（每一条的 origin 都等于当时页面的 origin，
 *     且所有 fetch/xhr 都在 `/api/` 之下）
 *   B localStorage / sessionStorage 键前缀的**运行时**枚举（含反向自证：门真的会响）
 *   C 动效开关真的生效（`data-motion=off` 且 `.blink` 的计算值是 `animation: none`）
 *
 * 打桩手法与同目录既有 spec 一致（`pause.spec.ts` / `skeleton.spec.ts`）：
 * - `page.addInitScript` 写 `synthspark-icespark-sound-prompt=1` 跳过首次音效询问；
 * - 所有接口桩走**一条**正则 route 内部分派 —— Playwright 里多条 route 同时命中时
 *   只有最后注册的那条生效，分散注册会互相盖掉；
 * - 每次 `goto` 之后 `await booted(page)`（开机自检会吃掉第一次按键，见 helpers.ts）。
 *
 * 夹具口径：文章 slug 用固定夹具 `e2e-fixture-slug`，不依赖后端此刻有没有数据，
 * 因此用例不会因为库里空了而 `skip`（那道门就白设了）。
 */

/** 夹具 slug：详情页用它拼 `/post/:key` */
const FIXTURE_SLUG = 'e2e-fixture-slug'

/** 列表项夹具（`PostListItem`） */
const FIXTURE_LIST_ITEM = {
  id: 'e2e-post-1',
  title: '夹具文章',
  slug: FIXTURE_SLUG,
  introduction: '运行期门夹具',
  cover_image: null,
  author_name: '夹具作者',
  author_username: 'e2e_author',
  author_avatar: null,
  author_type: 'user',
  tags: [],
  group_name: '夹具分组',
  view_count: 1,
  like_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  status: 'published',
}

/** 详情夹具（`Post`） */
const FIXTURE_POST = {
  id: 'e2e-post-1',
  title: '夹具文章',
  content: '# 夹具文章\n\n这是运行期门的正文夹具。',
  introduction: '运行期门夹具',
  cover_image: null,
  status: 'published',
  slug: FIXTURE_SLUG,
  author_id: 'e2e-author',
  author_name: '夹具作者',
  author_username: 'e2e_author',
  author_avatar: null,
  author_type: 'user',
  group_id: 'e2e-group',
  group_name: '夹具分组',
  tags: [],
  view_count: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  published_at: '2026-01-01T00:00:00Z',
}

/** 外链夹具（`ExternalLink`） */
const FIXTURE_LINK = {
  id: 'e2e-link-1',
  name: '夹具外链',
  url: '/about',
  cover_image: null,
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

/** 分组夹具（`Group`） */
const FIXTURE_GROUP = {
  id: 'e2e-group',
  name: '夹具分组',
  description: null,
  icon: null,
  sort_order: 0,
  post_count: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

/** 登录后 `/api/auth/me` 回的用户（同时决定菜单行与 `synthspark-icespark-user` 的内容） */
const FIXTURE_USER = {
  id: 'e2e-user-id',
  username: 'e2e_user',
  display_name: '夹具用户',
  avatar_url: null,
  user_type: 'user',
  is_superuser: false,
}

/** 统一的 JSON 响应 */
function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

/**
 * 装好这一组用例要用的全部接口桩：**单条正则 route 内部分派**。
 *
 * `POST /api/auth/token` 与 `GET /api/auth/me` 都给成功夹具 ——
 * B 用例走真实的登录弹窗路径，假令牌打真后端只会拿 401。
 */
async function stubApi(page: Page): Promise<void> {
  await page.route(/\/api\//, (route) => {
    const { pathname } = new URL(route.request().url())

    // ── 账号 ──
    if (pathname === '/api/auth/token') {
      return json(route, 200, { access_token: 'e2e-token', token_type: 'bearer' })
    }
    if (pathname === '/api/auth/me') return json(route, 200, FIXTURE_USER)

    // ── 站点配置与统计（外壳与首页要读） ──
    if (pathname === '/api/site-config') return json(route, 200, {})
    if (pathname === '/api/stats/summary') {
      return json(route, 200, { agent_count: 0, post_count: 1, total_views: 1 })
    }

    // ── 内容 ──
    if (pathname === '/api/links/') return json(route, 200, [FIXTURE_LINK])
    if (pathname === '/api/groups/') return json(route, 200, [FIXTURE_GROUP])
    if (pathname === '/api/tags/') return json(route, 200, [])
    if (pathname.startsWith('/api/comments/post/')) {
      return json(route, 200, { total: 0, comments: [] })
    }
    // 详情必须先判：`/api/posts/slug/x` 也 `startsWith('/api/posts/')`
    if (pathname.startsWith('/api/posts/slug/')) return json(route, 200, FIXTURE_POST)
    if (pathname === '/api/posts/') {
      return json(route, 200, { items: [FIXTURE_LIST_ITEM], total: 1 })
    }
    // `fetchPost` 猜错接口时的兜底那一条（id 形状）
    if (pathname.startsWith('/api/posts/')) return json(route, 200, FIXTURE_POST)

    // 没预料到的接口：放它走真后端（同源），只记数不当失败
    return route.continue()
  })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
})

test('A · 运行期资源请求全部落在本站：整段旅程零外站域、API 全在 /api/ 之下', async ({ page }) => {
  await stubApi(page)

  // 收集整段旅程的请求。`origin` 记录的是**那一刻页面的 origin** —— 由 document 请求自己更新，
  // 这样断言「每一条请求都等于当前页面的 origin」而不是「都等于某个写死的常量」。
  const seen: { url: string; type: string; origin: string }[] = []
  let pageOrigin = ''
  page.on('request', (req) => {
    const url = req.url()
    if (req.resourceType() === 'document') pageOrigin = new URL(url).origin
    seen.push({ url, type: req.resourceType(), origin: pageOrigin })
  })

  // 一段完整旅程：首页 → 列表 → 详情 → 关于 → 关联
  for (const path of ['/', '/posts', `/post/${FIXTURE_SLUG}`, '/about', '/links']) {
    await page.goto(path)
    await booted(page)
  }

  // websocket 是 Vite HMR 的常驻连接，不属于「资源请求」，按门的口径排除
  const requests = seen.filter((r) => r.type !== 'websocket')
  const appOrigin = new URL(page.url()).origin
  const describe = (r: { url: string; type: string }) => `${r.type} ${r.url}`

  // ① 每一条请求的 origin 都等于当时页面的 origin
  const crossOrigin = requests.filter((r) => new URL(r.url).origin !== r.origin)
  expect(crossOrigin.map(describe), '有请求的 origin 不是它发出时所在页面的 origin').toEqual([])

  // ② 没有任何请求打到外站域
  const outsiders = requests.filter((r) => new URL(r.url).origin !== appOrigin)
  expect(outsiders.map(describe), '有请求打到了外站域').toEqual([])

  // ③ 前端只猜 `/api/`：所有**后端调用**（fetch/xhr）的路径名都以 `/api/` 开头。
  //    静态资源要排掉 —— `public/site.config.json` 也是用 `fetch()` 读的站内文件，
  //    它走的是 Vite 静态服务而不是后端（样机同一条门也是这么排的）。
  const STATIC_ASSET = /\.(js|mjs|css|map|json|woff2?|ttf|otf|png|jpe?g|gif|svg|ico|webp)(\?|$)/i
  const apiCalls = requests.filter(
    (r) => (r.type === 'fetch' || r.type === 'xhr') && !STATIC_ASSET.test(new URL(r.url).pathname),
  )
  const strayApi = apiCalls.filter((r) => !new URL(r.url).pathname.startsWith('/api/'))
  expect(strayApi.map(describe), '有后端调用绕开了 /api/ 前缀').toEqual([])
  // 补一条同义的正向检查：这些后端调用**确实**在打 `/api/`（免得筛子太密把门筛空）
  expect(apiCalls.some((r) => new URL(r.url).pathname.startsWith('/api/'))).toBe(true)

  // 门不能是空的：旅程真的发出了请求，也真的打了 API
  expect(requests.length).toBeGreaterThan(0)
  expect(apiCalls.length).toBeGreaterThan(0)

  console.log(
    `[A 运行期请求门] 共 ${requests.length} 条请求、外站 ${outsiders.length} 条` +
      `（另排除 websocket ${seen.length - requests.length} 条）、走 /api/ 的 ${apiCalls.length} 条、跨 origin ${crossOrigin.length} 条`,
  )
})

test('B · 存储键运行时枚举门：每一个键都以 synthspark 开头（含反向自证）', async ({ page }) => {
  await stubApi(page)
  await page.goto('/')
  await booted(page)

  // 开机 → 开暂停菜单
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()

  // 切一次音效（菜单行序：继续 / 搜索 / 音效 / 登录 / 设置 / 返回主菜单）
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="pause-sound"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="pause-sound"] .seg-cell.on')).toHaveText('ON')
  // 底栏软键与菜单行同一个事实（切换真的落到了状态上，不只是改了个 class）
  await expect(page.locator('[data-testid="softkey-sound"]')).toHaveText(/ON/)

  // 进设置：改每页条数与动效（各写一把键）
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="pause-settings"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="settings-dialog"]')).toBeVisible()

  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="set-pageSize"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="set-pageSize"]')).toContainText('6')

  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="set-motion"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowRight')

  // 再登录一次：走真实的登录弹窗路径，令牌与用户都由桩给。
  // 这一步会写出 `synthspark-token`（client 的 TOKEN_KEY）与 `synthspark-icespark-user`（auth store）
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="settings-dialog"]')).toHaveCount(0)
  await page.click('[data-testid="pause-account"]')
  await expect(page.locator('[data-testid="login-dialog"]')).toBeVisible()
  await page.fill('[data-testid="login-username"]', 'e2e_user')
  await page.fill('[data-testid="login-password"]', 'e2e-pass')
  await page.click('[data-testid="login-submit"]')
  await expect(page.locator('[data-testid="login-dialog"]')).toHaveCount(0)

  // 判定逻辑写在页面里跑一遍：枚举两个 storage，取回违规键名清单。
  // 反向自证（很重要）：先塞一个**故意违规**的键 `probe_x`，判定函数必须认出它（长度 1），
  // 再删掉探针 —— 否则这道门可能是个永远打 PASS 的假门。
  const report = await page.evaluate(() => {
    const violations = (keys: string[]): string[] => keys.filter((k) => !k.startsWith('synthspark'))

    const local = Object.keys(localStorage)
    const session = Object.keys(sessionStorage)

    localStorage.setItem('probe_x', '1')
    const caught = violations(Object.keys(localStorage))
    localStorage.removeItem('probe_x')

    return { local, session, caught, afterProbe: violations(Object.keys(localStorage)) }
  })

  // 反向自证：门真的会响
  expect(report.caught, '判定函数没认出故意违规的探针键，这道门是假的').toEqual(['probe_x'])
  expect(report.afterProbe, '探针键没删干净').toEqual([])

  // 正向：会话里确实产生了键（门不能因为「一个键都没有」而空过）
  expect(report.local).toContain('synthspark-icespark-page-size')
  expect(report.local).toContain('synthspark-icespark-motion')
  expect(report.local).toContain('synthspark-token')
  expect(report.local).toContain('synthspark-icespark-user')
  // 开关真的切过：音效 ON、动效关 → '0'
  expect(report.local).toContain('synthspark-icespark-sound')

  // 两个 storage 的每一个键都带前缀
  const badLocal = report.local.filter((k) => !k.startsWith('synthspark'))
  const badSession = report.session.filter((k) => !k.startsWith('synthspark'))
  expect(badLocal, `localStorage 有不合规的键：${badLocal.join(', ')}`).toEqual([])
  expect(badSession, `sessionStorage 有不合规的键：${badSession.join(', ')}`).toEqual([])

  console.log(
    `[B 存储键门] localStorage ${report.local.length} 个：${report.local.join(', ')}` +
      ` | sessionStorage ${report.session.length} 个：${report.session.join(', ') || '（空）'}`,
  )
})

test('C · 动效开关真的生效：data-motion=off 时 blink 元素的计算动画是 none', async ({ page }) => {
  await stubApi(page)
  // 404 兜底页有一个**常驻**的 `.blink` 光标（`.terminal-cursor.blink`），
  // 不像列表页的加载态那样一闪就没，是量「动效开关」最稳的取样点
  await page.goto('/no/such/path')
  await booted(page)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'error')

  const cursor = page.locator('.terminal-cursor.blink')
  await expect(cursor).toBeVisible()

  // 基线：动效开着时它真的在闪（否则下面的 none 断言毫无意义）
  const animName = () => cursor.evaluate((el) => getComputedStyle(el).animationName)
  expect(await animName()).not.toBe('none')

  // 打开设置，把动效切到「关」
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="pause-settings"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="settings-dialog"]')).toBeVisible()

  // 设置行序：音效 / 每页条数 / 动效
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="set-motion"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowRight')

  await expect(page.locator('.app')).toHaveAttribute('data-motion', 'off')
  await expect(page.locator('[data-testid="set-motion"]')).toContainText('关')
  // 关键：不是只写了属性，而是动画**真的**停了
  // （src/styles/pixel.css 的 `.app[data-motion="off"] .blink{animation:none!important}`）
  expect(await animName(), 'data-motion=off 但 blink 还在跑动画').toBe('none')

  // 切回「开」：属性与计算动画都要回来
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.app')).toHaveAttribute('data-motion', 'on')
  await expect(page.locator('[data-testid="set-motion"]')).toContainText('开')
  expect(await animName(), '切回开之后 blink 应该重新有动画').not.toBe('none')

  console.log(`[C 动效门] off → data-motion=off 且 animationName=none；on → animationName=${await animName()}`)
})

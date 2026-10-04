import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { scanViolations } from './a11y-known'

import { booted } from './helpers'

/**
 * P5 审计日志页（`/admin/audit`）的用例。
 *
 * 两条自我约束（与 `user-profile.spec.ts` / `admin-guard.spec.ts` 同一口径）：
 *
 * 1. **不写死真令牌 / 真密码**（架构 §23.4）。登录态的做法是 `page.addInitScript` 写两把键 ——
 *    `synthspark-token`（假串 `e2e-token`）与 `synthspark-icespark-user`（JSON 里带
 *    `is_superuser`）—— 然后**必须**用 `page.route()` 把这一页要调的接口全换成夹具响应。
 *    `/api/auth/me` 也要桩：外壳挂载时会 `auth.bootstrapAuth()` 静默校验一次，
 *    假令牌打真接口拿 401，`stores/auth.ts` 的 `loadMe()` 会登出并清掉缓存，
 *    表现就是「守卫放行了、页面却按未登录渲染」（§23.4 记过这个坑）。
 *    初始化函数写在本文件里 —— 公共的 `e2e/helpers.ts` 只放 `booted()`，别去动它。
 *
 * 2. **不依赖真后端的记录**：真库现在只有 1 条日志，条数 / 内容随时会变，
 *    所以除「深链接能打开」这一条之外，全部用夹具把「两条一页、两页 12 条、空、500」
 *    这些形态钉死 —— 分页要验的是「请求带上 limit/offset + 内容跟着变」，
 *    真后端只有一条时这件事根本验不了。
 *
 * 这一页验的是**页面自己**的东西（接口 / 四态 / 折叠 / 分页 / 键盘）；
 * 「未登录深链接被守卫送回主页」由 `admin-guard.spec.ts` 负责，不在这里重复。
 */

/** 夹具：一条站点配置审计日志（字段与 `api/admin.ts` 的 `SiteConfigAuditLog` 一致） */
interface AuditLogFixture {
  id: number
  admin_id: string
  admin_username: string
  action: string
  old_value: unknown
  new_value: unknown
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

/**
 * 只在**未变化**的字段里放一个独一无二的标记。
 *
 * 为什么：摘要（人能读的那部分）只列「变了的字段」，标记放在没变的 `site.name` 里，
 * 就只可能出现在默认折叠的**原文**里 —— 于是「展开前看不到、展开后看得到」是一条
 * 真的断言，而不是碰巧被全文匹配到。
 */
const RAW_MARKER = 'E2E-RAW-MARKER-9F3'

const BASE_OLD = {
  site: { name: RAW_MARKER, title: 'SynthSpark', description: '旧的一句话' },
  navbar: { navItems: [{ label: '首页', path: '/' }] },
  footer: { slogan: '旧的标语' },
}

const BASE_NEW = {
  site: { name: RAW_MARKER, title: 'SynthSpark', description: '新的一句话' },
  navbar: { navItems: [{ label: '首页', path: '/' }] },
  footer: { slogan: '旧的标语' },
}

function logFixture(over: Partial<AuditLogFixture> = {}): AuditLogFixture {
  return {
    id: 7,
    admin_id: 'e2e-admin-id',
    admin_username: 'e2e_boss',
    action: 'update',
    old_value: BASE_OLD,
    new_value: BASE_NEW,
    ip_address: '203.0.113.7',
    user_agent: 'Mozilla/5.0 (e2e-browser) AuditProbe/1.0',
    // 形如后端给的本地时间串（**不是 ISO**）：用例也跟着原样比，钉住「不许套 Date 解析」
    created_at: '2026-09-29 14:11:48',
    ...over,
  }
}

/** 登录态：两把 localStorage 键 + `/api/auth/me` 回同一份用户（§23.4） */
async function loggedIn(page: Page, isSuperuser: boolean): Promise<void> {
  const user = {
    username: isSuperuser ? 'e2e_boss' : 'e2e_user',
    display_name: isSuperuser ? '测试超管' : '测试用户',
    is_superuser: isSuperuser,
  }
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

/** 审计接口的请求地址（`urls` 传进来就顺手记下每次请求，验 offset/limit 用） */
const AUDIT_URL = /\/api\/admin\/site-config\/audit-logs/

/** 把审计接口桩成「按 offset 取第几页」的两页夹具；返回记录到的请求 URL */
async function stubTwoPages(page: Page): Promise<string[]> {
  const urls: string[] = []
  const pages: Record<string, unknown> = {
    '0': {
      logs: [logFixture(), logFixture({ id: 6, created_at: '2026-09-28 10:00:00' })],
      total: 12,
    },
    '10': { logs: [logFixture({ id: 1, created_at: '2026-09-27 09:00:00' })], total: 12 },
  }
  await page.route(AUDIT_URL, async (route) => {
    const url = new URL(route.request().url())
    urls.push(url.toString())
    const key = url.searchParams.get('offset') ?? '0'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(pages[key] ?? { logs: [], total: 0 }),
    })
  })
  return urls
}

test.beforeEach(async ({ page }) => {
  // 首次按键会被音效询问框吃掉（与其它 spec 同一手法），用例里预置成「问过了」
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
})

test('超管深链接打开：操作人 / 动作 / 时间原样渲染，方向键与 Q / ESC 都归外壳', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))

  await loggedIn(page, true)
  await page.route(AUDIT_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ logs: [logFixture()], total: 1 }),
    }),
  )

  await page.goto('/admin/audit')
  await booted(page)

  // 场景 / URL 都对（底栏那一排是导航场景，管理页不占格，所以 .app 的 data-scene 是它自己）
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'admin-audit')
  await expect(page).toHaveURL(/\/admin\/audit$/)
  await expect(page.locator('[data-testid="deck"]')).toBeVisible()

  // 自带可见 h1（App.vue 的 SELF_TITLED_SCENES 里含 admin-audit，外壳不再发隐藏 h1）
  await expect(page.locator('main h1')).toHaveText('审计日志')

  const log = page.locator('[data-testid="audit-log"]').first()
  await expect(log).toBeVisible()
  await expect(log.locator('[data-testid="audit-actor"]')).toHaveText('e2e_boss')
  await expect(log.locator('[data-testid="audit-action"]')).toHaveText('update')
  // 时间逐字渲染：后端给的是 `2026-09-29 14:11:48`，不是 ISO，套 Date 解析会变成别的东西
  await expect(log.locator('[data-testid="audit-time"]')).toHaveText('2026-09-29 14:11:48')
  await expect(log.locator('[data-testid="audit-ip"]')).toContainText('203.0.113.7')
  // 人能读的摘要：变了的字段进了明细，段级芯片说明动到哪一段
  await expect(log.locator('[data-testid="audit-summary"]')).toContainText('site')
  await expect(log.locator('[data-testid="audit-change-path"]').first()).toHaveText(
    'site.description',
  )
  // h2：h1 → h2 不跳级
  await expect(log.locator('h2')).toHaveText('保存站点配置')

  // 读数行与页脚键位提示
  await expect(page.locator('[data-testid="audit-total"]')).toHaveText('共 1 条')
  await expect(page.locator('[data-testid="audit-position"]')).toHaveText('第 1 / 1 页')
  await expect(page.locator('.foot')).toContainText('Q 返回')
  await expect(page.locator('.foot')).toContainText('ESC 菜单')

  // 方向键：焦点开局在第一条记录上；第一条再往上 → 页头返回键；再往下回到列表
  await expect(log).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowUp')
  await expect(page.locator('[data-testid="audit-back"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowDown')
  await expect(log).toHaveClass(/is-focused/)

  // ESC **不消费**：交还全局呼出暂停菜单（本页没有中间态要退），再按一次关掉
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)

  // Q：深链接进来历史里没有上一页 → 兜底回主页（键盘用户不会卡在审计页）
  await page.keyboard.press('q')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'home')

  expect(errors).toEqual([])
})

test('大 JSON 默认折叠：展开前看不到配置内容，改动 / 未变 / 首次保存三种摘要各自说人话', async ({
  page,
}) => {
  await loggedIn(page, true)
  await page.route(AUDIT_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        logs: [
          // 0：有改动 → 给字段明细
          logFixture(),
          // 1：前后一模一样 → 「本次保存与上一次内容相同」
          logFixture({ id: 6, old_value: BASE_NEW, new_value: BASE_NEW }),
          // 2：旧值是空的 → 「首次保存」（新值里不含标记串，免得把标记的可见性断言搅浑）
          logFixture({
            id: 5,
            old_value: null,
            new_value: { site: { name: '首次配置', description: '第一次保存' } },
          }),
        ],
        total: 3,
      }),
    }),
  )

  await page.goto('/admin/audit')
  await booted(page)
  await expect(page.locator('[data-testid="audit-log"]').first()).toBeVisible()

  // 摘要先说人话：没变的那条不会被列成「改动」，首次保存不假装有旧值
  await expect(page.locator('[data-testid="audit-log"]').nth(1)).toContainText(
    '本次保存与上一次内容相同',
  )
  await expect(page.locator('[data-testid="audit-log"]').nth(2)).toContainText('首次保存')

  // 默认折叠：原文区根本不在 DOM 里，标记串也不在正文里
  await expect(page.locator('[data-testid="audit-raw"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="audit-page"]')).not.toContainText(RAW_MARKER)
  await expect(page.locator('[data-testid="audit-toggle"]').first()).toContainText('展开原文')

  // 键盘路径：焦点开局在第一条上，ENTER 展开
  await expect(page.locator('[data-testid="audit-log"]').first()).toHaveClass(/is-focused/)
  await page.keyboard.press('Enter')

  const raw = page.locator('[data-testid="audit-raw"]').first()
  await expect(raw).toBeVisible()
  // 展开后才看得到原文里的配置内容（标记只出现在没变的字段上，所以只可能来自原文）
  await expect(raw).toContainText(RAW_MARKER)
  await expect(raw).toContainText('old_value')
  await expect(page.locator('[data-testid="audit-toggle"]').first()).toContainText('收起原文')

  // 再按一次收起，原文区回到不在 DOM 的状态
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="audit-raw"]')).toHaveCount(0)

  // 鼠标路径等价：点展开按钮能展开（按钮上 .stop，不会和卡片的点击互相抵消）
  await page.locator('[data-testid="audit-toggle"]').first().click()
  await expect(page.locator('[data-testid="audit-raw"]').first()).toBeVisible()
})

test('分页：PgDn / 下一页按钮都带上 limit 与 offset，内容跟着换页', async ({ page }) => {
  await loggedIn(page, true)
  const urls = await stubTwoPages(page)

  await page.goto('/admin/audit')
  await booted(page)
  await expect(page.locator('[data-testid="audit-log"]').first()).toBeVisible()

  // 第一页：offset=0，limit 固定 10
  expect(urls).toHaveLength(1)
  const first = new URL(urls[0] ?? '')
  expect(first.searchParams.get('offset')).toBe('0')
  expect(first.searchParams.get('limit')).toBe('10')
  await expect(page.locator('[data-testid="audit-position"]')).toHaveText('第 1 / 2 页')
  await expect(page.locator('[data-testid="audit-time"]').first()).toHaveText('2026-09-29 14:11:48')

  // 键盘翻页之一：PgDn → 请求 offset=10，内容换成第二页
  const pageTwo = page.waitForRequest(
    (request) => request.url().includes('offset=10') && request.url().includes('limit=10'),
  )
  await page.keyboard.press('PageDown')
  await pageTwo
  await expect(page.locator('[data-testid="audit-position"]')).toHaveText('第 2 / 2 页')
  await expect(page.locator('[data-testid="audit-time"]').first()).toHaveText('2026-09-27 09:00:00')

  // 键盘翻页之二：PgUp 回第一页（这一次走上一页的 offset=0）
  const backToOne = page.waitForRequest(
    (request) => request.url().includes('offset=0') && request.url().includes('limit=10'),
  )
  await page.keyboard.press('PageUp')
  await backToOne
  await expect(page.locator('[data-testid="audit-position"]')).toHaveText('第 1 / 2 页')
  await expect(page.locator('[data-testid="audit-time"]').first()).toHaveText('2026-09-29 14:11:48')

  // 键盘翻页之三：方向键走到翻页行，ENTER 就是「下一页」（不靠 PgDn 也能翻）
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="audit-next"]')).toHaveClass(/is-focused/)
  const byArrow = page.waitForRequest((request) => request.url().includes('offset=10'))
  await page.keyboard.press('Enter')
  await byArrow
  await expect(page.locator('[data-testid="audit-position"]')).toHaveText('第 2 / 2 页')

  // 鼠标翻页：点「上一页」→ 请求回到 offset=0，内容也回来
  const pageOne = page.waitForRequest(
    (request) => request.url().includes('offset=0') && request.url().includes('limit=10'),
  )
  await page.locator('[data-testid="audit-prev"]').click()
  await pageOne
  await expect(page.locator('[data-testid="audit-position"]')).toHaveText('第 1 / 2 页')
  await expect(page.locator('[data-testid="audit-time"]').first()).toHaveText('2026-09-29 14:11:48')

  // 四次翻页每一页值都真的打到接口一次，且 limit 一律 10（没有偷偷复用上一页的数据）
  expect(urls.every((url) => new URL(url).searchParams.get('limit') === '10')).toBe(true)
  expect(urls.map((url) => new URL(url).searchParams.get('offset'))).toEqual([
    '0',
    '10',
    '0',
    '10',
    '0',
  ])
})

test('总数正好是每页条数的整数倍时，「下一页」是灰的（不多翻出一张空页）', async ({ page }) => {
  // 后端曾把 `total` 写成 `len(logs)`（本页条数），前端为此加过一条「本页满页也算还有下一页」
  // 的兜底。后端修好之后兜底已删：留着的后果正是这个用例 —— 一页装满是 10 条、总数也正好 10 条，
  // 兜底仍然判定「可能还有」，点下去是空页。这里把「按 total 算」钉死。
  await loggedIn(page, true)
  await page.route(AUDIT_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        logs: Array.from({ length: 10 }, (_, i) => logFixture({ id: 30 - i })),
        total: 10,
      }),
    }),
  )

  await page.goto('/admin/audit')
  await booted(page)

  await expect(page.locator('[data-testid="audit-log"]')).toHaveCount(10)
  await expect(page.locator('[data-testid="audit-total"]')).toHaveText('共 10 条')
  await expect(page.locator('[data-testid="audit-position"]')).toHaveText('第 1 / 1 页')
  // 只有一页：翻页行在（记录不止一条），但两个方向都不可用
  await expect(page.locator('[data-testid="audit-next"]')).toBeDisabled()
  await expect(page.locator('[data-testid="audit-prev"]')).toBeDisabled()
})

test('空态：一条记录都没有时给人话，不是空白页', async ({ page }) => {
  await loggedIn(page, true)
  await page.route(AUDIT_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ logs: [], total: 0 }),
    }),
  )

  await page.goto('/admin/audit')
  await booted(page)

  await expect(page.locator('[data-testid="audit-empty"]')).toBeVisible()
  await expect(page.locator('[data-testid="audit-empty"]')).toContainText(
    '还没有任何站点配置的保存记录',
  )
  await expect(page.locator('[data-testid="audit-empty"]')).toContainText('站点设置')
  // h1 与读数行照常在：空态是内容区的事，不是整页消失
  await expect(page.locator('main h1')).toHaveText('审计日志')
  await expect(page.locator('[data-testid="audit-total"]')).toHaveText('共 0 条')
  // 只有一页，不出现翻页行
  await expect(page.locator('[data-testid="audit-pager"]')).toHaveCount(0)
})

test('失败态：把后端 detail 原文显示出来，不白屏', async ({ page }) => {
  await loggedIn(page, true)
  const detail = '审计日志读取失败：配置库暂时不可用'
  await page.route(AUDIT_URL, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ detail }),
    }),
  )

  await page.goto('/admin/audit')
  await booted(page)

  await expect(page.locator('[data-testid="audit-error"]')).toBeVisible()
  // 逐字相等：页面的 failure 文案就是后端那一句（ApiError.message），不自己改写
  await expect(page.locator('[data-testid="audit-error-detail"]')).toHaveText(detail)
  await expect(page.locator('main h1')).toHaveText('审计日志')
  // 没有渲染出任何记录卡
  await expect(page.locator('[data-testid="audit-log"]')).toHaveCount(0)
})

test('非超管：页内「仅超管可见」，既不发审计请求也没有真内容', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))

  await loggedIn(page, false)
  let auditRequests = 0
  await page.route(AUDIT_URL, (route) => {
    auditRequests += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ logs: [logFixture()], total: 1 }),
    })
  })

  await page.goto('/admin/audit')
  await booted(page)

  // 路由照常进去（meta.requiresSuperuser 只是声明，守卫不拦），提示由页面自己给
  await expect(page).toHaveURL(/\/admin\/audit$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'admin-audit')
  await expect(page.locator('[data-testid="audit-denied"]')).toBeVisible()
  await expect(page.locator('[data-testid="audit-denied"]')).toContainText('仅超管可见')
  // 真内容一个都不许有：列表、空态、读数行、翻页、原文
  await expect(page.locator('[data-testid="audit-log"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="audit-list"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="audit-empty"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="audit-readout"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="audit-pager"]')).toHaveCount(0)
  // 前端门只是省一次往返：非超管根本不发这个请求
  expect(auditRequests).toBe(0)
  // h1 仍在（这一页不会变成没有一级标题的页面）
  await expect(page.locator('main h1')).toHaveText('审计日志')

  expect(errors).toEqual([])
})

test('h1 层级：整页一个 h1、条目标题是 h2，axe 无标题类违规', async ({ page }) => {
  await loggedIn(page, true)
  await page.route(AUDIT_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ logs: [logFixture(), logFixture({ id: 6 })], total: 2 }),
    }),
  )

  await page.goto('/admin/audit')
  await booted(page)
  await expect(page.locator('[data-testid="audit-log"]').first()).toBeVisible()

  // 一个 h1（页面名），每条记录一个 h2
  const h1 = page.locator('main h1')
  await expect(h1).toHaveCount(1)
  await expect(h1).toHaveText('审计日志')
  await expect(page.locator('[data-testid="audit-log"] h2')).toHaveCount(2)

  // 展开原文一起扫：h3（原文栏）也在层级里
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="audit-raw"]').first()).toBeVisible()
  await expect(page.locator('main h3').first()).toBeVisible()

  const report = await new AxeBuilder({ page }).analyze()
  const ids = report.violations.map((violation) => violation.id)
  expect(ids).not.toContain('page-has-heading-one')
  expect(ids).not.toContain('heading-order')
  // 展开的原文区是可滚动的：焦点可达（tabindex）也在这一条里守住
  expect(ids).not.toContain('scrollable-region-focusable')
  // 除全站已知的「底栏小字对比度取舍」之外，本页不许带出别的 axe 违规。
  // 放行清单只有一份（`e2e/a11y-known.ts`），这里是**节点级**判定：同一条规则里
  // 只有清单内的那些节点被放行，页面内容区新出现的对比度问题照样拦下来。
  expect(scanViolations(report).violations).toEqual([])
})

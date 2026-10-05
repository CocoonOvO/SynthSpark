import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { scanViolations } from './a11y-known'

import { booted } from './helpers'

/**
 * P5 站点设置页（`/admin/site`，超管）的用例 —— 架构 §23.4 的口径。
 *
 * 这一页的断言全部**不依赖真账号、真后端**：登录态用两把 localStorage 键伪装、
 * `/api/auth/me` 与 `/api/admin/site-config` 全部打桩成夹具（假令牌打真接口只会拿 401，
 * 而且外壳挂载时会 `bootstrapAuth()` 校验一次，不打桩就会被登出、菜单跟着缩水）。
 *
 * 七条用例各自守一件事：
 *  1. 超管深链接能打开，接口给的值真的上了屏（含契约之外的段）；Q 回主页
 *  2. 改一处保存：请求体是**整份** dict，没动过的段原样还在
 *  3. 保存失败：后端 detail 原文可见、页面不崩、改动还在
 *  4. 非超管：页内「仅超管可见」、没有真内容、也不去读配置
 *  5. `h1` 唯一 + `h2` 分节不跳级 + axe 无新增违规
 *  6. 非法 JSON：人话提示（带行号）、保存被拦住、不发请求
 *  7. 读取失败给 detail 原文（error 态）；从没保存过给空态（empty 态）
 */

/** 站点配置是自由结构的 dict（契约里就是两个 additionalProperties） */
type Json = Record<string, unknown>

/**
 * 夹具：五个已知段都有内容，外加一个**契约之外**的段。
 * 那个 `custom` 段是这一份用例的主角之一 —— 页面必须把它原样写回去，
 * 否则「整份 PUT」这条契约就是一句空话。
 */
function fixture() {
  return {
    site: {
      name: 'E2E 站点',
      title: 'E2E 浏览器标题',
      description: 'E2E 站点描述',
      icp: '',
      // 契约 §23.2 列了它，src/config/types.ts 刻意没进类型 —— 页面照样得能改、能带回去
      defaultTheme: 'icespark',
      logo: '',
    },
    navbar: {
      logo: 'E2E 导航',
      navItems: [
        { label: '主页', path: '/' },
        { label: '文章', path: '/posts' },
      ],
    },
    footer: {
      copyright: '2026 E2E',
      slogan: 'E2E 口号',
      links: [{ group: '导航', items: [{ label: '首页', href: '/' }] }],
    },
    home: {
      badge: 'E2E',
      title: 'E2E 首页横幅',
      desc: 'E2E 横幅描述',
      primaryBtn: '主',
      secondaryBtn: '次',
      stats: { creators: '作者', articles: '文章', reads: '总浏览' },
      articles: { title: '最新文章', viewAll: '查看全部' },
      groups: { title: '分组' },
      tags: { title: '标签' },
      allCard: { title: '全部文章', hint: '按分组与标签筛选' },
    },
    about: {
      badge: 'ABOUT',
      title: '关于',
      desc: 'E2E 关于描述',
      facts: [{ key: '站点', value: 'E2E' }],
      body: '## E2E 正文\n\n这是一段用于用例的正文。',
      techStack: { subtitle: '栈', categories: [{ title: '后端', items: ['FastAPI'] }] },
    },
    custom: {
      note: '契约之外的段要原样保留',
      list: [1, 2, 3],
      // 文档型（`kind === 'area'`）的例子：about 段改走专用编辑器之后，
      // 「带展开图标的长文框」这条用例挪到这个契约之外的段上来验
      notes: '## 自定义段的长文\n\n这是一段用于用例的正文。',
    },
  }
}

/**
 * 登录态初始化（§23.4 的手法 2）。
 *
 * 两把键：`synthspark-token`（随便一个假串）与 `synthspark-icespark-user`
 * （外壳先拿它显示昵称与超管标记）。`/api/auth/me` 必须打桩成同一个用户：
 * 外壳挂载时会拿假令牌去校验，真接口回 401 → store 登出并清缓存，
 * 表现是「守卫放行了，菜单却只有 6 行」。
 */
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

/** 打桩站点配置接口：GET 给夹具，PUT 按用例决定（默认成功），并记下每一次请求 */
async function stubAdminSite(
  page: Page,
  options: { get?: { status: number; body: unknown }; put?: { status: number; body: unknown } },
): Promise<{ puts: Json[]; gets: () => number }> {
  const puts: Json[] = []
  let gets = 0

  await page.route('**/api/admin/site-config', async (route) => {
    if (route.request().method() === 'PUT') {
      puts.push(JSON.parse(route.request().postData() ?? '{}') as Json)
      const put = options.put ?? { status: 200, body: { success: true } }
      await route.fulfill({
        status: put.status,
        contentType: 'application/json',
        body: JSON.stringify(put.body),
      })
      return
    }

    gets += 1
    const get = options.get ?? { status: 200, body: {} }
    await route.fulfill({
      status: get.status,
      contentType: 'application/json',
      body: JSON.stringify(get.body),
    })
  })

  return { puts, gets: () => gets }
}

/**
 * 只收未捕获异常。**刻意不收 console error**：这一份用例把接口打桩成 4xx/5xx 时，
 * 浏览器会规规矩矩地给每条失败响应打一行资源错误 —— 那不是页面崩了。
 */
function pageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  return errors
}

/** 按 `a.b.c` 取值（与 e2e/site-config.spec.ts 同一写法） */
function pick(source: unknown, path: string): unknown {
  let node: unknown = source
  for (const key of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Json)[key]
  }
  return node
}

test('站点设置：超管深链接打开，接口给的配置真的上了屏（含契约之外的段）', async ({ page }) => {
  const config = fixture()
  await loggedIn(page, true)
  const stub = await stubAdminSite(page, { get: { status: 200, body: config } })
  const errors = pageErrors(page)

  await page.goto('/admin/site')
  await booted(page)

  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'admin-site')
  await expect(page.locator('[data-testid="admin-site-ready"]')).toBeVisible()
  await expect(page.locator('main h1')).toHaveText('站点设置')

  // 段列表：契约的五个已知段 + 配置里多出来的那一节，一个都不许丢
  await expect(page.locator('[data-testid="admin-site-segment"]')).toHaveCount(6)
  for (const key of ['site', 'navbar', 'footer', 'home', 'about', 'custom']) {
    await expect(
      page.locator(`[data-testid="admin-site-segment"][data-segment="${key}"]`),
    ).toHaveCount(1)
  }

  // 默认打开第一段：字段里就是接口给的值（不是页面自己编的默认值）
  await expect(page.locator('[data-field="site.name"] input')).toHaveValue('E2E 站点')
  await expect(page.locator('[data-field="site.defaultTheme"] input')).toHaveValue('icespark')

  // ── 键盘路径：光标落在段列表上，↓ 走到 home 再 ENTER 打开 ──
  await expect(page.locator('[data-testid="admin-site-segment"].is-focused')).toHaveAttribute(
    'data-segment',
    'site',
  )
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="admin-site-segment"].is-focused')).toHaveAttribute(
    'data-segment',
    'home',
  )
  // 光标移动**不**换段（和全站的芯片口径一致）：按 ENTER 才打开
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="admin-site-segment"].is-active')).toHaveAttribute(
    'data-segment',
    'home',
  )
  await expect(page.locator('[data-testid="admin-site-segment-panel"]')).toHaveAttribute(
    'data-segment',
    'home',
  )
  await expect(page.locator('[data-field="home.title"] input')).toHaveValue('E2E 首页横幅')
  await expect(page.locator('[data-testid="admin-site-json"]')).toHaveValue(/E2E 首页横幅/)

  // ── 鼠标路径到达同一个落点：点自定义段 ──
  await page.locator('[data-testid="admin-site-segment"][data-segment="custom"]').click()
  await expect(page.locator('[data-testid="admin-site-segment-panel"]')).toHaveAttribute(
    'data-segment',
    'custom',
  )
  // 自定义段的整段 JSON 也在页面上（原样带出来，才可能原样写回去）
  await expect(page.locator('[data-testid="admin-site-json"]')).toHaveValue(
    /契约之外的段要原样保留/,
  )

  // ── ESC 不消费：交给全局菜单（全站口径「P / ESC 打开暂停菜单」，管理页不做例外）──
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)

  // 深链接进来的 Q：历史里没有上一页 → 兜底回主页（键盘用户不会卡死在管理页）。
  // 先点一下页头把焦点收回外壳根节点：菜单关掉后原生焦点可能落在已删除的节点上。
  await page.locator('main h1').click()
  await page.keyboard.press('q')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'home')

  expect(stub.gets()).toBe(1)
  expect(stub.puts).toEqual([])
  expect(errors).toEqual([])
})

test('站点设置：改一处保存，请求体里没动过的段原样还在', async ({ page }) => {
  const config = fixture()
  await loggedIn(page, true)
  const stub = await stubAdminSite(page, { get: { status: 200, body: config } })

  await page.goto('/admin/site')
  await booted(page)
  await expect(page.locator('[data-testid="admin-site-ready"]')).toBeVisible()

  const nameInput = page.locator('[data-field="site.name"] input')
  await expect(nameInput).toHaveValue('E2E 站点')

  // 输入框里不劫持按键：Tab 走进来的原生焦点归浏览器 —— 敲 Q 就是往格子里打一个 q，
  // 不是「返回上一页」；Ctrl+A 也不会当成方向键（A 在手柄层是 left）
  await nameInput.click()
  await nameInput.press('Control+a')
  await nameInput.press('q')
  await expect(nameInput).toHaveValue('q')
  await expect(page).toHaveURL(/\/admin\/site$/)

  await nameInput.fill('E2E 改过的站点名')

  // 改动进了「改动对照」：改了什么，页面上看得见
  await expect(
    page.locator('[data-testid="admin-site-diff-line"][data-path="site.name"]'),
  ).toBeVisible()

  await page.locator('[data-testid="admin-site-save"]').click()

  // 保存成功要给「刷新页面后生效」这类反馈（配置是启动时读一次）
  await expect(page.locator('[data-testid="admin-site-saved"]')).toContainText('刷新页面后生效')
  await expect(page.locator('[data-testid="admin-site-save-error"]')).toHaveCount(0)

  expect(stub.puts).toHaveLength(1)
  const body = stub.puts[0] ?? {}

  // 改的那一处真的改了
  expect(pick(body, 'site.name')).toBe('E2E 改过的站点名')
  // site 段只动了 name，同一个段里的其它键与后端多给的 defaultTheme 都还在
  expect(pick(body, 'site')).toEqual({ ...config.site, name: 'E2E 改过的站点名' })
  // 没动过的段整份原样写回：丢了哪一段就是真丢了
  expect(pick(body, 'navbar')).toEqual(config.navbar)
  expect(pick(body, 'footer')).toEqual(config.footer)
  expect(pick(body, 'home')).toEqual(config.home)
  expect(pick(body, 'about')).toEqual(config.about)
  expect(pick(body, 'custom')).toEqual(config.custom)
  // 数组是整体替换的语义，一条都不能少
  expect(pick(body, 'navbar.navItems')).toEqual(config.navbar.navItems)
  expect(pick(body, 'about.facts')).toEqual(config.about.facts)

  // 保存成功后原文换成刚写回去的那一份，差异归零
  await expect(page.locator('[data-testid="admin-site-diff-line"]')).toHaveCount(0)
  // 只读了一次、写了一次
  expect(stub.gets()).toBe(1)
})

test('站点设置：保存失败把后端 detail 原文摆出来，页面不崩、改的东西还在', async ({ page }) => {
  await loggedIn(page, true)
  await stubAdminSite(page, {
    get: { status: 200, body: fixture() },
    put: { status: 500, body: { detail: '配置库写不进去：database is locked' } },
  })
  const errors = pageErrors(page)

  await page.goto('/admin/site')
  await booted(page)
  await expect(page.locator('[data-testid="admin-site-ready"]')).toBeVisible()

  await page.locator('[data-field="site.name"] input').fill('改完这处再存')
  await page.locator('[data-testid="admin-site-save"]').click()

  const failure = page.locator('[data-testid="admin-site-save-error"]')
  await expect(failure).toBeVisible()
  // 原文照摆：不改写、不吞掉
  await expect(failure).toHaveText(/配置库写不进去：database is locked/)
  // 失败时不能反过来显示「保存成功」
  await expect(page.locator('[data-testid="admin-site-saved"]')).toHaveCount(0)

  // 页面没崩：编辑区还在、改动还在、按钮回到可点（能再存一次）
  await expect(page.locator('[data-testid="admin-site-ready"]')).toBeVisible()
  await expect(page.locator('[data-field="site.name"] input')).toHaveValue('改完这处再存')
  await expect(page.locator('[data-testid="admin-site-save"]')).toBeEnabled()
  await expect(
    page.locator('[data-testid="admin-site-diff-line"][data-path="site.name"]'),
  ).toBeVisible()

  expect(errors).toEqual([])
})

test('站点设置：登录了但不是超管 → 页内「仅超管可见」，没有真内容，也不去读配置', async ({
  page,
}) => {
  await loggedIn(page, false)
  // 就算页面真去读了，也只会拿到一份夹具 —— 用例断言的是「压根没读」
  const stub = await stubAdminSite(page, { get: { status: 200, body: fixture() } })

  await page.goto('/admin/site')
  await booted(page)

  // 路由照常进去（requiresSuperuser 只是声明，守卫不拦），场景仍是 admin-site
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'admin-site')
  const block = page.locator('[data-testid="admin-site-superuser-only"]')
  await expect(block).toBeVisible()
  await expect(block).toContainText('仅超管可见')

  // 没有真内容节点，四态里任何一个都不该出现
  await expect(page.locator('[data-field]')).toHaveCount(0)
  for (const id of [
    'admin-site-ready',
    'admin-site-loading',
    'admin-site-empty',
    'admin-site-error',
    'admin-site-save',
  ]) {
    await expect(page.locator(`[data-testid="${id}"]`)).toHaveCount(0)
  }

  // 非超管压根不该读这个接口（假令牌打真接口只会拿 403）
  expect(stub.gets()).toBe(0)
  expect(stub.puts).toEqual([])

  // h1 仍在：超管提示也是一页，不能变成没有一级标题的页面
  await expect(page.locator('main h1')).toHaveCount(1)
  await expect(page.locator('main h1')).toHaveText('站点设置')
})

test('站点设置：h1 唯一、h2 分节不跳级，axe 无新增违规', async ({ page }) => {
  await loggedIn(page, true)
  await stubAdminSite(page, { get: { status: 200, body: fixture() } })

  await page.goto('/admin/site')
  await booted(page)
  await expect(page.locator('[data-testid="admin-site-ready"]')).toBeVisible()

  // 外壳对 admin-site 不发隐藏 h1（App.vue 的 SELF_TITLED_SCENES），整页有且只有一个 h1
  await expect(page.locator('main h1')).toHaveCount(1)
  await expect(page.locator('main h1')).toHaveText('站点设置')
  // h1 → h2：分节标题不跳级，也没有 h3
  await expect(page.locator('main h2').first()).toBeVisible()
  await expect(page.locator('main h3')).toHaveCount(0)

  const report = await new AxeBuilder({ page }).analyze()
  const ids = report.violations.map((v) => v.id)
  expect(ids).not.toContain('page-has-heading-one')
  expect(ids).not.toContain('heading-order')
  // 字段是「一排格子」，每个控件都得有名字（这一条是本页自己加的，防止以后越加越瞎）
  expect(ids).not.toContain('label')
  // 再按全站唯一那份放行清单做**节点级**判定（原先只判 critical 级，太松）
  expect(scanViolations(report).violations).toEqual([])
})

test('站点设置：非法 JSON 给人话提示（带行号）、拦住保存、不发请求', async ({ page }) => {
  await loggedIn(page, true)
  const stub = await stubAdminSite(page, { get: { status: 200, body: fixture() } })

  await page.goto('/admin/site')
  await booted(page)
  await expect(page.locator('[data-testid="admin-site-ready"]')).toBeVisible()

  const json = page.locator('[data-testid="admin-site-json"]')
  await json.fill('{ "name": "少了收尾", ')

  const hint = page.locator('[data-testid="admin-site-json-error"]')
  await expect(hint).toBeVisible()
  // 人话：明说是 JSON 的事情，而且指出**第几行**（不是把后端的 422 甩出来）
  await expect(hint).toContainText('JSON')
  await expect(hint).toContainText(/第 \d+ 行/)

  // 保存被拦住：按钮禁用 + 汇总里说清是哪一段有问题
  await expect(page.locator('[data-testid="admin-site-save"]')).toBeDisabled()
  await expect(page.locator('[data-testid="admin-site-invalid-summary"]')).toContainText(
    '还没写合法',
  )
  // 期间一个请求都不发（页面上只有一开始那次 GET）
  expect(stub.puts).toEqual([])
  expect(stub.gets()).toBe(1)

  // 改好了就能存：提示消失、按钮恢复、PUT 真的发出去
  await json.fill('{ "name": "修好了" }')
  await expect(hint).toHaveCount(0)
  await expect(page.locator('[data-testid="admin-site-save"]')).toBeEnabled()

  await page.locator('[data-testid="admin-site-save"]').click()
  await expect(page.locator('[data-testid="admin-site-saved"]')).toBeVisible()
  expect(stub.puts).toHaveLength(1)
  expect(pick(stub.puts[0], 'site')).toEqual({ name: '修好了' })
})

test('站点设置：读取失败给后端 detail 原文；从没保存过时是空态、能起骨架', async ({ page }) => {
  await loggedIn(page, true)
  await stubAdminSite(page, {
    get: { status: 500, body: { detail: '配置库读不了：database is locked' } },
  })
  const errors = pageErrors(page)

  await page.goto('/admin/site')
  await booted(page)

  // error 态：detail 原文可见，编辑区不出现，h1 照旧
  const failure = page.locator('[data-testid="admin-site-error"]')
  await expect(failure).toBeVisible()
  await expect(failure).toContainText('配置库读不了：database is locked')
  await expect(page.locator('[data-testid="admin-site-ready"]')).toHaveCount(0)
  await expect(page.locator('main h1')).toHaveText('站点设置')
  expect(errors).toEqual([])

  // 换一台「从没保存过」的后端（契约原文：GET 返回 {}），点重试
  await page.unroute('**/api/admin/site-config')
  const second = await stubAdminSite(page, { get: { status: 200, body: {} } })
  await page.locator('[data-testid="admin-site-retry"]').click()

  // 空态不是错误态：说清「后台这一层还是空的」，并给一条明确的下手路径
  const empty = page.locator('[data-testid="admin-site-empty"]')
  await expect(empty).toBeVisible()
  await expect(empty).toContainText('从没保存过')
  await expect(page.locator('[data-testid="admin-site-error"]')).toHaveCount(0)

  await page.locator('[data-testid="admin-site-skeleton"]').click()
  await expect(page.locator('[data-testid="admin-site-ready"]')).toBeVisible()
  await expect(page.locator('[data-testid="admin-site-segment"]')).toHaveCount(5)
  // 起骨架只在本地摆出五段，不发任何写请求
  expect(second.puts).toEqual([])
  expect(second.gets()).toBe(1)
})

test('底栏顺序：快捷键指引在保存栏**下面**，滚到底两者不重叠、保存按钮点得到', async ({ page }) => {
  // 用户报的缺陷：指引跑到了保存栏上面（实测滚到底时指引停在 y=190、保存栏在 y=524）。
  // 根因不是 DOM 顺序 —— `.foot` 本来就是 `.admin-site` 的最后一个孩子 ——
  // 而是 `.work` 的 `flex: 1`（= `1 1 auto`）被压回一屏高度、内容溢出到盒子外面，
  // 紧跟其后的 `.foot` 于是落在「盒子的底」而不是「内容的底」上。
  // 修法是 `.work` 不收缩。这里按**几何**断言，不再靠肉眼。
  await loggedIn(page, true)
  await stubAdminSite(page, { get: { status: 200, body: fixture() } })

  // 短视口才有得滚 —— 页面比一屏高正是这个缺陷的触发条件
  await page.setViewportSize({ width: 1180, height: 620 })
  await page.goto('/admin/site')
  await booted(page)
  await expect(page.locator('[data-testid="admin-site-ready"]')).toBeVisible()

  const scroller = page.locator('.screen-inner')
  const scrolled = await scroller.evaluate((el) => el.scrollHeight > el.clientHeight + 40)
  expect(scrolled, '这一页应当比视口高，否则证明不了什么').toBe(true)

  // 顺带钉住根因本身：`.work` 的盒子高度必须跟得上内容（收缩回一屏就是那个 bug）
  const boxes = await page.evaluate(() => {
    const work = document.querySelector('.work') as HTMLElement
    const cols = document.querySelector('.cols') as HTMLElement
    const bar = document.querySelector('.savebar') as HTMLElement
    return { work: work.offsetHeight, content: cols.offsetHeight + bar.offsetHeight }
  })
  expect(
    boxes.work,
    '`.work` 必须装得下左段列表 + 保存栏（否则溢出的内容会跑到底条下面）',
  ).toBeGreaterThanOrEqual(boxes.content)

  // 滚到底：底条是页面最下面那一条，保存栏在它上面，两者不重叠
  await scroller.evaluate((el) => void (el.scrollTop = el.scrollHeight))
  const geo = await page.evaluate(() => {
    const foot = document.querySelector('.foot')!.getBoundingClientRect()
    const bar = document.querySelector('.savebar')!.getBoundingClientRect()
    const screen = document.querySelector('.screen-inner')!.getBoundingClientRect()
    return {
      footTop: foot.top,
      footBottom: foot.bottom,
      barBottom: bar.bottom,
      screenBottom: screen.bottom,
    }
  })
  expect(geo.footTop, '指引必须在保存栏下面').toBeGreaterThanOrEqual(geo.barBottom - 1)
  expect(Math.abs(geo.footBottom - geo.screenBottom), '指引就是最下面那一条').toBeLessThanOrEqual(3)

  // 而且真的点得到保存（不是被指引盖住）：命中测试必须落在按钮自己身上
  const save = page.locator('[data-testid="admin-site-save"]')
  const hit = await save.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
    return top ? (top === el || el.contains(top) || top.contains(el)) : false
  })
  expect(hit, '保存按钮不该被底条挡住').toBe(true)
})

test('长文本编辑：文档型字段（带换行的那一格）与整段 JSON 能开弹窗，单行字段不接', async ({
  page,
}) => {
  await loggedIn(page, true)
  await stubAdminSite(page, { get: { status: 200, body: fixture() } })
  const errors = pageErrors(page)

  await page.goto('/admin/site')
  await booted(page)

  const dialog = page.locator('[data-testid="long-text-dialog"]')
  const area = page.locator('[data-testid="long-text-area"]')
  const json = page.locator('[data-testid="admin-site-json"]')

  // ── 单行字段一个都不加：`site.description` 只有几个字，是 `kind === 'text'` ──
  await expect(page.locator('[data-field="site.description"] input')).toBeVisible()
  await expect(page.locator('[data-testid="admin-site-expand"]')).toHaveCount(0)

  // ── 切到「自定义段」：`custom.notes` 带换行（`kind === 'area'`），框里有图标 ──
  //（about 段现在走专用编辑器，不再有 JSON/长文框 —— 见本文件末尾那条新用例）
  await page.locator('[data-testid="admin-site-segment"][data-segment="custom"]').click()
  const body = page.locator('[data-field="custom.notes"] textarea')
  await expect(body).toBeVisible()
  const icon = page.locator('[data-testid="admin-site-expand"][data-key="notes"]')
  await expect(icon).toHaveCount(1)
  // 「在框里」不是形容词：图标落在那一格文本框的盒子内部（右上角）
  const box = (await body.boundingBox())!
  const spot = (await icon.boundingBox())!
  expect(spot.x).toBeGreaterThan(box.x)
  expect(spot.y).toBeGreaterThan(box.y)
  expect(spot.x + spot.width).toBeLessThanOrEqual(box.x + box.width)
  expect(spot.y + spot.height).toBeLessThanOrEqual(box.y + box.height)
  // 同一段里的单行字段没有图标
  await expect(page.locator('[data-key="note"]')).toHaveCount(0)

  // 入口一：F2
  await body.focus()
  await page.keyboard.press('F2')
  await expect(dialog).toBeVisible()
  await expect(area).toHaveValue(/这是一段用于用例的正文/)

  // 打开期间 P 不叠暂停菜单（焦点落在按钮上时也照样拦住）
  await page.locator('[data-testid="long-text-save"]').focus()
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
  await expect(dialog).toBeVisible()

  // 写够 80 字以上：这一页按内容判「是不是文档型」（带换行或超长），
  // 写太短它自己会变回单行输入框 —— 那是既有口径，不是这个功能的毛病
  const longBody = `改过的自定义段正文。${'这是用来撑长度的正文。'.repeat(12)}`
  await area.fill(longBody)
  await page.locator('[data-testid="long-text-save"]').click()
  await expect(dialog).toHaveCount(0)
  await expect(body).toHaveValue(longBody)
  // 焦点还给原来那一格
  await expect(body).toBeFocused()
  // 同一份数据：整段 JSON 立刻跟着变（页面没有第二份草稿）
  await expect(json).toHaveValue(/改过的自定义段正文。这是用来撑长度的正文/)

  // ── 整段 JSON 也有图标，且是等宽 / 多行 ──
  await page.locator('[data-testid="admin-site-json-expand"]').click()
  await expect(dialog).toBeVisible()
  await expect(page.locator('[data-testid="long-text-area"].mono')).toHaveCount(1)
  await area.fill('{\n  "note": "改过的说明",\n  "notes": "整段改过的正文"\n}')
  await page.keyboard.press('Control+Enter')
  await expect(dialog).toHaveCount(0)
  await expect(json).toHaveValue(/整段改过的正文/)
  // 整段写回是真的：字段列表按新的 JSON 重算 —— `note` 换成了新值，原来的 `list` 没了
  await expect(page.locator('[data-field="custom.note"] input')).toHaveValue('改过的说明')
  await expect(page.locator('[data-field="custom.list"]')).toHaveCount(0)

  // ── ESC 丢弃：整段 JSON 一个字符都没改 ──
  await page.locator('[data-testid="admin-site-json-expand"]').click()
  await area.fill('{ "notes": "这一份不算数" }')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(json).toHaveValue(/整段改过的正文/)
  await expect(json).not.toHaveValue(/这一份不算数/)

  expect(errors).toEqual([])
})

test('站点设置：关于页段换成专用编辑器 —— 条目增删改上下移 + 正文即写即预览', async ({ page }) => {
  const config = fixture()
  await loggedIn(page, true)
  const stub = await stubAdminSite(page, { get: { status: 200, body: config } })
  const errors = pageErrors(page)

  await page.goto('/admin/site')
  await booted(page)
  await page.locator('[data-testid="admin-site-segment"][data-segment="about"]').click()

  const editor = page.locator('[data-testid="about-editor"]')
  await expect(editor).toBeVisible()
  // 旧前端那四个字段（badge / title / desc / techStack）在这一段上不再作为输入框暴露：
  // 关于页根本不渲染它们 ——「配了没反应」的根子就在这里。
  await expect(page.locator('[data-field^="about."]')).toHaveCount(0)
  // 整段 JSON 兜底面**留着**（每一段都有）：契约里配置段就是自由 JSON，
  // 专用编辑器不能把这一段锁死；只是不该再有人被推到那里去改正文。
  await expect(page.locator('[data-testid="admin-site-json"]')).toHaveValue(/"facts"/)

  const rows = page.locator('[data-testid="about-row"]')
  await expect(rows).toHaveCount(1)
  await expect(rows.nth(0).locator('[data-testid="about-key"]')).toHaveValue('站点')
  await expect(rows.nth(0).locator('[data-testid="about-value"]')).toHaveValue('E2E')

  // 行尾那三颗是**图标方块**（曾经是三个宽按钮「↑ ↓ 删」，把四个输入框挤成窄缝）：
  // 名字得由 aria-label 交代清楚 —— 屏幕阅读器读「▴」是读不出意思的
  await expect(rows.nth(0).locator('[data-testid="about-up"]')).toHaveAttribute('aria-label', /上移/)
  await expect(rows.nth(0).locator('[data-testid="about-down"]')).toHaveAttribute('aria-label', /下移/)
  await expect(rows.nth(0).locator('[data-testid="about-del"]')).toHaveAttribute('aria-label', /删除/)
  // 每条前面有编号铭牌（第几条一眼看得出）
  await expect(rows.nth(0).locator('.about-idx')).toHaveText('01')

  // 图标（1–2 字符）与链接都可选，同一条上一起改
  await rows.nth(0).locator('[data-testid="about-icon"]').fill('◆')
  await rows.nth(0).locator('[data-testid="about-link"]').fill('/links')

  // 加一条：名字 / 值 / 绝对链接
  await page.locator('[data-testid="about-add"]').click()
  await expect(rows).toHaveCount(2)
  await rows.nth(1).locator('[data-testid="about-key"]').fill('GitHub')
  await rows.nth(1).locator('[data-testid="about-value"]').fill('仓库')
  await rows.nth(1).locator('[data-testid="about-link"]').fill('https://example.com/repo')

  // 上下移：把新加的那条挪到最前
  await rows.nth(1).locator('[data-testid="about-up"]').click()
  await expect(rows.nth(0).locator('[data-testid="about-key"]')).toHaveValue('GitHub')
  await expect(rows.nth(1).locator('[data-testid="about-key"]')).toHaveValue('站点')
  // 到头的那两个按钮是**禁用**的（不是点了没反应）
  await expect(rows.nth(0).locator('[data-testid="about-up"]')).toBeDisabled()
  await expect(rows.nth(1).locator('[data-testid="about-down"]')).toBeDisabled()

  // 键盘等效（硬要求）：焦点落在按钮上时回车归浏览器（`nativeOwnsEnter` 那条规矩），
  // 真能加一条 —— 而不是「按了回车毫无反应」
  await page.locator('[data-testid="about-add"]').focus()
  await page.keyboard.press('Enter')
  await expect(rows).toHaveCount(3)
  // 加出来的这条清掉，后面的断言按原来两条走
  await rows.nth(2).locator('[data-testid="about-del"]').click()
  await expect(rows).toHaveCount(2)

  // 正文：左边写，右边用同一个渲染器立刻出结果
  await page.locator('[data-testid="about-body"]').fill('## 改过的正文\n\n这一段是新写的。')
  const preview = page.locator('[data-testid="about-preview"]')
  await expect(preview).toContainText('改过的正文')
  await expect(preview).toContainText('这一段是新写的。')

  // 删一条：删掉排在第二的「站点」（它带着图标与站内链接）
  await rows.nth(1).locator('[data-testid="about-del"]').click()
  await expect(rows).toHaveCount(1)

  await page.locator('[data-testid="admin-site-save"]').click()
  await expect(page.locator('[data-testid="admin-site-saved"]')).toContainText('刷新页面后生效')

  expect(stub.puts).toHaveLength(1)
  const payload = stub.puts[0] ?? {}
  // 条目按屏幕上的顺序写回去；没填的可选键不塞空串
  expect(pick(payload, 'about.facts')).toEqual([
    { key: 'GitHub', value: '仓库', link: 'https://example.com/repo' },
  ])
  expect(pick(payload, 'about.body')).toBe('## 改过的正文\n\n这一段是新写的。')
  // 没暴露的那四个旧键**一个都不能丢**（「留库里、不暴露」= 保存时原样带回去）
  expect(pick(payload, 'about.badge')).toBe('ABOUT')
  expect(pick(payload, 'about.title')).toBe('关于')
  expect(pick(payload, 'about.desc')).toBe('E2E 关于描述')
  expect(pick(payload, 'about.techStack')).toEqual(config.about.techStack)
  // 契约之外的段一如既往
  expect(pick(payload, 'custom')).toEqual(config.custom)

  expect(errors).toEqual([])
})

test('站点设置：关于段不是对象时回落通用编辑器（专用编辑器不把这一段锁死）', async ({ page }) => {
  await loggedIn(page, true)
  await stubAdminSite(page, {
    get: { status: 200, body: { ...fixture(), about: '这一段被写成了字符串' } },
  })

  await page.goto('/admin/site')
  await booted(page)
  await page.locator('[data-testid="admin-site-segment"][data-segment="about"]').click()

  // 契约里配置段就是自由 JSON：形状不是对象时给不出条目行与正文框，
  // 这时必须有退路 —— 整段 JSON 框照样在，管理员能自己把形状改回来
  await expect(page.locator('[data-testid="about-editor"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="admin-site-json"]')).toHaveValue(
    /这一段被写成了字符串/,
  )
  await expect(page.locator('[data-testid="admin-site-field"]')).toHaveCount(0)
})

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { scanViolations } from './a11y-known'

import { booted, press } from './helpers'

/**
 * P5 外链管理页（`/admin/links`）的用例（架构 §23.4 口径）。
 *
 * 三条自我约束，与既有 spec 同源：
 *
 * 1. **不依赖真账号密码**：登录态靠 `page.addInitScript` 写两把键
 *    （`synthspark-token` 一个假串 + `synthspark-icespark-user`），
 *    并且**必须**把这一页要调的接口全部换成夹具 —— 假令牌打真接口只会 401。
 *    尤其 `/api/auth/me` 要打桩：外壳挂载时会 `bootstrapAuth()` 静默校验一次，
 *    401 会让 `stores/auth.ts` 登出并清掉缓存，表现是「守卫放行了、菜单却少了几行」。
 * 2. **不依赖后端有数据**：`GET /api/links/` 一律用夹具（真后端现在返回 `[]`）。
 * 3. **开机自检先让位**：每次 `goto` 之后 `await booted(page)`，否则第一次按键会被自检吃掉。
 *
 * 这一页的四个状态与三条动作都钉在这里；外壳级的鉴权门在 `admin-guard.spec.ts`，
 * 公开只读的那一面在 `pages.spec.ts`（`/links`），两者不在这里重复。
 */

/** 夹具外链：形如 `GET /api/links/` 的响应（字段就是契约 `ExternalLink` 的全部） */
const LINKS = [
  {
    id: 'l-0001',
    name: '站内服务台',
    url: '/api/services/hello/',
    cover_image: null,
    sort_order: 1,
    created_at: '2026-09-29T10:00:00',
    updated_at: '2026-09-29T10:00:00',
  },
  {
    id: 'l-0002',
    name: '示例站点',
    url: 'https://example.com/',
    cover_image: null,
    sort_order: 2,
    created_at: '2026-09-29T10:05:00',
    updated_at: '2026-09-29T10:05:00',
  },
]

interface WriteRecord {
  method: string
  path: string
  body: unknown
}

interface Recorder {
  /** 发出去的写请求（method / pathname / JSON body） */
  writes: WriteRecord[]
  /** `GET /api/links/` 调了几次 —— 写操作之后列表就该就地更新，这个数不该涨 */
  getCount: () => number
}

interface StubOptions {
  /** 是不是超管（只影响 `/api/auth/me` 与缓存里的用户） */
  superuser?: boolean
  /** 读取接口的应答；不传 = 200 + `LINKS` */
  onGet?: () => { status: number; body: unknown }
  /** 写请求的应答；返回 null 走默认（POST/PUT 回整份对象、DELETE 回 204） */
  onWrite?: (
    method: string,
    path: string,
    body: unknown,
  ) => { status: number; body: unknown } | null
}

/**
 * 装好这一页需要的全部桩：登录态两把键 + `/api/auth/me` + `/api/links/`。
 * 路径用正则匹配（`/api/links/` 与 `/api/links/{id}` 一条正则都盖得住，
 * 尾斜杠正是契约要求的写法 —— 不带会 307，跟随重定向时 Authorization 会被丢掉）。
 */
async function stubApi(page: Page, options: StubOptions = {}): Promise<Recorder> {
  const superuser = options.superuser ?? true
  const writes: WriteRecord[] = []
  let gets = 0

  const user = {
    id: 'e2e-id',
    username: superuser ? 'e2e_boss' : 'e2e_user',
    display_name: superuser ? '测试超管' : '测试用户',
    is_superuser: superuser,
  }

  await page.addInitScript((u) => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
    localStorage.setItem('synthspark-token', 'e2e-token')
    localStorage.setItem('synthspark-icespark-user', JSON.stringify(u))
  }, user)

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }),
  )

  await page.route(/\/api\/links\//, async (route) => {
    const request = route.request()
    const method = request.method()
    const path = new URL(request.url()).pathname

    if (method === 'GET') {
      gets += 1
      const answer = options.onGet?.() ?? { status: 200, body: LINKS }
      await route.fulfill({
        status: answer.status,
        contentType: 'application/json',
        body: JSON.stringify(answer.body),
      })
      return
    }

    // DELETE 没有请求体；`postDataJSON()` 在没有 body 时会抛
    const raw = request.postData()
    const body: unknown = raw ? (JSON.parse(raw) as unknown) : null
    writes.push({ method, path, body })

    const custom = options.onWrite?.(method, path, body)
    if (custom) {
      await route.fulfill({
        status: custom.status,
        contentType: 'application/json',
        body: JSON.stringify(custom.body),
      })
      return
    }

    if (method === 'DELETE') {
      await route.fulfill({ status: 204 })
      return
    }

    // POST / PUT 都回整份对象（契约如此）—— 页面据此**就地更新**列表
    const id = method === 'POST' ? 'l-0003' : path.split('/').pop()!
    await route.fulfill({
      status: method === 'POST' ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...(body as Record<string, unknown>),
        id,
        created_at: '2026-09-29T11:00:00',
        updated_at: '2026-09-29T11:00:00',
      }),
    })
  })

  return { writes, getCount: () => gets }
}

test('外链管理：超管深链接直接打开，两条外链都渲染出来', async ({ page }) => {
  const recorder = await stubApi(page)

  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/admin/links')
  await booted(page)

  // 路由与场景：URL 停在 /admin/links，底栏场景跟着走；外壳底栏在（页面不自画品牌与状态行）
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'admin-links')
  await expect(page).toHaveURL(/\/admin\/links$/)
  await expect(page.locator('[data-testid="deck"]')).toBeVisible()

  // 页面自带的可见 h1（admin-links 在 SELF_TITLED_SCENES 里）
  await expect(page.locator('main h1')).toHaveText('外链管理')

  // 两条夹具外链都渲染：名称、链接、以及左侧的序号铭牌
  const cards = page.locator('[data-testid="admin-link-card"]')
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toContainText('站内服务台')
  await expect(cards.first()).toContainText('/api/services/hello/')
  await expect(cards.nth(1)).toContainText('示例站点')
  await expect(page.locator('[data-testid="admin-links-grid"]')).toBeVisible()

  // 超管看得到真内容，就不是「仅超管可见」那一态
  await expect(page.locator('[data-testid="admin-links-denied"]')).toHaveCount(0)

  // 进页面读一次（这一页不缓存，也不走 stores/content）
  expect(recorder.getCount()).toBe(1)
  expect(errors).toEqual([])
})

test('外链管理：新建一条 —— 请求体正确，列表就地多一条', async ({ page }) => {
  const recorder = await stubApi(page)
  await page.goto('/admin/links')
  await booted(page)
  await expect(page.locator('[data-testid="admin-link-card"]')).toHaveCount(2)

  // 表单**天生**就是新建态：面板头那颗「＋ 新建」按钮已按用户口径撤掉（它与「清空」
  // 完全重复，见视图文件头的记账），所以这里第一件可做的动作就是打字。
  await expect(page.locator('[data-testid="link-form-panel"]')).toContainText('新建外链')
  await expect(page.locator('[data-testid="link-new"]')).toHaveCount(0)

  // 没有自绘光标落在任何东西上，回车什么也不该发生（不许「替」某张卡按下动作）
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="link-del-dialog"]')).toHaveCount(0)
  expect(recorder.writes).toEqual([])

  // Tab 走原生焦点（本页没有标签栏，外壳把 Tab 还给浏览器，见 App.vue 全局监听器）：
  // 外壳根节点 → 名称 → 链接
  await page.keyboard.press('Tab')
  await expect(page.locator('[data-testid="link-name"]')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('[data-testid="link-url"]')).toBeFocused()

  await page.fill('[data-testid="link-name"]', '新外链')
  await page.fill('[data-testid="link-url"]', 'https://example.org/a')
  await page.fill('[data-testid="link-sort"]', '7')
  await page.click('[data-testid="link-save"]')

  // 请求体只有契约那四项，一个不多一个不少（配图空串送 null）。
  // 这里必须**等一下**再读数组：`click` 返回只是「点击已派发」，请求还在路上；
  // 并行跑（全量 97 条）时这条同步断言会先读到空数组 —— 实测红过一次。
  await expect.poll(() => recorder.writes.length, { message: 'POST 应当已经发出去' }).toBe(1)
  expect(recorder.writes[0]).toMatchObject({
    method: 'POST',
    path: '/api/links/',
    body: {
      name: '新外链',
      url: 'https://example.org/a',
      cover_image: null,
      sort_order: 7,
    },
  })

  // 就地更新：新链出现在列表里，而且**没有**再整页重读一次
  await expect(page.locator('[data-testid="link-form-note"]')).toContainText('已新建')
  await expect(page.locator('[data-testid="admin-link-card"]')).toHaveCount(3)
  await expect(page.locator('[data-testid="admin-link-card"]').last()).toContainText('新外链')
  expect(recorder.getCount()).toBe(1)
})

test('外链管理：编辑一条 —— PUT 到那条 id，列表就地改名', async ({ page }) => {
  const recorder = await stubApi(page)
  await page.goto('/admin/links')
  await booted(page)

  const first = page.locator('[data-testid="admin-link-card"]').first()
  await first.locator('[data-testid="link-edit"]').click()

  // 表单被这条的现值填满（编辑态可辨认，不是空表单）
  await expect(page.locator('[data-testid="link-name"]')).toHaveValue('站内服务台')
  await expect(page.locator('[data-testid="link-url"]')).toHaveValue('/api/services/hello/')
  await expect(page.locator('[data-testid="link-cover"]')).toHaveValue('')

  await page.fill('[data-testid="link-name"]', '站内服务台 v2')
  await page.fill('[data-testid="link-cover"]', 'https://example.com/c.png')
  const edited = page.waitForRequest(
    (r) => r.method() === 'PUT' && r.url().includes('/api/links/l-0001'),
  )
  await page.click('[data-testid="link-save"]')
  await edited

  expect(recorder.writes).toHaveLength(1)
  expect(recorder.writes[0]).toMatchObject({
    method: 'PUT',
    path: '/api/links/l-0001',
    body: {
      name: '站内服务台 v2',
      url: '/api/services/hello/',
      cover_image: 'https://example.com/c.png',
      sort_order: 1,
    },
  })

  // 就地替换：还是两条，但第一条已经改名；同样没有再读一次
  await expect(page.locator('[data-testid="link-form-note"]')).toContainText('已保存')
  await expect(page.locator('[data-testid="admin-link-card"]')).toHaveCount(2)
  await expect(page.locator('[data-testid="admin-link-card"]').first()).toContainText(
    '站内服务台 v2',
  )
  expect(recorder.getCount()).toBe(1)
})

test('外链管理：编辑态按「清空」回到新建态（撤掉那颗按钮之后，入口只剩它）', async ({ page }) => {
  const recorder = await stubApi(page)
  await page.goto('/admin/links')
  await booted(page)

  // 点第一条的「编辑」：表单被这条的现值填满，标题与提交按钮都换成编辑口径
  await page
    .locator('[data-testid="admin-link-card"]')
    .first()
    .locator('[data-testid="link-edit"]')
    .click()
  await expect(page.locator('[data-testid="link-form-panel"]')).toContainText('编辑外链')
  await expect(page.locator('[data-testid="link-name"]')).toHaveValue('站内服务台')
  await expect(page.locator('[data-testid="link-save"]')).toHaveText('保存修改')

  // 「清空」= 回到新建态 + 把光标放回名称框（原来那颗「＋ 新建」按钮做的同一件事）
  await page.click('[data-testid="link-reset"]')
  await expect(page.locator('[data-testid="link-form-panel"]')).toContainText('新建外链')
  await expect(page.locator('[data-testid="link-name"]')).toHaveValue('')
  await expect(page.locator('[data-testid="link-url"]')).toHaveValue('')
  await expect(page.locator('[data-testid="link-save"]')).toHaveText('新建外链')
  await expect(page.locator('[data-testid="link-name"]')).toBeFocused()

  // 清空不发任何请求：它只是把表单退回空白
  expect(recorder.writes).toEqual([])
  expect(recorder.getCount()).toBe(1)
})

test('外链管理：删除要二次确认 —— 取消不发请求，确认后才发 DELETE', async ({ page }) => {
  const recorder = await stubApi(page)
  await page.goto('/admin/links')
  await booted(page)

  const first = page.locator('[data-testid="admin-link-card"]').first()
  await first.locator('[data-testid="link-del"]').click()

  // 页内模态（不是 window.confirm）：语义齐、看得见要删的是哪一条
  const dialog = page.locator('[data-testid="link-del-dialog"]')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('role', 'dialog')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(dialog).toContainText('站内服务台')

  // 取消：一个请求都不该发出去，列表原样
  await page.click('[data-testid="link-del-cancel"]')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-testid="admin-link-card"]')).toHaveCount(2)
  expect(recorder.writes).toEqual([])

  // 再来一次并确认：这才真的发 DELETE
  await first.locator('[data-testid="link-del"]').click()
  await page.click('[data-testid="link-del-confirm"]')
  await expect(page.locator('[data-testid="link-del-dialog"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="link-action-note"]')).toContainText('已删除')
  await expect(page.locator('[data-testid="admin-link-card"]')).toHaveCount(1)
  expect(recorder.writes).toHaveLength(1)
  expect(recorder.writes[0]).toMatchObject({ method: 'DELETE', path: '/api/links/l-0001' })
  expect(recorder.getCount()).toBe(1)
})

test('外链管理：确认框开着时 P 不叠菜单，关掉之后全局键照常', async ({ page }) => {
  await stubApi(page)
  await page.goto('/admin/links')
  await booted(page)

  await page
    .locator('[data-testid="admin-link-card"]')
    .first()
    .locator('[data-testid="link-del"]')
    .click()
  const dialog = page.locator('[data-testid="link-del-dialog"]')
  await expect(dialog).toBeVisible()

  // 页内模态开着 = 外壳的全局键让位：P 不许在确认框上再压一层暂停菜单
  // （P3 收尾定的「屏幕上任何时刻只有一个模态」；靠 `pageModalOpen` 这个内核开关）
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
  await expect(dialog).toBeVisible()

  // ESC 只关这一层框，也不该顺手把菜单开出来
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)

  // 关掉之后开关必须已经放掉：基础态的 ESC 仍然照旧呼出菜单
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
})

test('外链管理：纯键盘走完全程（方向键 / ENTER 确认删除 / Q 返回 / ESC 不吃）', async ({
  page,
}) => {
  const recorder = await stubApi(page)
  await page.goto('/admin/links')
  await booted(page)

  // 进入卡片列表的唯一键盘入口：↓ → 第一张卡的「编辑」→ → 「删除」
  // （原来 ↓ 之前还有一格「新建」按钮，已撤；首行再往上也不再回那一格）
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="link-edit"]').first()).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="link-del"]').first()).toHaveClass(/is-focused/)

  // ENTER 打开二次确认；焦点默认停在「取消」那一侧（误按一次回车不删数据）
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="link-del-dialog"]')).toBeVisible()
  await expect(page.locator('[data-testid="link-del-cancel"]')).toHaveClass(/is-focused/)

  // → 移到「确认删除」，再 ENTER 才真的删
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="link-del-confirm"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="link-del-dialog"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="admin-link-card"]')).toHaveCount(1)
  expect(recorder.writes.map((w) => w.method)).toEqual(['DELETE'])

  // 基础态不吃 ESC：它必须落到外壳的全局监听器上（全站口径「P / ESC 菜单」）
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)

  // Q = 返回上一页；深链接进来历史里没有上一页 → 兜底回主页（键盘用户不卡死）
  await page.keyboard.press('q')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'home')
})

test('外链管理：后端拒绝的原文照贴（读 500 与写 400 两种，前端都不改写）', async ({ page }) => {
  const recorder = await stubApi(page, {
    onGet: () => ({ status: 500, body: { detail: '数据连接已断开' } }),
    onWrite: (method) =>
      method === 'POST'
        ? { status: 400, body: { detail: 'url 必须是 http(s):// 绝对链接或以 / 开头的站内路径' } }
        : null,
  })
  await page.goto('/admin/links')
  await booted(page)

  // 读失败：四态里的 error，detail 原文落在列表区，不是白屏也不是「加载失败请重试」
  await expect(page.locator('[data-testid="links-error"]')).toBeVisible()
  await expect(page.locator('[data-testid="links-error-detail"]')).toHaveText('数据连接已断开')
  await expect(page.locator('[data-testid="admin-links-grid"]')).toHaveCount(0)

  // 写失败：前端**不自己拦**非法 url（拦了就永远看不到后端原文）
  await page.fill('[data-testid="link-name"]', '危险链接')
  await page.fill('[data-testid="link-url"]', 'javascript:alert(1)')
  await page.click('[data-testid="link-save"]')

  await expect(page.locator('[data-testid="link-form-error"]')).toHaveText(
    '✕ url 必须是 http(s):// 绝对链接或以 / 开头的站内路径',
  )
  expect(recorder.writes).toHaveLength(1)
  expect(recorder.writes[0]).toMatchObject({
    method: 'POST',
    path: '/api/links/',
    body: { name: '危险链接', url: 'javascript:alert(1)', cover_image: null, sort_order: 0 },
  })
})

test('外链管理：登录了但不是超管 → 页内「仅超管可见」，没有真内容节点', async ({ page }) => {
  const recorder = await stubApi(page, { superuser: false })
  await page.goto('/admin/links')
  await booted(page)

  // 不重定向：登录了的人有权知道这一页少了什么（§23.1 的两条鉴权口径）
  await expect(page).toHaveURL(/\/admin\/links$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'admin-links')

  const denied = page.locator('[data-testid="admin-links-denied"]')
  await expect(denied).toBeVisible()
  await expect(denied).toContainText('仅超管可见')

  // 真内容一个都不许出现：表单、列表、表单里的任何按钮全都没有
  await expect(page.locator('[data-testid="link-form"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="link-save"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="link-form-panel"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="admin-links-grid"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="admin-link-card"]')).toHaveCount(0)

  // 没权限就不该白跑一次读取
  expect(recorder.getCount()).toBe(0)

  // 页面仍然有可见 h1，也不是被守卫送回了主页
  await expect(page.locator('main h1')).toHaveText('外链管理')
  await expect(page.locator('[data-testid="login-dialog"]')).toHaveCount(0)
})

test('外链管理：h1 层级正确，axe 无新增违规', async ({ page }) => {
  await stubApi(page)
  await page.goto('/admin/links')
  await booted(page)
  await expect(page.locator('[data-testid="admin-link-card"]').first()).toBeVisible()

  // 外壳对 admin-links 不发隐藏 h1，所以整页有且只有一个 h1
  const h1 = page.locator('main h1')
  await expect(h1).toHaveCount(1)
  await expect(h1).toHaveText('外链管理')
  // 卡片标题是 h2：h1 → h2 不跳级
  await expect(page.locator('[data-testid="admin-link-card"] h2').first()).toBeVisible()
  await expect(page.locator('[data-testid="link-form-panel"] h2')).toBeVisible()

  const report = await new AxeBuilder({ page }).analyze()
  const ids = report.violations.map((v) => v.id)
  // 底栏小字与样机卡片标题跳级是全站已知取舍（见 a11y.spec.ts 的清单），本页不重复判它们
  expect(ids).not.toContain('page-has-heading-one')
  expect(ids).not.toContain('heading-order')

  // 放行清单只有一份：`e2e/a11y-known.ts`（文件头写清了三条放行的理由与补偿物）
  expect(scanViolations(report).violations).toEqual([])
})

/* ────────────── 用户反馈：外链要能配封面图（旧前端就有这个功能） ────────────── */

/** 1×1 透明 PNG：给"有封面"那条用例当图片应答（不然真去请求会 404，画框会自己消失） */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

test('关联页：接口给了封面就画出来（像素画框），没给就不留空图片位', async ({ page }) => {
  await stubApi(page, {
    onGet: () => ({
      status: 200,
      body: [
        { ...LINKS[0], cover_image: '/api/download/u-1/images/cover.png' },
        { ...LINKS[1], cover_image: null },
      ],
    }),
  })
  // 图片本体也要打桩：不然请求落到 dev server 上拿到 HTML，img 解码失败、画框会自己撤掉
  await page.route('**/api/download/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG }),
  )

  await page.goto('/links')
  await booted(page)

  const cards = page.locator('[data-testid="link-card"]')
  await expect(cards).toHaveCount(2)
  // 有封面那张：卡片里出现画框，src 就是接口给的那个地址
  await expect(cards.nth(0).locator('[data-testid="img-frame"]')).toBeVisible()
  await expect(cards.nth(0).locator('img')).toHaveAttribute(
    'src',
    '/api/download/u-1/images/cover.png',
  )
  // 没封面那张：连画框都不渲染（口径与文章列表一致 —— 不留空图片位）
  await expect(cards.nth(1).locator('[data-testid="img-frame"]')).toHaveCount(0)
})

test('关联页：封面挂了不反复重试 —— 图失败一次就退回纯文字版式', async ({ page }) => {
  await stubApi(page, {
    onGet: () => ({
      status: 200,
      body: [{ ...LINKS[0], cover_image: '/no-such-cover.png' }],
    }),
  })
  await page.goto('/links')
  await booted(page)

  const card = page.locator('[data-testid="link-card"]').first()
  // 加载失败 → ImageFrame 自己撤掉，`scene/cover.ts` 的失败缓存记住这个地址
  await expect(card.locator('[data-testid="img-frame"]')).toHaveCount(0)

  // 离开再回来：失败缓存还在内存里，所以依然不为它画框（不会每次都重试/闪一下）
  await page.click('[data-testid="tab-posts"]')
  await expect(page).toHaveURL(/\/posts$/)
  await press(page, 'q')
  await expect(page).toHaveURL(/\/links$/)
  await expect(page.locator('[data-testid="img-frame"]')).toHaveCount(0)
})

test('外链管理：配图可上传（/api/upload/image）、可移除，保存时进 cover_image', async ({
  page,
}) => {
  const recorder = await stubApi(page)
  await page.route('**/api/upload/image', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ filename: 'cover.png', url: '/api/download/u-1/images/cover.png' }),
    }),
  )
  await page.route('**/api/download/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG }),
  )

  await page.goto('/admin/links')
  await booted(page)

  await page.fill('[data-testid="link-name"]', '带封面的外链')
  await page.fill('[data-testid="link-url"]', 'https://example.org/')
  // 隐藏的 file 输入直接喂文件（不必去点系统选择框；那颗"上传"按钮只是代它 click）
  await page.setInputFiles('[data-testid="link-cover-file"]', {
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  })

  // 上传回来的站内路径写进输入框，并给出缩略预览
  await expect(page.locator('[data-testid="link-cover"]')).toHaveValue(
    '/api/download/u-1/images/cover.png',
  )
  await expect(page.locator('[data-testid="link-cover-thumb"]')).toBeVisible()

  await page.click('[data-testid="link-save"]')
  await expect.poll(() => recorder.writes.length).toBeGreaterThan(0)
  const body = recorder.writes[0]!.body as { cover_image?: string | null }
  expect(body.cover_image, '保存时配图进 cover_image').toBe('/api/download/u-1/images/cover.png')

  // 移除：字段清空、预览消失（保存时就是 null）
  await page.click('[data-testid="link-cover-clear"]')
  await expect(page.locator('[data-testid="link-cover"]')).toHaveValue('')
  await expect(page.locator('[data-testid="link-cover-thumb"]')).toHaveCount(0)
})

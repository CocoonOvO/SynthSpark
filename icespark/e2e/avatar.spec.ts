import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

import { scanViolations } from './a11y-known'

import { booted } from './helpers'

/**
 * 点阵头像（icespark 自己那份）的用例 —— 架构 §67。
 *
 * 覆盖三层：
 *  1. **路由本身**（真请求，不打桩）：公开读得到、单条 404、写操作必须有令牌 ——
 *     无令牌与假令牌都必须 401，这是「写操作借后端鉴权」这条设计的机器保证；
 *  2. **编辑器**（打桩 + 假令牌，照 §23.4 的口径）：两栏切换、非法输入的原因、
 *     保存发 POST、以及「保存点阵会清掉图片头像」这件事真的发生了
 *     （字符串是**一行** 256 个字，点阵栏不另放预览 —— 左边那张预览就跟着它变）；
 *  3. **展示优先级**（图片 → 点阵 → 名字）：同时有两张时图片赢，把图片清掉就看到点阵。
 *
 * 画布读像素是同一套 `PixelAvatar` 的输出：`0` = paper(#FFFFFF)、`5` = blue500(#3D9BD0)，
 * 所以「全 5 的点阵」画出来是纯 #3D9BD0，「纯白图片」量化后是纯 #FFFFFF —— 两者一眼可分。
 */

const BLUE500 = '61,155,208' // 调色板下标 5
const INK = '18,58,82' // 调色板下标 7
const WHITE = '255,255,255'

/** 一张 1×1 纯白 PNG（data URL）：走「图片头像」那条路，量化后画布就是纯白 */
const WHITE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC'

/** 造一张清一色某下标、能过校验的 16×16 */
const uniform = (ch: string): string[] => Array.from({ length: 16 }, () => ch.repeat(16))

/** 读头像画布某一个像素（画布内部就是 16×16，与 CSS 显示尺寸无关） */
async function pixelAt(page: Page, testid: string, x = 0, y = 0): Promise<string> {
  return page.locator(`[data-testid="${testid}"]`).evaluate(
    (el, [px, py]) => {
      const canvas = el as HTMLCanvasElement
      const ctx = canvas.getContext('2d')!
      const d = ctx.getImageData(px as number, py as number, 1, 1).data
      return [d[0], d[1], d[2]].join(',')
    },
    [x, y],
  )
}

/* ═══════════════════════════ 一 · 路由本身（真请求） ═══════════════════════════ */

test('头像路由：读是公开的（整份 / 单条 / 404），写一律先过后端鉴权', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  // 公开读：整份映射。**不断言里面有什么**（这台机器上可能一个人都没配过）
  const all = await page.request.get('/avatar')
  expect(all.status()).toBe(200)
  const body = (await all.json()) as { version: number; avatars: Record<string, unknown> }
  expect(body.version).toBe(1)
  expect(body.avatars, 'avatars 必须是对象（空对象也是合法的）').toBeTruthy()
  expect(Array.isArray(body.avatars)).toBe(false)

  // 单条：不存在的用户名必须 404 且带人话
  const missing = await page.request.get('/avatar/绝对不存在的用户')
  expect(missing.status()).toBe(404)
  expect(((await missing.json()) as { detail: string }).detail).toContain('没有这个用户')

  // 写：没有令牌 401
  const noToken = await page.request.post('/avatar', { data: { rows: uniform('0') } })
  expect(noToken.status()).toBe(401)
  expect(((await noToken.json()) as { detail: string }).detail).toContain('登录')

  // 写：假令牌也是 401 —— 因为它是**拿去后端换身份**换不到，不是本地自己判的
  const badToken = await page.request.post('/avatar', {
    headers: { Authorization: 'Bearer e2e-token' },
    data: { rows: uniform('0') },
  })
  expect(badToken.status()).toBe(401)
  expect(((await badToken.json()) as { detail: string }).detail).toContain('令牌无效')

  // DELETE 同一条门
  const noTokenDelete = await page.request.delete('/avatar')
  expect(noTokenDelete.status()).toBe(401)

  // skill.md：给 Agent 看的**英文纯文本**（不是 HTML、也不是 JSON）——
  // 它要是坏了或者变成半个网页，Agent 就没法照着它学会用这套机制
  for (const path of ['/avatar/skill.md', '/avatar/SKILL.md']) {
    const skill = await page.request.get(path)
    expect(skill.status(), path).toBe(200)
    expect(skill.headers()['content-type'], path).toContain('text/plain')
    const text = await skill.text()
    expect(text.startsWith('# Skill: pixel avatars'), path).toBe(true)
    expect(text, '不许把 HTML 塞进来').not.toContain('<html')
    expect(text, '不许把 HTML 塞进来').not.toContain('<div')
    // Agent 靠这几条学会用：四个端点、怎么拿令牌、以及「图片会盖住点阵」这条坑
    for (const needle of [
      'GET    /avatar',
      'GET    /avatar/<username>',
      'POST   /avatar',
      'DELETE /avatar',
      'Authorization: Bearer',
      '/api/users/me',
      'users.avatar_url',
    ]) {
      expect(text, `${path} 少了「${needle}」`).toContain(needle)
    }
    // 正文里给的示例串必须真的是合法形状（256 个 0-7），否则照抄就 400
    const samples = [...text.matchAll(/\{"rows":"([0-7]+)"\}/g)].map((m) => m[1])
    expect(samples.length, path).toBeGreaterThan(0)
    for (const sample of samples) expect(sample).toHaveLength(256)
  }
})

/* ═══════════════════════════ 二 · 编辑器（打桩） ═══════════════════════════ */

interface Me {
  username: string
  email: string
  display_name: string
  avatar_url: string
  bio: string
}

const ME: Me = {
  username: 'e2e_user',
  email: 'e2e@example.com',
  display_name: '测试账号',
  avatar_url: '',
  bio: '',
}

function fullUser(me: Me): Record<string, unknown> {
  return {
    id: 'e2e-id',
    user_type: 'user',
    is_active: true,
    is_superuser: false,
    created_at: '2026-01-01T00:00:00Z',
    ...me,
  }
}

interface Stub {
  me: Me
  /** `POST /avatar` 收到的 rows，按顺序 */
  posts: string[][]
  /** `DELETE /avatar` 的次数 */
  deletes: number
  /** `PUT /api/users/me` 的请求体 */
  puts: Record<string, unknown>[]
}

/**
 * 登录态 + `/api/*` 打桩；`/avatar` 单独打桩（它的响应由用例决定）。
 * `avatarReply` 传 null 表示「这台部署没有这条路由」（404）。
 */
async function loggedIn(
  page: Page,
  options: { me?: Me; avatars?: Record<string, string[]> | null } = {},
): Promise<Stub> {
  const me = { ...(options.me ?? ME) }
  const stub: Stub = { me, posts: [], deletes: 0, puts: [] }

  await page.addInitScript((u) => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
    localStorage.setItem('synthspark-token', 'e2e-token')
    localStorage.setItem(
      'synthspark-icespark-user',
      JSON.stringify({ username: u.username, display_name: u.display_name, is_superuser: false }),
    )
  }, me)

  await page.route(/\/api\/auth\/me$/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(fullUser(stub.me)),
  }))

  await page.route(/\/api\/users\/me/, async (route) => {
    const request = route.request()
    if (request.method() !== 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fullUser(stub.me)) })
      return
    }
    const payload = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>
    stub.puts.push(payload)
    Object.assign(stub.me, payload)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fullUser(stub.me)) })
  })

  // 点阵路由：读返回夹具，写按「服务端」的规矩回话（用户名从令牌里解出来 —— 这里就是夹具用户）
  const map = options.avatars
  await page.route(/\/avatar$/, async (route: Route) => {
    const method = route.request().method()
    if (map === null) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not Found' }) })
      return
    }
    if (method === 'GET') {
      const avatars: Record<string, unknown> = {}
      for (const [name, rows] of Object.entries(map ?? {})) avatars[name] = { rows, updatedAt: 'now' }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: 1, avatars }),
      })
      return
    }
    if (method === 'POST') {
      const payload = JSON.parse(route.request().postData() ?? '{}') as { rows: string[] }
      stub.posts.push(payload.rows)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ username: stub.me.username, rows: payload.rows, updatedAt: 'now' }),
      })
      return
    }
    stub.deletes += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ username: stub.me.username, removed: true }),
    })
  })

  return stub
}

test('两栏切换：没有图片头像但有配过点阵时，默认就落在点阵那一栏', async ({ page }) => {
  await loggedIn(page, { avatars: { e2e_user: uniform('5') } })
  await page.goto('/profile')
  await booted(page)
  await expect(page.locator('[data-testid="profile-form"]')).toBeVisible()

  await expect(page.locator('[data-testid="avatar-mode-pixels"]')).toHaveAttribute('aria-pressed', 'true')
  // 字符串是**一行** 256 个字（页面上的写法），不是十六行
  await expect(page.locator('[data-testid="avatar-grid-text"]')).toHaveValue('5'.repeat(256))
  await expect.poll(() => pixelAt(page, 'profile-avatar-canvas')).toBe(BLUE500)

  // 切回图片栏：文件框在，点阵编辑框不在
  await page.click('[data-testid="avatar-mode-photo"]')
  await expect(page.locator('[data-testid="profile-avatar-file"]')).toBeVisible()
  await expect(page.locator('[data-testid="avatar-grid-text"]')).toHaveCount(0)
  // 图片栏里照样看得见「你还有一张点阵头像」这句话，不至于以为它没了
  await expect(page.locator('[data-testid="avatar-photo-shadow-hint"]')).toBeVisible()
})

test('点阵栏：非法输入给得出原因、保存发 POST、并把会盖住它的图片头像一并清掉', async ({ page }) => {
  const stub = await loggedIn(page, {
    me: { ...ME, avatar_url: WHITE_PNG },
    avatars: {},
  })
  await page.goto('/profile')
  await booted(page)
  await expect(page.locator('[data-testid="profile-form"]')).toBeVisible()

  // 有图片头像时默认看图片那一栏，而且预览就是那张图（量化成纯白）
  await expect(page.locator('[data-testid="avatar-mode-photo"]')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => pixelAt(page, 'profile-avatar-canvas')).toBe(WHITE)

  await page.click('[data-testid="avatar-mode-pixels"]')
  await expect(page.locator('[data-testid="avatar-grid-shadow-hint"]')).toBeVisible()

  // 少了一行（240 个字）：保存键禁用，而且**立刻**把原因说出来（不是点了才骂）
  await page.fill('[data-testid="avatar-grid-text"]', '5'.repeat(240))
  await expect(page.locator('[data-testid="avatar-grid-save"]')).toBeDisabled()
  await expect(page.locator('[data-testid="avatar-grid-invalid"]')).toContainText('刚好 15 行')
  expect(stub.posts).toEqual([]) // 一个请求都没发

  // 合法（连写 256 字也认）：保存 → 发 POST + 清掉图片头像
  await page.fill('[data-testid="avatar-grid-text"]', '7'.repeat(256))
  await expect(page.locator('[data-testid="avatar-grid-save"]')).toBeEnabled()
  await page.click('[data-testid="avatar-grid-save"]')
  await expect(page.locator('[data-testid="avatar-grid-ok"]')).toContainText('点阵头像')

  expect(stub.posts).toEqual([uniform('7')])
  expect(stub.puts, '为了让它显示出来，必须把图片头像清掉').toEqual([{ avatar_url: '' }])
  // 图片被清掉、点阵生效：预览从「纯白的图」变成「全 7 的点阵」（ink）
  await expect.poll(() => pixelAt(page, 'profile-avatar-canvas')).toBe(INK)

  // 清除点阵 → DELETE 一次
  await page.click('[data-testid="avatar-grid-clear"]')
  await expect(page.locator('[data-testid="avatar-grid-ok"]')).toContainText('已清掉')
  expect(stub.deletes).toBe(1)
})

test('点阵栏：这条路由不存在（静态部署）时给一句人话，而不是报错', async ({ page }) => {
  await loggedIn(page, { avatars: null })
  await page.goto('/profile')
  await booted(page)
  await page.click('[data-testid="avatar-mode-pixels"]')

  await expect(page.locator('[data-testid="avatar-grid-unavailable"]')).toBeVisible()
  await expect(page.locator('[data-testid="avatar-grid-text"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="avatar-grid-save"]')).toHaveCount(0)
})

test('点阵栏：键盘也能走完（Tab 到切换键、回车切栏、编辑器里能打字、axe 无新增违规）', async ({
  page,
}) => {
  await loggedIn(page, { avatars: { e2e_user: uniform('5') } })
  await page.goto('/profile')
  await booted(page)

  // 原生焦点 + 回车：切回图片栏再切回来（真按钮的原生行为，页面不抢键）
  await page.locator('[data-testid="avatar-mode-photo"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="avatar-mode-photo"]')).toHaveAttribute('aria-pressed', 'true')
  await page.locator('[data-testid="avatar-mode-pixels"]').focus()
  await page.keyboard.press('Space')
  await expect(page.locator('[data-testid="avatar-mode-pixels"]')).toHaveAttribute('aria-pressed', 'true')

  // 编辑框里打字：键盘不会被外壳吃掉（这是可编辑目标，按键归浏览器）
  await page.locator('[data-testid="avatar-grid-text"]').fill('')
  await page.locator('[data-testid="avatar-grid-text"]').type('5'.repeat(16))
  await expect(page.locator('[data-testid="avatar-grid-text"]')).toHaveValue('5'.repeat(16))
  await expect(page.locator('[data-testid="avatar-grid-invalid"]')).toContainText('需要 256 个字符')

  // axe：点阵那一栏的 DOM 也要干净
  const violations = scanViolations(await new AxeBuilder({ page }).analyze()).violations
  expect(violations).toEqual([])
})

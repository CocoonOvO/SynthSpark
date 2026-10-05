import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { booted } from './helpers'

/**
 * **真实账号登录链路**（默认跳过）—— 覆盖审计里那条一直没门的路径。
 *
 * 全站其它 spec 都是「伪造 `synthspark-token` + 打桩 `/api/auth/me`」（§23.4 的自我约束：
 * 不依赖真账号密码），好处是不用凭据、坏处是 `POST /api/auth/token` 这条**真链路**
 * —— 表单体形状、令牌落库、`/api/auth/me` 校验、菜单随权限变化 —— 一次都没有机器守过。
 * 这一份补的就是它，手法照后端 `tests/test_smoke.py`：**凭据从环境变量来，没有就跳过**
 * （跳过而不是假绿），文件里不写任何账号密码。
 *
 * 跑法（真后端 8002 + dev 5175 都在）：
 *
 * ```bash
 * cd icespark
 * ICESPARK_E2E_USER=xxx ICESPARK_E2E_PW=yyy npx playwright test e2e/real-login.spec.ts
 * ```
 *
 * 断言刻意**与角色无关**（普通用户 / 超管都能跑）：登录框关闭、账号行显示「退出登录」
 * 且昵称与 `/api/auth/me` 一致、令牌真的能换到 `/api/auth/me` 的 200、菜单行数 ≥ 8；
 * 只有「是不是超管」这一条按 `/api/auth/me` 的返回值分支判（超管才有四张管理页的行）。
 */

/**
 * 凭据来源（优先级从高到低）：
 *   1. 环境变量 `ICESPARK_E2E_USER` / `ICESPARK_E2E_PW`（CI 与临时跑法）；
 *   2. 本机文件 `e2e/.credentials.local.json`（**已 gitignore**，由维护者创建一次即可，见 §54）。
 * 两者都没有就跳过 —— 跳过而不是假绿，文件里也永不写账号密码。
 */
function localCredentials(): { user: string; pw: string } | null {
  try {
    const raw = readFileSync(new URL('./.credentials.local.json', import.meta.url), 'utf8')
    const parsed = JSON.parse(raw) as { user?: string; pw?: string }
    return parsed.user && parsed.pw ? { user: parsed.user, pw: parsed.pw } : null
  } catch {
    return null
  }
}

const local = localCredentials()
const USER = process.env.ICESPARK_E2E_USER ?? local?.user ?? ''
const PASS = process.env.ICESPARK_E2E_PW ?? local?.pw ?? ''

test.skip(
  !USER || !PASS,
  '没有真实测试账号（环境变量 ICESPARK_E2E_USER / ICESPARK_E2E_PW，或本机 e2e/.credentials.local.json）—— 跳过真实登录链路',
)

test.beforeEach(async ({ page }) => {
  // 音效询问框是外壳级模态，会挡住第一次点击（与其它 spec 同一处理）
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
})

/** 走真实登录框：P → 账号行 → 填表 → 提交 → 等登录框关闭 */
async function realLogin(page: Page): Promise<void> {
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  await page.click('[data-testid="pause-account"]')
  await expect(page.locator('[data-testid="login-dialog"]')).toBeVisible()
  await page.fill('[data-testid="login-username"]', USER)
  await page.fill('[data-testid="login-password"]', PASS)
  await page.click('[data-testid="login-submit"]')
  await expect(page.locator('[data-testid="login-dialog"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
}

/** 用**页面里那把令牌**换一次 `/api/auth/me` —— 令牌是不是真的能用，只有后端说了算 */
async function meViaToken(page: Page): Promise<{ is_superuser: boolean; display_name: string }> {
  const token = await page.evaluate(() => localStorage.getItem('synthspark-token'))
  expect(token, '登录后本地应当有令牌').toBeTruthy()
  const response = await page.request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.status(), '令牌应当能换到 /api/auth/me 的 200').toBe(200)
  return (await response.json()) as { is_superuser: boolean; display_name: string }
}

test('真实登录：请求体是表单编码，登录后外壳立刻认账且令牌真的能用', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  await page.keyboard.press('p')
  await page.click('[data-testid="pause-account"]')
  await expect(page.locator('[data-testid="login-dialog"]')).toBeVisible()
  await page.fill('[data-testid="login-username"]', USER)
  await page.fill('[data-testid="login-password"]', PASS)

  // 抓真请求：口令模式要求 `application/x-www-form-urlencoded`（不是 JSON body）
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/api/auth/token')),
    page.click('[data-testid="login-submit"]'),
  ])
  expect(request.headers()['content-type'] ?? '').toContain('application/x-www-form-urlencoded')
  const body = request.postData() ?? ''
  expect(body).toContain('username=')
  expect(body).toContain('password=')
  expect(body).not.toContain('{') // 不是 JSON

  // 登录框关掉、菜单留着，账号行换成「退出登录（昵称）」
  await expect(page.locator('[data-testid="login-dialog"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  const me = await meViaToken(page)
  await expect(page.locator('[data-testid="pause-account"]')).toContainText('退出登录')
  await expect(page.locator('[data-testid="pause-account"]')).toContainText(me.display_name)

  // 登录后才有的两行真入口（写作 / 个人信息）—— 与角色无关
  await expect(page.locator('[data-row="edit"]')).toHaveCount(1)
  await expect(page.locator('[data-row="profile"]')).toHaveCount(1)

  // 超管才有的四张管理页入口：按 `/api/auth/me` 的返回值分支，别把角色写死
  const adminRows = ['site', 'links', 'audit'] as const
  for (const row of adminRows) {
    await expect(page.locator(`[data-row="${row}"]`)).toHaveCount(me.is_superuser ? 1 : 0)
  }
})

test('真实登录后刷新：登录态是后端校验出来的，不是本地瞎认', async ({ page }) => {
  await page.goto('/')
  await booted(page)
  await realLogin(page)

  const before = await page.evaluate(() => localStorage.getItem('synthspark-icespark-user'))
  expect(before, '登录后本地应当有用户缓存').toBeTruthy()

  await page.reload()
  await booted(page)
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause-account"]')).toContainText('退出登录')
  // 刷新后菜单仍是登录态的行数（未登录是 6 行；登录后至少多出写作 + 个人信息两行）
  expect(await page.locator('.pause-rows .row').count()).toBeGreaterThanOrEqual(8)
})

test('真实登录后登出：菜单回到未登录，本地两把键都清空', async ({ page }) => {
  await page.goto('/')
  await booted(page)
  await realLogin(page)

  // 登录态下点账号行 = 退出登录
  await page.click('[data-testid="pause-account"]')
  await expect(page.locator('[data-testid="pause-account"]')).toContainText('登录')
  await expect(page.locator('[data-row="edit"]')).toHaveCount(0)

  const left = await page.evaluate(() => ({
    token: localStorage.getItem('synthspark-token'),
    user: localStorage.getItem('synthspark-icespark-user'),
  }))
  expect(left).toEqual({ token: null, user: null })

  // 登出之后键盘还活着：ESC 能关菜单
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
})

/**
 * 点阵头像（架构 §67）的**真链路**：写操作要借后端鉴权，这条只有真令牌能验。
 *
 * 用例自己收拾现场：先读一份原来的（可能没有），跑完再放回去 ——
 * 本机那份 `avatars.local.json` 是维护者的手改文件，不该被测试留下脚印。
 */
test('真实令牌：点阵头像能存、公开读得到、界面里看得见、能删', async ({ page }) => {
  await page.goto('/')
  await booted(page)
  await realLogin(page)

  const token = await page.evaluate(() => localStorage.getItem('synthspark-token'))
  expect(token, '登录后本地应当有令牌').toBeTruthy()
  const me = await page.request.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
  const username = ((await me.json()) as { username: string }).username
  const auth = { Authorization: `Bearer ${token}` }
  const url = `/avatar/${encodeURIComponent(username)}`

  // 先记下现场（可能 404 = 原来没配过）
  const before = await page.request.get(url)
  const beforeRows = before.ok() ? ((await before.json()) as { rows: string[] }).rows : null

  // 下标 6 = blue700(#1B5A7D)：与「名字哈希那张脸」和纯白都不同，画布上一眼能认出来
  const rows = Array.from({ length: 16 }, () => '6'.repeat(16))
  const saved = await page.request.post('/avatar', { headers: auth, data: { rows } })
  expect(saved.status(), '真令牌应当能存').toBe(200)
  expect(((await saved.json()) as { username: string }).username).toBe(username)

  // 公开读（**不带令牌**）也要读得到 —— 展示别人才是它的主要用途
  const published = await page.request.get(url)
  expect(published.status()).toBe(200)
  expect(((await published.json()) as { rows: string[] }).rows).toEqual(rows)

  // 界面：这个账号没有图片头像，于是默认落在点阵栏、预览就是刚存的那张
  await page.goto('/profile')
  await booted(page)
  await expect(page.locator('[data-testid="profile-form"]')).toBeVisible()
  await expect(page.locator('[data-testid="avatar-mode-pixels"]')).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(() =>
      page.locator('[data-testid="profile-avatar-canvas"]').evaluate((el) => {
        const d = (el as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 1, 1).data
        return [d[0], d[1], d[2]].join(',')
      }),
    )
    .toBe('27,90,125')

  // 收拾现场：原来有就放回去，原来没有就删掉
  if (beforeRows) {
    const restore = await page.request.post('/avatar', { headers: auth, data: { rows: beforeRows } })
    expect(restore.status()).toBe(200)
  } else {
    const removed = await page.request.delete('/avatar', { headers: auth })
    expect(removed.status()).toBe(200)
    const gone = await page.request.get(url)
    expect(gone.status(), '删掉之后公开读应当 404').toBe(404)
  }
})

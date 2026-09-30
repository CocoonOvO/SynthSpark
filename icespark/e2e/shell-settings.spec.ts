import { expect, test, type Page } from '@playwright/test'

import { booted } from './helpers'

/**
 * 外壳三件套的**细节口径**：设置弹窗的三行 / 暂停菜单的行内容 / 登录失败的原文 / 刷新后的登录态。
 *
 * 这道门补的是样机 `design/icespark-prototype/e2e/smoke.mjs` 里已经冻结、而生产侧
 * 「断言强度不足或零覆盖」的几条：
 * - 设置只留展示相关的三项，信号强度与数据来源两行**删掉就不许回流**（§6 第 2 条用户裁定）；
 * - 菜单**没有**返回上一页 / 转到下一页两行（全站能力走 Q / E），也没有信号强度行；
 * - 登录失败时页面上显示的是**后端 detail 原文**，不是前端自造的「登录失败」（样机最会撒谎的一处）；
 * - 刷新后的登录态**来自 `/api/auth/me` 的校验**，不是本地瞎认 —— 正向 + 反向各一条。
 *
 * 与邻居的分工（不重复钉已经钉过的东西）：
 * - `pause.spec.ts` 负责菜单/弹窗的开关、键盘鼠标等价、搜索态、提示行；
 * - `admin-guard.spec.ts` 负责**行数**（未登录 6 / 非超管 8 / 超管 11）与按权限显隐；
 *   本文件不再按标签重复那些，而是把**行序（每行是谁）**、负向行、登录前后账号行差异钉住；
 * - 超管那三行（站点设置 / 外链管理 / 审计日志）由 `admin-guard.spec.ts` 与各自的 spec 负责，
 *   这里固定用非超管账号，免得两条用例抢同一份口径。
 *
 * 打桩照样机与兄弟 spec 的手法（§23.4）：`synthspark-icespark-sound-prompt=1` 挡掉首次手势的
 * 音效询问框；登录态写 `synthspark-token` + `synthspark-icespark-user` 两把键，
 * **并且**把 `/api/auth/me` 打桩成同一个用户（外壳挂载时会 `bootstrapAuth()` 校验一次，
 * 不桩的话假令牌拿 401 → store 登出 → 菜单只剩 6 行）。
 */

/** 登录态用的假用户：**非超管**，菜单正好 8 行（超管那三行不归本文件管） */
const NORMAL_USER = {
  id: 'e2e-id',
  username: 'e2e_user',
  display_name: '测试用户',
  is_superuser: false,
}

/** 桩的活状态与计数：`me` 可以在用例中途翻转（刷新后还认不认这个令牌，全看它） */
interface Recorder {
  /** `/api/auth/me` 被请求了几次 —— 「刷新后仍是登录态」必须伴随一次后端校验，不是白拿本地缓存 */
  meHits: number
  /** 中途改 `/api/auth/me` 的应答：同一个假令牌，后端说失效就该登出 */
  setMe: (status: 200 | 401) => void
  /** `POST /api/auth/token` 收到的 form body（用来确认走的确实是 form-urlencoded） */
  tokenBodies: string[]
}

interface StubOptions {
  /** 登录态写进 localStorage 的用户；不传 = 未登录（不写令牌） */
  user?: Record<string, unknown> | null
  /** `/api/auth/me` 的初始应答；默认 401（未登录时后端不该参与） */
  me?: 200 | 401
  /** `POST /api/auth/token` 失败时回的 detail 原文 */
  detail?: string
}

/**
 * 装桩：登录态两把键（不传 `user` 就是未登录）+ **一条**正则 route。
 *
 * 为什么 route 只注册一条：Playwright 里多条 route 同时命中时**只有最后注册的那条生效**，
 * `/api/auth/me` 与 `/api/auth/token` 拆成两条看似清楚，一旦以后有人再补一条就会把前一条
 * 整条盖掉、用例无声地退回真接口。所以按 pathname 内部分派，谁都不会被盖。
 */
async function stubAuth(page: Page, options: StubOptions = {}): Promise<Recorder> {
  const user = options.user ?? null
  const state = { me: options.me ?? 401, detail: options.detail ?? '用户名或密码错误' }
  const recorder: Recorder = {
    meHits: 0,
    setMe: (status) => {
      state.me = status
    },
    tokenBodies: [],
  }

  await page.addInitScript((u) => {
    // 首次手势的音效询问框会吃掉点击（它是 pause 作用域的模态），先标记成「问过了」
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
    if (!u) return
    localStorage.setItem('synthspark-token', 'e2e-token')
    localStorage.setItem('synthspark-icespark-user', JSON.stringify(u))
  }, user)

  await page.route(/\/api\/auth\//, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname

    if (path.endsWith('/auth/me')) {
      recorder.meHits += 1
      if (state.me === 401) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: '{"detail":"令牌无效"}',
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user ?? {}),
      })
      return
    }

    if (path.endsWith('/auth/token')) {
      recorder.tokenBodies.push(request.postData() ?? '')
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: state.detail }),
      })
      return
    }

    // 兜底：本文件以外的 auth 端点一律 404，别让没打桩的请求漏到真后端
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{"detail":"这个 auth 端点没打桩"}',
    })
  })

  return recorder
}

/** 打开暂停菜单（走软键的鼠标路径，和用户手点一样） */
async function openMenu(page: Page): Promise<void> {
  await page.click('[data-testid="softkey-menu"]')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
}

/** 菜单行序（每行的 `data-row` 名）—— 一次断言「行数 + 每行是谁」 */
async function rowIds(page: Page): Promise<(string | null)[]> {
  return page
    .locator('.pause-rows .row')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-row')))
}

// ── A. 设置弹窗只留展示相关项 ──

test('设置弹窗：只有展示相关的三行（音效 / 每页条数 / 动效）', async ({ page }) => {
  await stubAuth(page)
  await page.goto('/')
  await booted(page)

  await openMenu(page)
  await page.click('[data-testid="pause-settings"]')

  const dialog = page.locator('[data-testid="settings-dialog"]')
  await expect(dialog).toBeVisible()

  // 口径（SettingsDialog.vue 的 `rows`）：设置里只放影响展示效果的项，多一项都不算
  const rows = dialog.locator('.rows .row')
  await expect(rows).toHaveCount(3)

  // testid 由源码 `` `set-${row.key}` `` 生成，三行依次是 sound / pageSize / motion
  expect(
    await rows.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid'))),
    '三行的 testid 要与 SettingsDialog.vue 的 rows.key 对得上',
  ).toEqual(['set-sound', 'set-pageSize', 'set-motion'])
  expect(await rows.locator('.row-label').allTextContents()).toEqual(['音效', '每页条数', '动效'])

  // 负向：样机删掉的两行（信号强度 / 数据来源）——「与展示无关的迁移出去」就是这条口径
  await expect(dialog.locator('[data-testid="set-signal"]')).toHaveCount(0)
  await expect(dialog.locator('[data-testid="set-source"]')).toHaveCount(0)
})

// ── B. 暂停菜单的行内容 ──

test('未登录菜单：6 行，没有返回上一页 / 转到下一页 / 信号强度这三行', async ({ page }) => {
  await stubAuth(page)
  await page.goto('/')
  await booted(page)
  await openMenu(page)

  const rows = page.locator('.pause-rows .row')
  await expect(rows).toHaveCount(6)
  expect(await rowIds(page), '未登录的行序：继续 / 搜索 / 音效 / 登录 / 设置 / 返回主菜单').toEqual(
    ['resume', 'search', 'sound', 'account', 'settings', 'home'],
  )

  // 负向：前进后退是全站能力（Q / E），菜单里从样机起就没有行；信号强度全站固定最高档，也不做行
  for (const id of ['back', 'forward', 'signal']) {
    await expect(page.locator(`[data-row="${id}"]`), `菜单里不该有 ${id} 行`).toHaveCount(0)
  }

  // 账号行是「登录」，不是已登录的「退出登录」
  const account = page.locator('[data-row="account"]')
  await expect(account).toContainText('登录')
  await expect(account).not.toContainText('退出登录')
})

test('登录后菜单：行序逐行对得上，写作 / 个人信息是真链接，账号行变「退出登录」', async ({
  page,
}) => {
  await stubAuth(page, { user: NORMAL_USER, me: 200 })
  await page.goto('/')
  await booted(page)
  await openMenu(page)

  const rows = page.locator('.pause-rows .row')
  await expect(rows).toHaveCount(8)
  expect(await rowIds(page), '登录后的行序：账号行之下多出写作与个人信息两个真入口').toEqual([
    'resume',
    'search',
    'sound',
    'account',
    'edit',
    'profile',
    'settings',
    'home',
  ])

  // 两个真入口：链接行渲染成真 `<a>`（可复制、可中键新开），并且各自带着自己的路由
  const edit = page.locator('[data-row="edit"]')
  await expect(edit).toContainText('编辑文章')
  expect(await edit.evaluate((el) => el.tagName)).toBe('A')
  await expect(edit).toHaveAttribute('href', '/write')

  const profile = page.locator('[data-row="profile"]')
  await expect(profile).toContainText('个人信息编辑')
  expect(await profile.evaluate((el) => el.tagName)).toBe('A')
  await expect(profile).toHaveAttribute('href', '/profile')

  // 账号行：文案带昵称，是「退出登录」而不是「登录」（未登录那条的同名反向断言在上一支用例里）
  await expect(page.locator('[data-row="account"]')).toContainText('退出登录（测试用户）')
})

// ── C. 登录失败显示后端 detail 原文 ──

test('登录失败：页面上显示的就是后端 detail 原文', async ({ page }) => {
  // 独一无二的 detail：页面上出现它，就只可能来自桩的响应体
  const detail = '用户名或密码错误（自查串 7f3a）'
  const stub = await stubAuth(page, { detail })

  await page.goto('/')
  await booted(page)

  await openMenu(page)
  await page.click('[data-testid="pause-account"]')
  await expect(page.locator('[data-testid="login-dialog"]')).toBeVisible()

  await page.fill('[data-testid="login-username"]', '任意用户名')
  await page.fill('[data-testid="login-password"]', '任意密码')
  await page.click('[data-testid="login-submit"]')

  const err = page.locator('[data-testid="login-error"]')
  await expect(err).toBeVisible()
  // 逐字包含桩里的 detail 原文：前端 401 的兜底文案是「用户名或密码错误」（没有括号里的自查串），
  // 页面上出现这段带后缀的原文 ⇒ 显示的就是后端给的那句，弹窗一个字都没改写
  await expect(err).toContainText(detail)
  // 反向排掉两条前端自造的文案：HTTP 状态码兜底与本地非 401 分支
  await expect(err).not.toContainText('登录失败（HTTP 401）')
  await expect(err).not.toContainText('连不上后端')

  // 请求确实是 form-urlencoded（OAuth2 密码流的端点不吃 JSON）
  expect(stub.tokenBodies).toHaveLength(1)
  expect(stub.tokenBodies[0]).toContain('username=')
  expect(stub.tokenBodies[0]).toContain('password=')

  // 失败不关框：错误留在框里，用户能直接重试
  await expect(page.locator('[data-testid="login-dialog"]')).toBeVisible()
})

// ── D. 刷新后的登录态来自后端校验 ──

test('刷新后仍是登录态：/api/auth/me 回 200，令牌与菜单形态都保住', async ({ page }) => {
  const stub = await stubAuth(page, { user: NORMAL_USER, me: 200 })
  await page.goto('/')
  await booted(page)
  await openMenu(page)
  await expect(page.locator('.pause-rows .row')).toHaveCount(8)
  await expect(page.locator('[data-row="account"]')).toContainText('退出登录（测试用户）')

  await page.reload()
  await booted(page)

  // 刷新 = 重新挂载外壳，`bootstrapAuth()` 会拿缓存令牌再问一次后端 —— 这次校验必须真发生过
  await expect
    .poll(() => stub.meHits, { message: '刷新后外壳要重新校验一次 /api/auth/me' })
    .toBeGreaterThanOrEqual(2)
  expect(await page.evaluate(() => localStorage.getItem('synthspark-token'))).toBe('e2e-token')

  // 菜单形态原样保住：还是登录后才有的 8 行
  await openMenu(page)
  await expect(page.locator('.pause-rows .row')).toHaveCount(8)
  expect(await rowIds(page)).toContain('edit')
  await expect(page.locator('[data-row="account"]')).toContainText('退出登录（测试用户）')
})

test('刷新后登出：同一个假令牌，/api/auth/me 回 401 时外壳把它清掉并回到「登录」', async ({
  page,
}) => {
  const stub = await stubAuth(page, { user: NORMAL_USER, me: 200 })
  await page.goto('/')
  await booted(page)
  await openMenu(page)
  await expect(page.locator('[data-row="account"]')).toContainText('退出登录（测试用户）')

  // 后端改口：这个令牌不认了（过期 / 被撤销），本地那两把键一个字都没动
  stub.setMe(401)
  await page.reload()
  await booted(page)

  // 外壳只信后端：401 一到就登出，账号行回到「登录」，写作 / 个人信息入口一起消失
  await openMenu(page)
  const account = page.locator('[data-row="account"]')
  await expect(account).toContainText('登录')
  await expect(account).not.toContainText('退出登录')
  await expect(page.locator('.pause-rows .row')).toHaveCount(6)
  await expect(page.locator('[data-row="edit"]')).toHaveCount(0)

  // 令牌与用户缓存都被清掉，不是只在界面上装作登出
  await expect.poll(() => page.evaluate(() => localStorage.getItem('synthspark-token'))).toBeNull()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('synthspark-icespark-user')))
    .toBeNull()
})

import { expect, test, type Page } from '@playwright/test'

import { booted } from './helpers'

/**
 * P5 的**外壳级**鉴权门（架构 §23.1 / §23.3）。
 *
 * 这里验的是「四张页面共有」的那部分：未登录深链接怎么处理、提示给谁看、
 * 菜单里的行按权限显隐。页面自己的内容与接口由各自的 spec 负责
 * （`profile.spec.ts` / `admin-site.spec.ts` / `admin-links.spec.ts` / `admin-audit.spec.ts`）。
 *
 * 两条不依赖真账号的登录态手法（§23.4）：
 * - 未登录：什么都不写，顺手把 `/api/auth/me` 打桩成 401（不让真后端参与）；
 * - 登录：写 `synthspark-token` + `synthspark-icespark-user` 两把键，
 *   并把 `/api/auth/me` 打桩成同一个用户（外壳挂载时会 `bootstrapAuth()` 校验一次，
 *   不桩的话假令牌拿 401 → store 登出 → 菜单只剩 6 行）。
 */

/** 未登录：真后端不参与，`bootstrapAuth` 的校验直接给 401 */
async function anonymous(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"无效"}' }),
  )
}

/** 登录态：令牌与用户缓存都写进去，`/api/auth/me` 回同一份 */
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

test('未登录深链接进需鉴权页：回主页 + 弹出登录框 + 一句提示（四个路径各来一次）', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await anonymous(page)

  for (const path of ['/profile', '/admin/site', '/admin/links', '/admin/audit']) {
    await page.goto(path)
    await booted(page)

    // URL 回落到主页：地址栏不能停在没权限的页面上
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('[data-testid="login-dialog"]')).toBeVisible()
    await expect(page.locator('[data-testid="login-notice"]')).toHaveText('这个页面要先登录')
    // 登录框是外壳级模态：屏幕上不能同时又有菜单
    await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
    await expect(page.locator('.app')).toHaveAttribute('data-scope', 'pause')

    // 退出这一轮，下一轮从头开始（关框走 ESC，与用户手动取消同一条路）
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="login-dialog"]')).toHaveCount(0)
    // 关键：守卫进来的框关掉之后**不该**冒出暂停菜单（loginFromMenu 的意义）
    await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
    await expect(page.locator('.app')).toHaveAttribute('data-scope', 'scene')
  }

  expect(errors).toEqual([])
})

test('登录后从菜单进页面：菜单行按权限显隐，点了就跳过去并关掉菜单', async ({ page }) => {
  await loggedIn(page, true)
  await page.goto('/')
  await booted(page)

  await page.keyboard.press('p')
  const rows = page.locator('.pause-rows .row')
  await expect(rows).toHaveCount(11)
  for (const label of ['个人信息编辑', '站点设置', '外链管理', '审计日志']) {
    await expect(page.locator('.pause-rows .row', { hasText: label })).toHaveCount(1)
  }

  await page.locator('.pause-rows .row', { hasText: '站点设置' }).click()
  await expect(page).toHaveURL(/\/admin\/site$/)
  // 关菜单再跳：不许出现「菜单压在目标页面上」
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'admin-site')
})

test('非超管：三张管理页的行干脆不出现（不是点进去被拒）', async ({ page }) => {
  await loggedIn(page, false)
  await page.goto('/')
  await booted(page)

  await page.keyboard.press('p')
  // 登录了但不是超管：只剩 编辑文章 + 个人信息编辑
  await expect(page.locator('.pause-rows .row')).toHaveCount(8)
  await expect(page.locator('.pause-rows .row', { hasText: '个人信息编辑' })).toHaveCount(1)
  for (const label of ['站点设置', '外链管理', '审计日志']) {
    await expect(page.locator('.pause-rows .row', { hasText: label })).toHaveCount(0)
  }
})

test('未登录时菜单只有 6 行：四张页面的入口都不出现', async ({ page }) => {
  await anonymous(page)
  await page.goto('/')
  await booted(page)

  await page.keyboard.press('p')
  await expect(page.locator('.pause-rows .row')).toHaveCount(6)
  for (const label of ['编辑文章', '个人信息编辑', '站点设置', '外链管理', '审计日志']) {
    await expect(page.locator('.pause-rows .row', { hasText: label })).toHaveCount(0)
  }
})

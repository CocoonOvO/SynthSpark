import { expect, test } from '@playwright/test'

import { booted } from './helpers'

/**
 * 暂停菜单与设置弹窗 —— 样机的外壳功能，一条都不许少。
 *
 * 这道门的来历：曾把「菜单 (P)」软键当成「依赖页面还没做」给省了。
 * 那是我擅自删功能：菜单本身与页面无关（继续 / 音效 / 设置 / 返回主菜单今天就能用
 * —— 设置里的三项也都有真实偏好存储），页面没做的只有搜索命中后的文章详情与登录页。
 *
 * 覆盖：鼠标与键盘两条路径都能开、能选行、能改值、能关；子弹窗开着时一次按键不走两层。
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
})

test('键盘：P 呼出菜单 → ↑↓ 选行 → ENTER 进设置 → ←→ 改值 → ESC 逐层退回', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  await expect(page.locator('.app')).toHaveAttribute('data-scope', 'pause')

  // 行序照样机：继续 / 搜索 / 音效 / 登录 / 设置 / 返回主菜单
  const rows = page.locator('.pause-rows .row')
  await expect(rows).toHaveCount(6)
  await expect(page.locator('[data-testid="pause-resume"]')).toHaveClass(/is-focused/)

  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="pause-search"]')).toHaveClass(/is-focused/)

  // 跳到「设置」行（继续 ↓ 到 login 行、再一行就是设置）
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="pause-settings"]')).toHaveClass(/is-focused/)

  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="settings-dialog"]')).toBeVisible()

  // ←→ 改值：每页条数 4 → 6 → 4（行序：音效 / 每页条数 / 动效，按一次就到）
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="set-pageSize"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="set-pageSize"]')).toContainText('6')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-testid="set-pageSize"]')).toContainText('4')

  // ESC 先关子弹窗、再关菜单（一次按键不走两层）
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="settings-dialog"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
  await expect(page.locator('.app')).toHaveAttribute('data-scope', 'scene')
})

test('键盘：音效行用 ←→ 切换，与底栏软键状态一致', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  await expect(page.locator('[data-testid="softkey-sound"]')).toHaveText(/OFF/)
  await page.keyboard.press('p')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="pause-sound"]')).toHaveClass(/is-focused/)

  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="pause-sound"] .seg-cell.on')).toHaveText('ON')

  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="softkey-sound"]')).toHaveText(/ON/)
})

test('鼠标：软键点开菜单、划过共享焦点、点行即确认、点分段直接改值', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  await page.click('[data-testid="softkey-menu"]')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()

  await page.hover('[data-testid="pause-home"]')
  await expect(page.locator('[data-testid="pause-home"]')).toHaveClass(/is-focused/)

  // 音效行的 ON/OFF 分段是可直接点的（不必先选行）
  await page.click('[data-testid="pause-sound"] [data-seg="on"]')
  await expect(page.locator('[data-testid="pause-sound"] [data-seg="on"]')).toHaveClass(/on/)

  // 点「继续」关菜单
  await page.click('[data-testid="pause-resume"]')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
})

test('鼠标：设置弹窗里点行即改值，✕ 可关', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  await page.click('[data-testid="softkey-menu"]')
  await page.click('[data-testid="pause-settings"]')
  await expect(page.locator('[data-testid="settings-dialog"]')).toBeVisible()

  await expect(page.locator('[data-testid="set-motion"]')).toContainText('开')
  await page.click('[data-testid="set-motion"]')
  await expect(page.locator('[data-testid="set-motion"]')).toContainText('关')

  await page.click('[data-testid="settings-close"]')
  await expect(page.locator('[data-testid="settings-dialog"]')).toHaveCount(0)
  // 子弹窗关掉后菜单还在（不是一起关掉）
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
})

test('鼠标：点面板外的遮罩即关菜单（等同 ESC）', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()

  // 遮罩层自身接管点击（`@click.self`）：面板之外的区域点一下就该关
  await page.mouse.click(40, 40)
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
  await expect(page.locator('.app')).toHaveAttribute('data-scope', 'scene')
})

test('鼠标：搜索态点面板外只退回行列表，不把整个菜单关掉', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  await page.keyboard.press('p')
  await page.click('[data-testid="pause-search"]')
  await expect(page.locator('[data-testid="pause-search-input"]')).toBeVisible()

  await page.mouse.click(40, 40)
  await expect(page.locator('[data-testid="pause-search-input"]')).toHaveCount(0)
  // 与 ESC 同口径：搜索态先退一层，菜单本身还在
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  await expect(page.locator('.app')).toHaveAttribute('data-scope', 'pause')
})

test('登录：开登录框时菜单先关（两个模态不叠），ESC / 点遮罩都退回菜单', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  await page.keyboard.press('p')
  await page.click('[data-testid="pause-account"]')
  await expect(page.locator('[data-testid="login-dialog"]')).toBeVisible()
  // 关键断言：登录框出现时菜单已经关掉，屏幕上只有一个模态
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
  await expect(page.locator('.app')).toHaveAttribute('data-scope', 'pause')

  // 登录框开着时菜单热键不该在背后又开一层
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="login-dialog"]')).toBeVisible()

  // 键盘这条路：ESC 取消 → 回菜单（不是掉回场景）
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="login-dialog"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  await expect(page.locator('.app')).toHaveAttribute('data-scope', 'pause')

  // 鼠标这条路：再开一次登录框，点遮罩同样回菜单
  await page.click('[data-testid="pause-account"]')
  await expect(page.locator('[data-testid="login-dialog"]')).toBeVisible()
  await page.mouse.click(40, 40)
  await expect(page.locator('[data-testid="login-dialog"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
})

test('登录：密码错误时框不关（错误留在框里），取消后菜单干净回来', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  await page.keyboard.press('p')
  await page.click('[data-testid="pause-account"]')
  await page.fill('[data-testid="login-username"]', 'icespark_user')
  await page.fill('[data-testid="login-password"]', '肯定不是这个密码')
  await page.click('[data-testid="login-submit"]')

  await expect(page.locator('[data-testid="login-error"]')).toBeVisible()
  await expect(page.locator('[data-testid="login-dialog"]')).toBeVisible()
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  // 取消登录不该留提示（提示只在登录成功/登出时给）
  await expect(page.locator('[data-testid="pause-hint"]')).toHaveCount(0)
})

test('搜索态：菜单内直接检索真接口，ESC 逐层退回菜单', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))

  await page.goto('/')
  await booted(page)
  await page.keyboard.press('p')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')

  const input = page.locator('[data-testid="pause-search-input"]')
  await expect(input).toBeVisible()
  await expect(input).toBeFocused()

  // 真请求 /api/search/：只断言「输入 → 有结果区」这条链路不炸，
  // 命中条数取决于后端数据，不写死
  await input.fill('文章')
  await expect(page.locator('[data-testid="pause-search-hits"] .hit-empty.blink')).toHaveCount(0, {
    timeout: 5000,
  })

  await page.keyboard.press('Escape')
  await expect(input).toHaveCount(0)
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()

  expect(errors).toEqual([])
})

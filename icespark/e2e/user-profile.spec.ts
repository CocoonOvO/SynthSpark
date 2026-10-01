import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { scanViolations } from './a11y-known'

import { booted, probeJson } from './helpers'

/**
 * P4 用户档案页（`/user/:username`）的用例。
 *
 * 这一页样机里没有，所以断言只钉「旧前端有的东西 + 本仓硬规则」：
 * 深链接能打开 · 用户卡与文章列表真的渲染出来 · 外壳底栏在 · 键盘与鼠标两条路径等价 ·
 * 用户不存在时是页内空态而不是整页 404 · 运行期零报错。
 *
 * 两条自我约束（与 pages.spec.ts 同一口径）：
 * 1. **不依赖后端有数据**：真用户名从 `/api/posts/?limit=1&status=published` 探，
 *    探不到就 `test.skip`（跳过而不是假绿）；某个人有没有文章也照实际结果分支断言。
 * 2. **开机自检先让位**：每次 `goto` 之后 `await booted(page)`，否则第一次按键会被自检吃掉。
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
})

/** 探一个真实存在的用户名（取已发布文章的作者）。没有数据 / 后端不可达返回 null */
/**
 * 上一次探测「为什么没探到」——六条用例共用这句理由。
 *
 * 为什么要它：探针失败时若只写一句「后端没有已发布文章」，报告里就分不清
 * 「这台机器确实没有文章」（正常跳过）与「后端抖了一下没问到」（异常）——
 * 实测过一次：同一条命令连跑，一次 `181 passed / 4 skipped`、再跑 `182 / 3`。
 * 探针现在带重试（`probeJson`），并且把真实原因带进 `test.skip` 的描述里。
 */
let probeReason = '后端没有可探测的已发布文章'

async function probeAuthor(
  page: Page,
): Promise<{ username: string; displayName: string; total: number } | null> {
  const { data, reason } = await probeJson<{
    total?: number
    items?: { author_username?: string }[]
  }>(page, '/api/posts/?limit=1&status=published')
  const username = data?.items?.[0]?.author_username
  if (!username) {
    probeReason = `探不到已发布文章（${reason}）`
    return null
  }

  // 显示名（优先 display_name）—— 就是这一页 h1 该有的文字
  const info = await probeJson<{ display_name?: string | null }>(
    page,
    `/api/users/by-username/${encodeURIComponent(username)}`,
  )
  probeReason = 'OK'
  const displayName = info.data?.display_name || username
  return { username, displayName, total: data?.total ?? 0 }
}

test('用户档案：深链接直接打开，用户卡 / 统计 / 文章列表 / 底栏都在', async ({ page }) => {
  const found = await probeAuthor(page)
  test.skip(!found, probeReason)
  const { username, displayName, total } = found!

  const errors: string[] = []
  const failed: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('requestfailed', (request) => failed.push(request.url()))
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`)
  })

  await page.goto(`/user/${username}`)
  await booted(page)

  // 场景是 user：底栏点亮 USER 那一格，URL 就是 /user/:username
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'user')
  await expect(page).toHaveURL(new RegExp(`/user/${username}$`))
  await expect(page.locator('[data-testid="deck"]')).toBeVisible()

  // 用户卡：h1 = 显示名（优先 display_name，旧前端口径）、@username、三项统计
  const card = page.locator('[data-testid="user-card"]')
  await expect(card).toBeVisible()
  await expect(card.locator('h1')).toHaveText(displayName)
  await expect(card).toContainText(`@${username}`)
  await expect(page.locator('[data-testid="user-stats"] .pstat')).toHaveCount(3)

  // 文章列表：这个人有已发布文章时，卡片要真的渲染出来（无文章时走 user-empty 空态）
  if (total > 0) {
    await expect(page.locator('[data-testid="user-posts"]')).toBeVisible()
    await expect(page.locator('[data-testid="user-post-card"]').first()).toBeVisible()
  } else {
    await expect(page.locator('[data-testid="user-empty"]')).toBeVisible()
  }

  expect(failed).toEqual([])
  expect(errors).toEqual([])
})

test('用户档案：键盘能选卡并按回车进文章', async ({ page }) => {
  const found = await probeAuthor(page)
  test.skip(!found || found.total < 2, found ? '这篇文章数不足以验证「按卡移动」' : probeReason)
  const { username } = found!

  await page.goto(`/user/${username}`)
  await booted(page)
  await expect(page.locator('[data-testid="user-post-card"]').first()).toBeVisible()

  // 初始焦点在第一张卡上
  await expect(page.locator('[data-testid="user-post-card"]').first()).toHaveClass(/is-focused/)

  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="user-post-card"]').nth(1)).toHaveClass(/is-focused/)

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/post\//)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'article')
})

test('用户档案：鼠标点卡与键盘回车到达同一个落点', async ({ page }) => {
  const found = await probeAuthor(page)
  test.skip(!found, probeReason)
  const { username } = found!

  // 键盘路径：第一张卡 + 回车
  await page.goto(`/user/${username}`)
  await booted(page)
  await expect(page.locator('[data-testid="user-post-card"]').first()).toBeVisible()
  await expect(page.locator('[data-testid="user-post-card"]').first()).toHaveClass(/is-focused/)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/post\//)
  const byKeyboard = page.url()

  // 鼠标路径：点同一张卡
  await page.goto(`/user/${username}`)
  await booted(page)
  await page.locator('[data-testid="user-post-card"]').first().click()
  await expect(page).toHaveURL(/\/post\//)

  expect(page.url()).toBe(byKeyboard)
})

test('用户档案：返回按钮与 Q 键都能回上一页', async ({ page }) => {
  const found = await probeAuthor(page)
  test.skip(!found, probeReason)
  const { username } = found!

  // 键盘 Q：从首页跳进来（历史里有上一页）→ 回到首页
  await page.goto('/')
  await booted(page)
  await page.goto(`/user/${username}`)
  await booted(page)
  await page.keyboard.press('q')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'home')

  // 鼠标点返回按钮：同样回到上一页（刚才那一次 /user/... 的上一页是首页）
  await page.goto(`/user/${username}`)
  await booted(page)
  await page.click('[data-testid="user-back"]')
  await expect(page).toHaveURL(/\/$/)

  // 深链接（历史里没有上一页）：兜底回主页，键盘用户不会卡死在档案页
  await page.goto(`/user/${username}`)
  await booted(page)
  await page.keyboard.press('q')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'home')
})

test('用户档案：不存在的用户名给页内空态，不是整页 404、也不是白屏', async ({ page }) => {
  await page.goto('/user/no-such-user-zzz')
  await booted(page)

  // 场景仍然是 user（底栏点亮 USER），只有内容区说这个人不存在
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'user')
  await expect(page.locator('[data-testid="user-missing"]')).toBeVisible()
  await expect(page.locator('[data-testid="user-missing"]')).toContainText('用户不存在')
  // 用户卡还在（h1 仍然存在，这一页不会变成没有一级标题的页面）
  await expect(page.locator('[data-testid="user-card"]').locator('h1')).not.toBeEmpty()
  // 不能落到 404 兜底：404 场景是 error
  await expect(page.locator('.app')).not.toHaveAttribute('data-scene', 'error')
})

test('用户档案：自己出一个 h1（显示名）、文章标题是 h2，层级不跳级', async ({ page }) => {
  const found = await probeAuthor(page)
  test.skip(!found, probeReason)
  const { username, displayName } = found!

  await page.goto(`/user/${username}`)
  await booted(page)

  // 外壳对 `user` 场景不发隐藏 h1（App.vue 的 SELF_TITLED_SCENES），所以整页有且只有一个 h1，
  // 而且它就是用户卡里的显示名
  const h1 = page.locator('main h1')
  await expect(h1).toHaveCount(1)
  await expect(h1).toHaveText(displayName)

  if (await page.locator('[data-testid="user-post-card"]').count()) {
    await expect(page.locator('[data-testid="user-post-card"] h2').first()).toBeVisible()
  }

  // axe 的这两条是本页的硬要求：有且只有一个 h1、标题层级不跳级。
  // 底栏小字的对比度是**全站已知取舍**（a11y.spec.ts 有清单），这里不重复判它。
  const report = await new AxeBuilder({ page }).analyze()
  const ids = report.violations.map((v) => v.id)
  expect(ids).not.toContain('page-has-heading-one')
  expect(ids).not.toContain('heading-order')
  // 清单级判定（`e2e/a11y-known.ts` 是唯一一份）：本页不该出现清单外的任何违规
  expect(scanViolations(report).violations).toEqual([])
})

test('用户档案：这个人没有已发布文章时给空态', async ({ page }) => {
  const found = await probeAuthor(page)
  test.skip(!found, probeReason)
  const { username } = found!

  // 把作者文章接口打桩成空列表：不依赖库里真的有一个「零文章的用户」
  await page.route(/\/api\/posts\//, async (route) => {
    const url = route.request().url()
    if (url.includes('author_id=')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      })
      return
    }
    await route.continue()
  })

  await page.goto(`/user/${username}`)
  await booted(page)

  await expect(page.locator('[data-testid="user-empty"]')).toBeVisible()
  await expect(page.locator('[data-testid="user-empty"]')).toContainText('该用户还没有发布文章')
  // 统计仍在（文章数 0），不是把整页也变成空态
  await expect(page.locator('[data-testid="user-stats"] .pstat')).toHaveCount(3)
})

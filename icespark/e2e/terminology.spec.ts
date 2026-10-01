import { expect, test, type Page } from '@playwright/test'

import { booted, press } from './helpers'

/**
 * 术语门（样机 `design/icespark-prototype/e2e/gates.mjs` 第 3 节，原话是「用户要求第 1 条」）。
 *
 * 皮肤是 8bit/街机风，**内容不是游戏**：六个页面上都不许出现游戏术语残留
 * （`WORLD 1-1` / `STAGE` / `SCORE` / `HEARTS` …）。样机当年是拿这道门把上一版
 * 「游戏主菜单」的味道扫干净的（`HomeView.vue` 的文件头还留着那句「取代上一版的游戏主菜单」），
 * 生产版一直没有对应物 —— 这道门就是把它补回来。
 *
 * 扫的是**可见文本**（`.screen` 的 `innerText`），不是源码：
 * 注释里出现 `SCORE 累加`（`src/signal/motion.ts`）或代码里的 `TITLE` / `SELECT`
 * 常量名都不算残留，用户看不见。反过来，只要屏幕上印出来就已经是问题了。
 *
 * 与 `pages.spec.ts` 同一条自我约束：**不依赖后端有数据**。文章详情那一格要真有一篇
 * 已发布文章才扫得到，探不到就跳过那一格（跳过而不是假装扫过）。
 */

/** 样机 `gates.mjs:184-200` 的原表，一个词都没改 */
const GAME_TERMS = [
  'WORLD 1-1',
  'STAGE',
  'SCORE',
  'HEARTS',
  'CLIMB',
  'PLAYER',
  'LOCKED',
  'PAUSED',
  'SELECT STAGE',
  'TITLE',
  'SELECT',
  '关卡',
  '玩家',
  '加心',
  '心数',
  '通关',
  '成就',
  '经验值',
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
})

/** 取一篇已发布文章的 key（slug 优先，与 `api/format.ts` 的 postKey 同口径）；没有数据返回 null */
async function firstPostKey(page: Page): Promise<string | null> {
  const response = await page.request.get('/api/posts/?limit=1&status=published')
  if (!response.ok()) return null
  const data = (await response.json()) as { items?: { id: string; slug?: string | null }[] }
  const item = data.items?.[0]
  return item ? item.slug || item.id : null
}

/** 当前屏幕上的可见文本里命中的游戏术语（空数组 = 这一格干净） */
async function hitsOnScreen(page: Page): Promise<string[]> {
  const text = await page.locator('[data-testid="screen"]').innerText()
  return GAME_TERMS.filter((term) => text.includes(term))
}

test('术语门：六个页面的可见文本里都没有游戏术语残留', async ({ page }) => {
  const screens: Record<string, string[]> = {}

  // ① 首页
  await page.goto('/')
  await booted(page)
  screens['(home)'] = await hitsOnScreen(page)

  // ② 文章列表 / ③ 关联 / ④ 关于：三条独立路由，直接进（比样机靠 Tab 兜圈更稳）
  for (const [tag, path] of [
    ['posts', '/posts'],
    ['links', '/links'],
    ['about', '/about'],
  ] as const) {
    await page.goto(path)
    await booted(page)
    screens[tag] = await hitsOnScreen(page)
  }

  // ⑤ 文章详情：必须真的打开一篇才扫得到（没有已发布文章时这一格跳过，不算过）
  const key = await firstPostKey(page)
  if (key) {
    await page.goto(`/post/${key}`)
    await booted(page)
    await expect(page.locator('[data-testid="md-body"]')).toBeVisible()
    screens['article'] = await hitsOnScreen(page)
  } else {
    test.info().annotations.push({ type: 'skip-article', description: '库里没有已发布文章' })
  }

  // ⑥ 暂停菜单（它压在屏幕上，样机也是单独扫一格）
  await page.goto('/')
  await booted(page)
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  screens['pause'] = await hitsOnScreen(page)

  const dirty = Object.entries(screens).filter(([, hits]) => hits.length > 0)
  expect(dirty, `这些页面还留着游戏术语：${JSON.stringify(dirty)}`).toEqual([])
  // 反向自证：门不是空转 —— 至少扫到了该有的几格，且判定函数认得自己喂进去的词
  expect(Object.keys(screens).length).toBeGreaterThanOrEqual(5)
  expect(GAME_TERMS.filter((t) => 'PLAYER 1UP'.includes(t))).toEqual(['PLAYER'])
})

test('减动效下：自检照样落主页，切页照样能用', async ({ page }) => {
  // 样机 `smoke.mjs` 的「减动效下仍能进入主页 / 切页正常」两条
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await booted(page)

  await expect(page.locator('[data-testid="tabbar"]')).toHaveCount(1)
  await expect(page).toHaveURL(/\/$/)

  await press(page, 'Tab')
  await expect(page).toHaveURL(/\/posts$/)
  // 列表页的结构在不在（不依赖库里有没有文章：筛选行是常驻的）
  await expect(page.locator('[data-testid="group-row"]')).toBeVisible()
  await expect(page.locator('[data-testid="tab-posts"]')).toHaveClass(/on/)
})

/**
 * 出图脚本 v3：把关键场景各截一张，用于人工视觉复核
 * 运行：node e2e/shots.mjs  → 输出到 design/icespark-shots-v3/
 *
 * 默认带 ?demo=1：样张数据源，能同时看到「有封面 / 无封面」混排与长文排版。
 * 另出一张真实接口（LIVE）的图，避免只展示样张造成误判。
 *
 * 第 5 轮新增：分组行焦点、跳页框、文章页分组/标签芯片焦点（带 URL 变化的交互都另有
 * round5.mjs 做数值断言，截图只负责让人看一眼长什么样）。
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.ICESPARK_URL || 'http://127.0.0.1:5173/'
const OUT = new URL('../../icespark-shots-v3/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})

/** 每个页面预置偏好：关掉音效询问，避免截图被弹窗挡住 */
async function newPage({ demo = true, width = 1440, height = 900 } = {}) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width, height })
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
    localStorage.setItem('synthspark-icespark-sound', '0')
  })
  return page
}

const idle = (page) =>
  page.waitForFunction(() => document.querySelector('.app')?.getAttribute('data-locked') === 'false')

async function boot(page, { demo = true, wait = 2400 } = {}) {
  await page.goto(`${BASE}${demo ? '?demo=1' : ''}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(wait)
}

async function shoot(page, name) {
  await page.screenshot({ path: OUT + name + '.png' })
  console.log(`  · ${name}.png`)
}

/** 只截某块元素，方便看细节（焦点光标、画框、快捷键条） */
async function shootEl(page, sel, name, pad = 8) {
  const box = await page.locator(sel).first().boundingBox()
  if (!box) throw new Error(`no box for ${sel}`)
  await page.screenshot({
    path: OUT + name + '.png',
    clip: {
      x: Math.max(0, box.x - pad),
      y: Math.max(0, box.y - pad),
      width: Math.min(1440, box.width + pad * 2),
      height: box.height + pad * 2,
    },
  })
  console.log(`  · ${name}.png`)
}

// 1. 开机自检
{
  const page = await newPage()
  await page.goto(`${BASE}?demo=1`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(700)
  await shoot(page, '1-boot')
  await page.close()
}

// 2. 主页（样张）
{
  const page = await newPage()
  await boot(page)
  await shoot(page, '2-home')
  // 段内 ←→ 的焦点在标签上
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(160)
  await shoot(page, '3-home-focus-group')
  await page.close()
}

// 4. 文章列表（样张：有封面 / 无封面混排）
{
  const page = await newPage()
  await boot(page)
  await page.keyboard.press('Tab')
  await page.waitForTimeout(520)
  await page.waitForLoadState('networkidle') // 等封面图真的落下来，否则画框里还是占位图案
  await page.waitForTimeout(600)
  await shoot(page, '4-posts')
  await shootEl(page, '[data-testid="post-card"]', '4b-card-focus-closeup', 14)
  // 分组选择独立成行（用户第 3 条）：G 键直达
  await page.keyboard.press('g')
  await page.waitForTimeout(200)
  await shoot(page, '4c-group-row-focus')
  // 跳页框（用户第 6 条）：J 键打开
  await page.keyboard.press('j')
  await page.waitForTimeout(260)
  await shoot(page, '4d-jump-box')
  await shootEl(page, '.foot', '4e-foot', 8)
  await page.close()
}

// 5. 翻页动效（截在动画中间）
{
  const page = await newPage()
  await boot(page)
  await page.keyboard.press('Tab')
  await page.waitForTimeout(520)
  await page.keyboard.press('PageDown')
  await page.waitForTimeout(120)
  await shoot(page, '5-page-turn-mid')
  await page.waitForTimeout(1600)
  await shoot(page, '5b-page-2')
  await page.close()
}

// 6. 标签栏焦点
{
  const page = await newPage()
  await boot(page)
  await page.keyboard.press('Tab')
  await page.waitForTimeout(520)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(220)
  await shootEl(page, '[data-testid="tabbar"]', '6-tabbar-focus', 10)
  await page.close()
}

// 7. 文章详情：首屏（含封面） + 滚到正文中段 + 底部（快捷键条）
{
  const page = await newPage()
  await boot(page)
  await page.keyboard.press('Tab')
  await page.waitForTimeout(520)
  // 第一张卡有封面
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(160)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(700)
  await shoot(page, '7-article-top')
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  await page.waitForTimeout(300)
  await shoot(page, '8-article-markdown')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(200)
  await shootEl(page, '[data-testid="actions"]', '9-article-actions-focus', 10)
  // 分组 / 标签芯片：可点跳列表，G 键直达（用户第 7 条）
  await page.keyboard.press('PageUp')
  await page.keyboard.press('PageUp')
  await page.keyboard.press('PageUp')
  await page.waitForTimeout(260)
  await page.keyboard.press('g')
  await page.waitForTimeout(220)
  await shootEl(page, '[data-testid="chips"]', '9b-article-chips-focus', 10)
  for (let i = 0; i < 8; i++) await page.keyboard.press('PageDown')
  await page.waitForTimeout(300)
  await shoot(page, '10-article-comments')
  await shootEl(page, '[data-testid="keybar"]', '10b-keybar', 6)
  await page.close()
}

// 11. 关联 + 关于
{
  const page = await newPage()
  await boot(page)
  // 转场期间会锁输入，切页之间必须留出间隔 —— 连按两次只会切一次
  await page.keyboard.press('Tab')
  await page.waitForTimeout(460)
  await page.keyboard.press('Tab')
  await page.waitForTimeout(620)
  await shoot(page, '11-links')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(620)
  await shoot(page, '12-about')
  await page.close()
}

// 13. 暂停菜单 / 搜索 / 设置 / 登录
{
  const page = await newPage()
  await boot(page)
  await page.keyboard.press('p')
  await page.waitForTimeout(300)
  await shoot(page, '13-pause')
  await shootEl(page, '.pause', '13b-pause-closeup', 10)

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(220)
  await page.fill('[data-testid="pause-search-input"]', 'JSON')
  await page.waitForTimeout(600)
  await shoot(page, '14-search')

  await page.keyboard.press('Escape')
  await page.waitForTimeout(160)
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await shoot(page, '15-settings')

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await page.fill('[data-testid="login-username"]', '不存在的账号')
  await page.fill('[data-testid="login-password"]', 'wrong')
  await page.click('[data-testid="login-submit"]')
  await page.waitForTimeout(1000)
  await shoot(page, '16-login-error')
  await page.close()
}

// 17. 真实接口（LIVE）主页：避免只展示样张
{
  const page = await newPage()
  await boot(page, { demo: false })
  await shoot(page, '17-home-live')
  await page.close()
}

// 18. 窄屏（移动端）：验证「左侧竖列改横排」之后文章页是否还能读
{
  const page = await newPage({ width: 430, height: 900 })
  await boot(page)
  await page.keyboard.press('Tab')
  await page.waitForTimeout(1600)
  await shoot(page, '18-mobile-posts')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(700)
  await shoot(page, '19-mobile-article')
  await page.close()
}

await browser.close()
console.log(`\n输出目录：${OUT}`)

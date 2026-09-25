/**
 * 出图脚本：把关键场景各截一张，用于人工视觉复核
 * 运行：node e2e/shots.mjs  → 输出到 design/icespark-shots-v2/
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.ICESPARK_URL || 'http://127.0.0.1:5173/'
const OUT = new URL('../../icespark-shots-v2/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})

async function newPage(signal = 2, sound = '0') {
  const page = await ctx.newPage()
  await page.addInitScript(
    ([sig, snd]) => {
      localStorage.setItem('icespark-sound-prompt', '1')
      localStorage.setItem('icespark-sound', snd)
      localStorage.setItem('icespark-signal', sig)
    },
    [String(signal), sound]
  )
  return page
}

const idle = (page) =>
  page.waitForFunction(() => document.querySelector('.app')?.getAttribute('data-locked') === 'false')

async function shoot(page, name) {
  await page.screenshot({ path: OUT + name })
  console.log(`  · ${name}`)
}

// 1. 开机自检
{
  const page = await newPage()
  await page.goto(BASE)
  await page.waitForTimeout(420)
  await shoot(page, '1-boot.png')
  await page.close()
}

// 2. TITLE
{
  const page = await newPage()
  await page.goto(BASE)
  await page.waitForSelector('.title')
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(600)
  await shoot(page, '2-title.png')

  // 3. START 暂停菜单
  await page.keyboard.press('p')
  await page.waitForSelector('[data-testid="pause"]')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(400)
  await shoot(page, '3-pause.png')
  await page.close()
}

// 4. WORLD（文章列表）
{
  const page = await newPage()
  await page.goto(BASE)
  await page.waitForSelector('.title')
  await page.waitForTimeout(700)
  await page.keyboard.press('Enter')
  await page.waitForSelector('.stage-grid')
  await idle(page)
  await page.waitForTimeout(500)
  await shoot(page, '4-world.png')

  // 5. 文章详情（信号 2 → 像素层）
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-testid="doc"]')
  await idle(page)
  await page.waitForTimeout(500)
  await shoot(page, '5-article-px.png')

  // 动作栏焦点
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(300)
  await shoot(page, '6-article-action.png')

  // 7. 评论对话框
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.dialog')
  await page.waitForTimeout(1400)
  await shoot(page, '7-dialog.png')
  await page.close()
}

// 8. 信号 0（纯净 / 阅读层）
{
  const page = await newPage(0)
  await page.goto(BASE)
  await page.waitForSelector('.title')
  await page.waitForTimeout(700)
  await page.keyboard.press('Enter')
  await page.waitForSelector('.stage-grid')
  await idle(page)
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-testid="doc"]')
  await idle(page)
  await page.waitForTimeout(500)
  await shoot(page, '8-read-layer.png')
  await page.close()
}

// 9. 信号 3（原教旨 / 满强度 CRT）
{
  const page = await newPage(3)
  await page.goto(BASE)
  await page.waitForSelector('.title')
  await page.waitForTimeout(700)
  await page.keyboard.press('Enter')
  await page.waitForSelector('.stage-grid')
  await idle(page)
  await page.waitForTimeout(500)
  await shoot(page, '9-signal3-crt.png')
  await page.close()
}

await browser.close()
console.log(`\n出图完成：${OUT}`)

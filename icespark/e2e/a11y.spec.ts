import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { scanViolations } from './a11y-known'

import { booted } from './helpers'

/**
 * 无障碍门（a11y）—— **这一页自己的**扫描。
 *
 * 放行清单已经收口到 `e2e/a11y-known.ts`（唯一一份，理由写在那个文件头），
 * 这里不再自带数组。本文件守的是三件「首页 / 音效询问 / 404 / 菜单」级别的事：
 *
 * 1. **放行项必须真的只有清单里那几处**（下面第一条用例逐项回判）——
 *    新增一处就会红，逼人来改口径而不是悄悄漂移。
 * 2. **屏幕外框内的文字 axe 判不了**（CRT 扫描线是一层渐变，它归为 incomplete 而不是通过）。
 *    这道门实际守住的是框外内容，屏幕内的文字目前靠人工看 —— 最后一条用例**显式断言**
 *    这个数字不为 0，避免以后误以为「axe 全绿 = 整页无障碍都过了」。
 * 3. 模态对话框要有 `role="dialog"` / `aria-modal` / `aria-labelledby`（音效询问那条用例）。
 *
 * 整站十二条路由 + 三个外壳模态的**收口扫描**在 `e2e/a11y-audit.spec.ts`（P7，架构 §33）。
 */
interface Report {
  /** 不在已知清单里的违规（才是真失败） */
  violations: string[]
  /** 被放行的已知命中点（`[impact] rule → target` 形式） */
  allowed: string[]
  /** axe 判不了、需要人工确认的节点数 */
  incomplete: number
}

async function scan(page: Page): Promise<Report> {
  const result = await new AxeBuilder({ page }).analyze()
  const { violations, allowed } = scanViolations(result)
  const incomplete = result.incomplete.reduce((sum, item) => sum + item.nodes.length, 0)
  return { violations, allowed, incomplete }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
})

test('首页：无严重违规，放行的只有底栏小字与卡片标题跳级', async ({ page }) => {
  await page.goto('/')
  await booted(page)
  // 等首页内容真的渲染出来再扫（懒加载 + 数据是异步的）
  await expect(page.locator('[data-testid="home-all"]')).toBeVisible()

  const report = await scan(page)
  expect(report.violations).toEqual([])

  // 被放行的必须真的只有清单里那几处 —— 清单变多就说明有新问题混进来了
  expect(report.allowed.length).toBeGreaterThan(0)
  for (const line of report.allowed) {
    // 共享模块只会把清单内的命中点放进 `allowed`，所以这里再确认一遍它们确实「有出处」
    expect(line).toMatch(/color-contrast|heading-order|scrollable-region-focusable/)
  }
})

test('音效询问打开时：对话语义正确，无严重违规', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('synthspark-icespark-sound-prompt')
  })
  await page.goto('/')
  await booted(page)
  await page.keyboard.press('ArrowRight')

  const prompt = page.locator('[data-testid="sound-prompt"]')
  await expect(prompt).toBeVisible()
  // 模态对话框该有的语义，缺了屏幕阅读器只会念到一堆孤立的按钮
  await expect(prompt).toHaveAttribute('role', 'dialog')
  await expect(prompt).toHaveAttribute('aria-modal', 'true')
  await expect(prompt).toHaveAttribute('aria-labelledby', 'sound-prompt-title')

  const report = await scan(page)
  expect(report.violations).toEqual([])
})

test('404 与暂停菜单：内容都在地标里（曾经缺 contentinfo 地标）', async ({ page }) => {
  await page.goto('/no/such/path')
  await booted(page)
  await expect(page.locator('main')).toContainText('404')
  expect((await scan(page)).violations).toEqual([])

  await page.goto('/')
  await booted(page)
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  expect((await scan(page)).violations).toEqual([])
})

test('把 axe 的盲区记在案：屏幕外框内的文字它判不了', async ({ page }) => {
  await page.goto('/')
  await booted(page)
  const report = await scan(page)

  // 框内一屏文字都在 CRT 扫描线之下，axe 只能标成 incomplete。
  // 这个数字不为 0 才是正常的；变成 0 说明审查方式变了，需要重新想门怎么定。
  expect(report.incomplete).toBeGreaterThan(0)
})

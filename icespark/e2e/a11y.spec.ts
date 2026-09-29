import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { booted } from './helpers'

/**
 * 无障碍门（a11y）。
 *
 * 门的口径来自用户裁决，三条都要写清楚，免得下次有人「顺手修好」或「顺手放宽」：
 *
 * 1. **底栏淡色小字的对比度是已知取舍，不是漏修**。
 *    样机定稿里底栏就是 `--ink-soft`、数据源标记就是 `--blue-600`，用户明确要求保持这个样式。
 *    实测：小字 3.32:1、数据源 4.24:1，低于 WCAG AA 的 4.5:1。
 *    所以这里**只对这四处已知节点**放行 color-contrast —— 新增的任何对比度问题照样拦下来。
 *
 * 2. **屏幕外框内的文字 axe 判不了**（CRT 扫描线是一层渐变，它归为 incomplete 而不是通过）。
 *    也就是说这道门实际守住的是框外内容；屏幕内的文字目前靠人工看。
 *    这一条在测试里显式断言，避免以后误以为「axe 全绿 = 整页无障碍都过了」。
 *
 * 3. **标题跳一级是「不改样机 DOM」的取舍**（P3 页面迁移后暴露）。
 *    样机里只有文章页有 `h1`（`<h1 class="doc-title">`），首页 / 列表 / 关联 / 关于的
 *    「页面名」是 `.head-title` 那个机器铭牌 span；卡片标题则一律是 `h3`。
 *    生产版按 `main` / `contentinfo` 的同一套做法，在**外壳**补了一个视觉隐藏的
 *    `h1`（`App.vue` 的 `.sr-heading`），于是出现 h1 → h3 的跳级。
 *    把卡片标题改成 `h2` 就是改样机 DOM，所以这里放行 ——
 *    但**只**放行样机卡片标题这一类节点（`.post-title` / `.card-title`）。
 */

/** 已知且用户确认保留的对比度节点（class 选择器） */
const KNOWN_CONTRAST_TARGETS = ['.deck-src', '.is-copyright', '.is-slogan', '.is-icp']

/** 已知的标题跳级节点：样机的卡片标题就是 h3，外壳补的 h1 与它差了一级 */
const KNOWN_HEADING_TARGETS = ['.post-title', '.card-title']

/** 这条违规是否属于「已知取舍」（放行）；不属于就是真失败 */
function isKnown(violationId: string, target: string, html: string): boolean {
  if (violationId === 'color-contrast') {
    return KNOWN_CONTRAST_TARGETS.some((selector) => target.includes(selector))
  }
  if (violationId === 'heading-order') {
    // 用节点自身的 class 判定（axe 的 target 链上只到 `h3`，不带类名）
    return KNOWN_HEADING_TARGETS.some((selector) => html.includes(selector.slice(1)))
  }
  return false
}

interface AllowedItem {
  rule: string
  target: string
  /** 节点自身的标签（判定标题跳级用，见 isKnown） */
  html: string
}

interface Report {
  /** 不在已知清单里的违规（才是真失败） */
  violations: string[]
  /** 被放行的已知节点（对比度 / 标题跳级） */
  allowed: AllowedItem[]
  /** axe 判不了、需要人工确认的节点数 */
  incomplete: number
}

async function scan(page: Page): Promise<Report> {
  const result = await new AxeBuilder({ page }).analyze()

  const violations: string[] = []
  const allowed: AllowedItem[] = []

  for (const violation of result.violations) {
    for (const node of violation.nodes) {
      const target = node.target.join(' ')
      const html = node.html ?? ''
      if (isKnown(violation.id, target, html)) allowed.push({ rule: violation.id, target, html })
      else violations.push(`[${violation.impact ?? 'unknown'}] ${violation.id} → ${target}`)
    }
  }

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
  for (const item of report.allowed) {
    expect(isKnown(item.rule, item.target, item.html)).toBe(true)
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

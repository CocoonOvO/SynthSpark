import { expect, test } from '@playwright/test'

import { booted } from './helpers'

/**
 * 纯鼠标门 —— 硬要求：**单独用鼠标**能完成全部交互。
 *
 * 与纯键盘门对称：这里只用 `page.mouse` / `page.click()` / `hover()`，
 * 一次键盘都不按，最后断言「一次 keydown 都没发生过」。
 *
 * 鼠标路径的关键差异（也是这道门真正在守的东西）：
 *   · 划过可交互项 = 挪同一个焦点（键盘与鼠标共享焦点模型），但**静音**；
 *   · 点击软键 = 原生 click 事件，不经过手柄层的 confirm。
 */

async function installRecorder(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as { __keys: string[] }
    store.__keys = []
    document.addEventListener('keydown', (event) => store.__keys.push(event.key), true)
  })
}

test('纯鼠标：划过共享焦点（静音）→ 点击确认 → 外壳软键也能点', async ({ page }) => {
  await installRecorder(page)
  await page.goto('/')
  await booted(page)

  // 第一下手势发生在底栏的场景指示上（不可聚焦元素 → 焦点交回外壳根节点，按键才接得到）
  await page.click('[data-testid="deck-scene"]')
  await expect(page.locator('[data-testid="sound-prompt"]')).toBeVisible()

  // 划过另一项：焦点跟着鼠标走，仍是同一套焦点视觉
  await page.hover('[data-testid="prompt-off"]')
  await expect(page.locator('[data-testid="prompt-off"]')).toHaveClass(/is-focused/)
  await expect(page.locator('[data-testid="prompt-on"]')).not.toHaveClass(/is-focused/)

  await page.hover('[data-testid="prompt-on"]')
  await expect(page.locator('[data-testid="prompt-on"]')).toHaveClass(/is-focused/)

  // 点「开启音效」：模态关闭，软键变 ON
  await page.click('[data-testid="prompt-on"]')
  await expect(page.locator('[data-testid="sound-prompt"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="softkey-sound"]')).toHaveText(/ON/)

  // 软键本身也是可点的控件：连点两次，状态来回切
  await page.click('[data-testid="softkey-sound"]')
  await expect(page.locator('[data-testid="softkey-sound"]')).toHaveText(/OFF/)
  await page.click('[data-testid="softkey-sound"]')
  await expect(page.locator('[data-testid="softkey-sound"]')).toHaveText(/ON/)

  const keys = await page.evaluate(() => (window as unknown as { __keys: string[] }).__keys)
  expect(keys).toEqual([])
})

test('纯鼠标：底栏站稳了才谈鼠标 —— 场景指示与站点小字都能点到/划到', async ({ page }) => {
  await installRecorder(page)
  await page.goto('/')
  await booted(page)

  // 断言底栏在屏幕外框之外（样机口径），且它自己可点 —— 鼠标用户不需要键盘就能触达外壳
  const layout = await page.evaluate(() => {
    const screen = document.querySelector('[data-testid="screen"]') as HTMLElement
    const deck = document.querySelector('[data-testid="deck"]') as HTMLElement
    return {
      below: deck.getBoundingClientRect().top >= screen.getBoundingClientRect().bottom - 0.5,
      height: deck.getBoundingClientRect().height,
    }
  })
  expect(layout.below).toBe(true)
  expect(layout.height).toBeGreaterThan(0)

  await page.hover('[data-testid="deck-footer"]')
  await page.click('[data-testid="deck-src"]')
  // 点完什么都不该发生（它是状态显示，不是控件）—— 稳定性断言：页面没被点坏
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'home')

  const keys = await page.evaluate(() => (window as unknown as { __keys: string[] }).__keys)
  expect(keys).toEqual([])
})

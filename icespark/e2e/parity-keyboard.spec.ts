import { expect, test } from '@playwright/test'

import { booted } from './helpers'

/**
 * 纯键盘门 —— 硬要求：**单独用键盘**能完成全部交互。
 *
 * 怎么算「纯键盘」：全程不碰 `page.mouse` / `page.click()`（那会产生 pointer 事件），
 * 只用 `page.keyboard`；并且页面里装了一个记录器，最后断言
 * 「一次 pointerdown / mousedown / click 都没发生过」。
 *
 * 走的是最小但完整的一条真实路径：首次音效询问（模态 + 两选项 + 确认）
 * → 完成后用 Tab 走到外壳软键上按回车切换。这条路径把输入内核的四件事全串起来：
 * 按键映射、两趟派发、模态作用域、原生 Tab 交还（未消费就不 preventDefault）。
 */

/** 事件记录器：所有用例共用，装在最前面 */
async function installRecorder(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as { __mouse: string[]; __keys: string[] }
    store.__mouse = []
    store.__keys = []
    // 只记指针设备事件：键盘激活按钮时浏览器同样会派发 click，
    // 把 click 算进来会把「按回车确认」误判成用了鼠标。
    for (const type of ['pointerdown', 'mousedown']) {
      document.addEventListener(type, () => store.__mouse.push(type), true)
    }
    document.addEventListener('keydown', (event) => store.__keys.push(event.key), true)
  })
}

const readRecorder = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const store = window as unknown as { __mouse: string[]; __keys: string[] }
    return { mouse: store.__mouse, keys: store.__keys }
  })

test('纯键盘：音效询问（左右选择 + 回车确认）与外壳软键（Tab + 回车）', async ({ page }) => {
  await installRecorder(page)
  await page.goto('/')
  await booted(page)

  // 第一次按键既是「首次手势」，也应该是外壳能接到的键 —— 不需要先点一下
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="sound-prompt"]')).toBeVisible()

  // 初始焦点在「开启音效」上；键盘能把焦点挪到另一项再挪回来
  await expect(page.locator('[data-testid="prompt-on"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="prompt-off"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-testid="prompt-on"]')).toHaveClass(/is-focused/)

  // 回车确认「开启音效」：模态关闭，软键跟着变 ON
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="sound-prompt"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="softkey-sound"]')).toHaveText(/ON/)

  // 有标签栏的页面上，Tab 是外壳的「切标签页」键（样机口径：它被消费，不还给浏览器）
  await page.keyboard.press('Tab')
  await expect(page).toHaveURL(/\/posts$/)

  // 没有标签栏的页面（这里用 404）：Tab 必须**还给浏览器** —— 它按 DOM 顺序
  // 走到外壳软键这个真按钮上，回车走浏览器原生激活（手柄层不拦、不重复触发）。
  // 样机的这条口径写在同一处：`onTabScene` 为假时 `tabNext` 直接 return false。
  await page.goto('/no/such/path')
  await booted(page)
  let reached = false
  for (let i = 0; i < 5 && !reached; i += 1) {
    await page.keyboard.press('Tab')
    reached = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') === 'softkey-sound',
    )
  }
  expect(reached).toBe(true)

  // 焦点在真按钮上时按回车 → 浏览器原生激活（手柄层不拦截、不重复触发）
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="softkey-sound"]')).toHaveText(/OFF/)

  const log = await readRecorder(page)
  expect(log.keys.length).toBeGreaterThan(0)
  // 全程零鼠标事件 —— 这就是「单独用键盘」的可执行定义
  expect(log.mouse).toEqual([])
})

test('纯键盘：ESC 走「保持静音」这条分支', async ({ page }) => {
  await installRecorder(page)
  await page.goto('/')
  await booted(page)

  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="sound-prompt"]')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="sound-prompt"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="softkey-sound"]')).toHaveText(/OFF/)

  expect((await readRecorder(page)).mouse).toEqual([])
})

test('纯键盘：模态作用域生效 —— 询问打开时按键不会穿透到外壳', async ({ page }) => {
  await installRecorder(page)
  await page.goto('/')
  await booted(page)

  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="sound-prompt"]')).toBeVisible()

  // 询问框开着时，P 不该被外壳当成 START 处理（本轮外壳还没有菜单，但作用域必须已经隔离）
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="sound-prompt"]')).toBeVisible()
  await expect(page.locator('.app')).toHaveAttribute('data-scope', 'pause')

  await page.keyboard.press('Escape')
  await expect(page.locator('.app')).toHaveAttribute('data-scope', 'scene')
})

test('纯键盘：焦点落点真的画出蓝底（懒加载后样式源序反转曾把它压成白底）', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  // 键盘走到内容区（首页 `查看全部` / 卡片 / 标签芯片都是 .focusable）
  await page.keyboard.press('ArrowDown')
  const focused = page.locator('.focusable.is-focused').first()
  await expect(focused).toBeVisible()

  // 对照色：把 --blue-200 交给浏览器解析（他归一成 rgb()），避免在这里写死色值
  const expected = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--blue-200)'
    document.body.appendChild(probe)
    const value = getComputedStyle(probe).backgroundColor
    probe.remove()
    return value
  })

  // 焦点蓝底由 pixel.css 的 `.app .focusable:is(.is-focused, :focus-visible)` 提供。
  // 它必须压过组件 scoped 的 `background: var(--paper)`：视图是懒加载的，
  // 组件样式永远在 pixel.css 之后注入，平局（同为 (0,2,0)）会判给白底。
  await expect(focused).toHaveCSS('background-color', expected)
})

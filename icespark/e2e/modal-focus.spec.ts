import { expect, test } from '@playwright/test'

import { booted } from './helpers'

/**
 * **模态的焦点圈闭**（口径散在 `App.vue` 与 `PixelDialog.vue` 的注释里，一直没有门）。
 *
 * 现在的实现口径有三条，这个文件把它们钉住：
 *   1. 模态开着时，`tabNext` / `tabPrev` 在**外壳层被吞掉**（`App.vue` 的 `offGlobal`：
 *      `if (inModal) return true`）—— 所以焦点不会跑出模态；菜单靠方向键走光标，不靠 Tab。
 *   2. **可编辑目标例外**：焦点在输入框里时，内核让开（`isEditableTarget` 那一支），
 *      原生 Tab 照常遍历 —— 登录框里「用户名 → 密码 → 提交」就是这么走的。
 *   3. 结果：焦点**只在模态内**移动，永远落不到背景页面上。
 *
 * 第三条用例是**已知缺陷的可执行记录**（`test.fail`）：一旦走到模态里最后一个非可编辑
 * 控件上，Tab 与 Shift+Tab 都被外壳吞掉，焦点当场卡死 —— 见文件末尾的说明，等用户口径。
 */

/** 当前原生焦点落在哪（数据属性 + 是否在模态里 + 是否在背景页面里） */
async function focusSpot(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    const modal = el?.closest('[data-testid="pause"], [data-testid$="-dialog"]') ?? null
    return {
      id: el?.getAttribute('data-testid') ?? el?.className ?? 'NONE',
      inModal: modal !== null,
      // 背景页面 = 屏幕里那层；焦点若落到这里就说明「跑出模态了」
      inBackground: el !== null && el.closest('.screen-inner') !== null,
    }
  })
}

test('模态圈闭：暂停菜单开着时 Tab 被吞（焦点不动），但方向键仍能走菜单光标', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('synthspark-icespark-sound-prompt', '1'))
  await page.goto('/')
  await booted(page)

  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  const before = await focusSpot(page)

  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Tab')
  const after = await focusSpot(page)
  expect(after.id, '菜单开着时 Tab 不该移动原生焦点').toBe(before.id)
  expect(after.inBackground, '焦点不许跑到背景页面上').toBe(false)

  // 对照：被吞的是 Tab，不是整块键盘 —— 方向键照样能推菜单光标
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="pause"] .is-focused')).toHaveCount(1)
})

test('模态圈闭：登录框里 Tab / Shift+Tab 只在框内走，焦点落不到背景', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('synthspark-icespark-sound-prompt', '1'))
  await page.goto('/')
  await booted(page)

  await page.keyboard.press('p')
  await page.click('[data-testid="pause-account"]')
  await expect(page.locator('[data-testid="login-dialog"]')).toBeVisible()

  // 可编辑目标例外：从用户名框往前，走的是浏览器原生遍历（内核让开）
  await page.locator('[data-testid="login-username"]').click()
  await page.keyboard.press('Tab')
  const atPassword = await focusSpot(page)
  expect(atPassword.id).toBe('login-password')
  expect(atPassword.inModal, '第二个字段应当还在登录框里').toBe(true)

  await page.keyboard.press('Tab')
  const atSubmit = await focusSpot(page)
  expect(atSubmit.id).toBe('login-submit')
  expect(atSubmit.inModal).toBe(true)

  // 反方向：从用户名框 Shift+Tab 到关闭按钮（同样只在框内）
  await page.locator('[data-testid="login-username"]').click()
  await page.keyboard.press('Shift+Tab')
  const backward = await focusSpot(page)
  expect(backward.id).toBe('login-close')
  expect(backward.inModal).toBe(true)
  expect(backward.inBackground, '倒着走也不许落到背景页面上').toBe(false)
})

/*
 * ── 曾经的「Tab 卡死」：已修，这里守死 ──
 *
 * 原先：登录框里走到「登录」按钮之后，Tab 与 Shift+Tab 都被外壳吞掉（模态期间导航类全局键
 * 一律不生效），焦点卡在按钮上动不了，只剩 ESC 能脱身（探针实录见 §53.1）。
 *
 * 修法（§57）：带表单的模态在容器上挂 `data-focus-trap="cycle"`，内核在 Tab 时先问
 * `cycleFocusInTrap()`（`src/input/focusTrap.ts`）—— 焦点已在圈闭容器里就**回绕**一格并
 * `preventDefault`，不等外壳吞。暂停菜单**不挂**这个标记：它是自绘光标的菜单，
 * 循环原生焦点会出现两个光标，**原口径（Tab 被吞、方向键走光标）保持不变**。
 */
test('模态圈闭：登录框里 Tab / Shift+Tab 都回绕，一条都别想卡死', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('synthspark-icespark-sound-prompt', '1'))
  await page.goto('/')
  await booted(page)

  await page.keyboard.press('p')
  await page.click('[data-testid="pause-account"]')
  await expect(page.locator('[data-testid="login-dialog"]')).toBeVisible()

  // 框内顺序（DOM 序）：✕ 关闭 → 用户名 → 密码 → 确认登录 → 取消
  const cancel = page.locator('[data-testid="login-dialog"] button', { hasText: '取消' })

  await page.locator('[data-testid="login-username"]').click()
  await page.keyboard.press('Tab')
  expect((await focusSpot(page)).id).toBe('login-password')
  await page.keyboard.press('Tab')
  expect((await focusSpot(page)).id).toBe('login-submit')
  await page.keyboard.press('Tab')
  await expect(cancel, '提交之后还能往前走（不再卡死在按钮上）').toBeFocused()

  // 到最后一项再按 Tab：**回绕到框内第一个可聚焦项**（✕ 关闭），而不是原地不动
  await page.keyboard.press('Tab')
  const wrapped = await focusSpot(page)
  expect(wrapped.id, 'Tab 到最后一个之后应当回绕，不许原地卡住').toBe('login-close')
  expect(wrapped.inModal, '回绕也只在框内').toBe(true)
  expect(wrapped.inBackground, '焦点绝不许落到背景页面上').toBe(false)

  // 反方向同样回绕：从第一个倒着走回最后一项
  await page.keyboard.press('Shift+Tab')
  await expect(cancel, 'Shift+Tab 从第一个应当回绕到最后一项').toBeFocused()
  await expect(page.locator('.app')).toHaveAttribute('data-scope', 'pause')
})

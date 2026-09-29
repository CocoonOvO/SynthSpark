import { expect, type Page } from '@playwright/test'

/**
 * 等开机自检播完（`data-scene` 从 `boot` 变成当前路由的场景）。
 *
 * 为什么需要它：生产版保留了样机的开机动画 —— 自检期间底栏点亮 BOOT、屏幕上是
 * `BootScreen`，而它按样机口径**消费掉任意按键**（按任意键跳过自检）。
 * 于是「加载后立刻按键」的用例会先被自检吃掉一次，交互就会少一拍。
 *
 * 用 `expect(...).not.toHaveAttribute(...)` 而不是 `waitForTimeout`：
 * 前者是可重试断言（自检通常 1.5s 播完），不写死延时，也不受机器快慢影响。
 */
export async function booted(page: Page): Promise<void> {
  await expect(page.locator('.app')).not.toHaveAttribute('data-scene', 'boot')
}

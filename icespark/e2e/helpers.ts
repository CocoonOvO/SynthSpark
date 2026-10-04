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
  /**
   * 顺手等**转场锁释放**（`scene/transition.ts` 的 `lockInput()` → `.app[data-locked]`）。
   *
   * 为什么必须等：锁窗口比场景切换多活 50~70ms（实测，见架构 §46），这期间内核**按设计**
   * 把非 `start` 的按键全部丢掉（`dispatchPadAction` 里 `inputLocked && action !== 'start'`）。
   * 于是「`booted()` 之后立刻按键」的用例会**偶发**丢键 —— 症状是断言超时（例如
   * `toHaveURL(/page=2/)` 永远等不到），单跑绿、整套并行时红，很难查。
   * 把这一步并进公共前置，比在每条用例里各加一个 `waitForTimeout` 可靠得多。
   */
  await expect(page.locator('.app')).toHaveAttribute('data-locked', 'false')
}

/**
 * 探数据：GET 一个接口并解析 JSON，**失败会重试**，最终返回 `{ data, reason }`。
 *
 * 为什么要有重试：一批「不依赖后端有数据」的用例是这么写的 —— 先探一下有没有文章，
 * 探不到就 `test.skip`。这套写法本身没错（跳过而不是假绿），但它对**偶发抖动**太敏感：
 * 并行跑 30 个 spec 时后端偶尔忙一下、一次探针超时，那条用例就会**静默变成 skip** ——
 * 覆盖率掉了，报告里却只有「N skipped」一行，很容易被当成全绿。
 * （实测过一次：同一条命令连跑，先是 `181 passed / 4 skipped`，再跑就回到 `182 / 3`。）
 *
 * 所以探针要区分两件事：**「确实没有数据」**（正常，跳过）与**「根本没问到」**（异常，
 * 调用方应当看见原因）。这个函数把两件事都交给调用方：`data === null` 时 `reason`
 * 一定写清了是 HTTP 几、还是超时、还是 JSON 坏了 —— 调用方把它原样交给 `test.skip`，
 * 于是报告里的「跳过」永远带着一句人话（"HTTP 500" ≠ "本题库确实没有文章"）。
 */
export async function probeJson<T>(
  page: Page,
  url: string,
  attempts = 3,
): Promise<{ data: T | null; reason: string }> {
  let last = '还没试'
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) await page.waitForTimeout(250 * i)
    try {
      const response = await page.request.get(url, { timeout: 8000 })
      if (!response.ok()) {
        last = `HTTP ${response.status()}`
        // 4xx 是「这机器上确实没有」，重试没有意义；5xx / 网络问题才值得再试
        if (response.status() < 500) return { data: null, reason: last }
        continue
      }
      return { data: (await response.json()) as T, reason: 'OK' }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
  }
  return { data: null, reason: `${attempts} 次都没问到（最后一次：${last}）` }
}

/**
 * 按一个键，但**先等转场锁释放**（§46 的锁 → §47 的真凶）。
 *
 * 为什么需要它：转场锁比导航本身多活 50~70ms，这期间内核**按设计**把非 `start` 的按键
 * 全部丢掉（`dispatchPadAction` 里 `inputLocked && action !== 'start'`）。浏览器里用户
 * 这么按是被允许的（就是会被丢掉），但**用例里这么按就是随机红** ——
 * 症状是 `expect(page).toHaveURL(...)` 永远等不到，单跑绿、整套并行红。
 * 实测到的两次：`booted()` 之后立刻 `PageDown`（已并入 `booted`）、
 * 跳页回车之后立刻 `PageUp`（本函数的用例）。
 *
 * 用法：**「这次按键必须生效」**的地方用它；要验「锁定期内按键会被丢掉」就别用
 * （`transition-lock.spec.ts` 正是那种用例，它故意直接用 `page.keyboard.press`）。
 */
export async function press(page: Page, key: string): Promise<void> {
  await expect(page.locator('.app')).toHaveAttribute('data-locked', 'false')
  /**
   * 还要等**焦点回到外壳内**（§61 的第二个真凶）。
   *
   * 内核的键盘监听挂在 `.app` 上，而键盘事件只沿**当前焦点的祖先链**冒泡 ——
   * 焦点掉到 `body` 时按键谁也收不到。触发时机很具体：某个持有焦点的节点被卸载
   * （跳页框提交后关闭、点「清除」把焦点所在的芯片换掉…），浏览器那一刻把焦点交给
   * `body`，而输入层的 `focusout` 兜底要**下一个 tick** 才把焦点收回外壳。
   * 测试在这两个 tick 之间按键，就会「按了毫无反应」——实测就是这么红的：
   * `list-paging` 的「跳页回车之后键盘还活着」「点清除之后键盘还活着」两条，
   * 加锁等待也压不住，因为它的根因不是锁而是焦点。
   */
  await expect
    .poll(
      () => page.evaluate(() => document.activeElement?.closest('.app') !== null),
      { message: '按键前焦点必须落在外壳内（否则内核根本收不到这个键）' },
    )
    .toBe(true)
  await page.keyboard.press(key)
}

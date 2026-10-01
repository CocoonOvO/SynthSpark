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

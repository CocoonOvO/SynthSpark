import { expect, test } from '@playwright/test'

import { booted } from './helpers'

/**
 * **转场锁输入**（架构 §15 的口径，一直只有注释、没有门）。
 *
 * 一屏一场景转场的那一小段时间里，外壳是**上锁**的（`scene/transition.ts` 的
 * `lockInput()` → `.app[data-locked="true"]`）：屏幕还是旧画面，按键不该被页面拿去用。
 * `src/input/index.ts` 与 `input/pad.ts` 里写了两条明确的口径：
 *   · `Tab` / `Shift+Tab` 在锁定期间**必须吞掉**（否则浏览器会把原生焦点挪到某个按钮上，
 *     之后按回车「莫名其妙」触发它 —— 那句注释就是这么写的）；
 *   · 其余动作**不接管**（`dispatchPadAction` 里 `inputLocked && action !== 'start'` 直接返回 false），
 *     把按键还给浏览器；只有 `start`（`p`）仍然放行，于是转场中按 `p` 照样能起菜单。
 *
 * 锁窗口很短（实测 50~70ms），所以这道门不掐表，而是**记录事实再判**：
 * 装一个 keydown 记录器（记下每一次按下的键、当时是否锁定、是否被 `preventDefault`）
 * 与一个属性观察器（记转场真的上过几次锁），然后连点几次页签、每次紧跟几下 `Tab`。
 * 实测 20 次按键里有 12 次落在锁窗口内，两次运行数字完全一致 —— 判据稳。
 *
 * 判据本身是**极化**的，这才说明是「锁」在起作用而不是「Tab 一律被吞」：
 *   · 锁窗口**内**的 `Tab` → 必须全部被吞（`defaultPrevented === true`）；
 *   · 锁窗口**外**的 `Tab` → 必须全部没被吞（它本来就该切页签）。
 */
test('转场锁输入：锁定窗口内 Tab 被吞且不挪动原生焦点，锁一定会释放', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
    const store = window as unknown as {
      __keys: {
        key: string
        locked: boolean
        prevented: boolean
        activeBefore: string
        activeAfter: string
      }[]
      __locks: number
    }
    store.__keys = []
    store.__locks = 0
    // 转场真的上过几次锁（只在当前仍是 locked 时计数）
    //
    // 注意观察目标写的是 `document` 而不是 `document.documentElement`：
    // init script 跑在**解析之前**，那一刻 `document.documentElement` 还是 null，
    // `observe(null)` 会直接抛异常，把整个 init script 掐掉 —— 表现是「计数器恒为 0、
    // 按键一条都没记到」，而门看起来只是「采样不足」。这个坑真踩过（§46.2）。
    new MutationObserver(() => {
      if (document.querySelector('.app')?.getAttribute('data-locked') === 'true') store.__locks += 1
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-locked'],
    })
    const activeId = () =>
      (document.activeElement as HTMLElement | null)?.getAttribute('data-testid') ??
      (document.activeElement as HTMLElement | null)?.className ??
      'NONE'
    document.addEventListener('keydown', (event) => {
      const record = {
        key: event.key,
        locked: document.querySelector('.app')?.getAttribute('data-locked') === 'true',
        prevented: event.defaultPrevented,
        activeBefore: activeId(),
        activeAfter: '',
      }
      store.__keys.push(record)
      // 默认动作（原生 Tab 遍历）发生在事件派发**之后**，所以下一次宏任务里才看得到后果
      setTimeout(() => {
        record.activeAfter = activeId()
      }, 0)
    })
  })

  await page.goto('/')
  await booted(page)

  // 连点页签制造转场，每次紧跟几下 Tab：锁窗口只有 50~70ms，靠次数把它踩中
  for (const tab of ['tab-posts', 'tab-about', 'tab-links', 'tab-home', 'tab-posts']) {
    await page.click(`[data-testid="${tab}"]`)
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('Tab')
  }

  const seen = await page.evaluate(() => {
    const store = window as unknown as {
      __keys: {
        key: string
        locked: boolean
        prevented: boolean
        activeBefore: string
        activeAfter: string
      }[]
      __locks: number
    }
    const tabs = store.__keys.filter((k) => k.key === 'Tab')
    return {
      locks: store.__locks,
      inWindow: tabs.filter((k) => k.locked),
      outWindow: tabs.filter((k) => !k.locked).length,
    }
  })

  // ① 转场确实上过锁（否则这道门什么都没验）
  expect(seen.locks, '这趟旅程里应当出现转场锁').toBeGreaterThanOrEqual(3)

  // ② 确实采到了锁窗口内的按键（采样不足就是门失效，要显式失败而不是放行）
  expect(
    seen.inWindow.length,
    `锁窗口内的 Tab 采样太少（${seen.inWindow.length} 次）—— 这道门需要至少 5 次才可信`,
  ).toBeGreaterThanOrEqual(5)

  // ③ 窗口内的 Tab 全部被吞
  const leaked = seen.inWindow.filter((k) => !k.prevented)
  expect(leaked, `锁定期内竟有 Tab 没被吞掉（${leaked.length} 次）—— 原生焦点会被挪走`).toEqual([])

  // ④ 真正看得见的后果：锁定期内的 Tab **没有挪动原生焦点**
  //    （`index.ts` 的注释写的就是这件事：不然浏览器会把原生焦点挪到某个按钮上，
  //      之后按回车「莫名其妙」触发它）。窗口外不判 —— 标签栏本来就靠 Tab 切页，
  //      那时被吞是**对的**（`pages.spec.ts` 有专门的用例守它）。
  const moved = seen.inWindow.filter((k) => k.activeBefore !== k.activeAfter)
  expect(
    moved.map((k) => `${k.activeBefore} → ${k.activeAfter}`),
    `锁定期内的 Tab 挪动了原生焦点（${moved.length} 次）`,
  ).toEqual([])

  // ⑤ 锁一定要释放（卡在 locked 的后果是整块键盘再也接不到页面动作）
  await expect(page.locator('.app')).toHaveAttribute('data-locked', 'false')

  // ⑥ 外壳仍然是活的：底栏标签栏在，当前场景是四个标签页之一。
  //    **不断言具体落在哪一页** —— 窗口外的 Tab 会被外壳消费成「切页签」（那是它的正常行为），
  //    所以最后停在哪一页取决于按压落在窗口内外的时序，写死 URL 会变成一条随机红的用例
  //    （这条真踩过：单独跑绿、整套并行时红）。
  await expect(page.locator('[data-testid="tabbar"]')).toBeVisible()
  const scene = await page.evaluate(
    () => document.querySelector('.app')?.getAttribute('data-scene') ?? '',
  )
  expect(['home', 'posts', 'links', 'about'], `终态场景异常：${scene}`).toContain(scene)
})

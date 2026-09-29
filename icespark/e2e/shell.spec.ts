import { expect, test } from '@playwright/test'

import { booted } from './helpers'

/**
 * 外壳保真门 —— 防的是「又一次把样机的外壳改掉」。
 *
 * 为什么值得单独一道门：外壳是**结构**，改它不会报错、不会掉用例，
 * 只会让画面悄悄偏离样机。P1 就真发生过一次：把样机「外框下方的 `.deck` 底栏」
 * 换成了塞在框内的自造状态行，站点小字也从底栏挪进了屏幕里。
 * 所以这里用数值与结构断言把样机定稿钉住（数值取自样机 `App.vue` 的 scoped 样式）：
 *
 *   .app                     padding 10px 12px 8px · gap 6px · 纵向 flex
 *   ├── .screen              3px 像素外框 + crt 质感（不外挂第二层机身）
 *   └── .deck                与 .screen 同级（**不在框内**）
 *        ├── .deck-scene     场景指示：6 个场景，当前项显示 label，其余 `·`
 *        ├── .deck-keys      软键（margin-left:auto 推到右侧）
 *        ├── .deck-src       ● LIVE / ○ DEMO
 *        └── .deck-footer    站点小字（版权 · 口号 · 备案），与外框绑定 → 404 也在
 */

/** 每次测试都跳过首次音效询问：本门验外壳，别让模态盖住画面 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
})

test('外壳三段式：.app > .screen 同级 .deck，底栏不在外框里', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  const shell = await page.evaluate(() => {
    const app = document.querySelector('.app') as HTMLElement
    const screen = document.querySelector('[data-testid="screen"]') as HTMLElement
    const deck = document.querySelector('[data-testid="deck"]') as HTMLElement
    const appStyle = getComputedStyle(app)
    const screenRect = screen.getBoundingClientRect()
    const deckRect = deck.getBoundingClientRect()

    return {
      children: Array.from(app.children).map((child) => child.className.split(' ')[0]),
      deckParentIsApp: deck.parentElement === app,
      deckInsideScreen: screen.contains(deck),
      padding: appStyle.padding,
      gap: appStyle.gap,
      direction: appStyle.flexDirection,
      // 底栏必须落在屏幕外框**下方**（样机口径）
      below: deckRect.top >= screenRect.bottom - 0.5,
      screenFlex: getComputedStyle(screen).flexGrow,
    }
  })

  expect(shell.children).toEqual(['screen', 'deck'])
  expect(shell.deckParentIsApp).toBe(true)
  expect(shell.deckInsideScreen).toBe(false)
  expect(shell.padding).toBe('10px 12px 8px')
  expect(shell.gap).toBe('6px')
  expect(shell.direction).toBe('column')
  expect(shell.below).toBe(true)
  expect(shell.screenFlex).toBe('1')
})

test('底栏三段顺序：场景指示 / 软键 / 数据源 / 站点小字', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  const deck = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="deck"]') as HTMLElement
    const keys = bar.querySelector('.deck-keys') as HTMLElement
    const scene = bar.querySelector('.deck-scene') as HTMLElement
    const src = bar.querySelector('.deck-src') as HTMLElement
    const footer = bar.querySelector('.deck-footer') as HTMLElement

    return {
      order: Array.from(bar.children).map((child) => child.className.split(' ')[0]),
      sceneBeforeKeys: scene.getBoundingClientRect().left < keys.getBoundingClientRect().left,
      keysBeforeSrc: keys.getBoundingClientRect().left <= src.getBoundingClientRect().left,
      // 软键推到右侧（样机的 margin-left:auto）。
      // 注意读不到 `auto` —— computed style 给的是解析后的实际像素值，
      // 所以这里断言「空出来的距离足够大」，而不是断言字面量。
      keysGapFromScene: keys.getBoundingClientRect().left - scene.getBoundingClientRect().right,
      srcHasState: /live|demo/.test(src.className),
      // 小字紧贴软键左侧（不是最右边）
      footerLeftOfKeys: footer.getBoundingClientRect().right <= keys.getBoundingClientRect().left,
      footerText: (footer.textContent ?? '').trim(),
    }
  })

  // 用户口径：站点小字在**软键左侧**，其后依次是软键、数据源
  expect(deck.order).toEqual(['deck-scene', 'deck-footer', 'deck-keys', 'deck-src'])
  expect(deck.sceneBeforeKeys).toBe(true)
  expect(deck.keysBeforeSrc).toBe(true)
  expect(deck.keysGapFromScene).toBeGreaterThan(50)
  expect(deck.srcHasState).toBe(true)
  expect(deck.footerLeftOfKeys).toBe(true)
  // 站点小字来自三级配置（默认配置里就有版权与口号）
  expect(deck.footerText).toContain('©')
})

test('场景指示：6 个场景，当前场景显示 label，其余是点', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  await expect(page.locator('.deck-scene b')).toHaveCount(6)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'home')

  const strip = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.deck-scene b')).map((node) => ({
      text: (node.textContent ?? '').trim(),
      on: node.classList.contains('on'),
    })),
  )

  const on = strip.filter((item) => item.on)
  expect(on).toHaveLength(1)
  expect(on[0]?.text).toBe('HOME')
  // 其余全是单点，不显示别人的 label（样机口径）
  expect(strip.filter((item) => !item.on).every((item) => item.text === '·')).toBe(true)
})

test('软键照样机：菜单 (P) 与音效两个都在，样式 2px 边框 + 2px 8px 内边距，hover 有反馈', async ({
  page,
}) => {
  await page.goto('/')
  await booted(page)

  // 样机底栏是「菜单 (P) + 音效」两个软键，一个都不许少
  const softkeys = page.locator('.deck-keys .softkey')
  await expect(softkeys).toHaveCount(2)
  await expect(softkeys.nth(0)).toHaveText(/菜单 \(P\)/)
  await expect(softkeys.nth(1)).toHaveText(/音效 (ON|OFF)/)

  const softkey = page.locator('[data-testid="softkey-sound"]')
  await expect(softkey).toBeVisible()

  const style = await softkey.evaluate((node) => {
    const computed = getComputedStyle(node)
    return {
      borderWidth: computed.borderTopWidth,
      borderStyle: computed.borderStyle,
      padding: computed.padding,
      background: computed.backgroundColor,
    }
  })

  expect(style.borderWidth).toBe('2px')
  expect(style.borderStyle).toBe('solid')
  expect(style.padding).toBe('2px 8px')

  // 样机的 .softkey:hover 是给鼠标用户的存在感；铁律里的「无 hover」只管焦点模型
  await softkey.hover()
  await expect
    .poll(async () => softkey.evaluate((node) => getComputedStyle(node).backgroundColor))
    .not.toBe(style.background)
})

test('站点小字与外框绑定：404 页也在，且仍在底栏右侧', async ({ page }) => {
  await page.goto('/no/such/path')
  await booted(page)

  await expect(page.locator('[data-testid="deck-footer"]')).toBeVisible()
  await expect(page.locator('[data-testid="deck-footer"]')).toContainText('©')

  const placement = await page.evaluate(() => {
    const footer = document.querySelector('[data-testid="deck-footer"]') as HTMLElement
    const screen = document.querySelector('[data-testid="screen"]') as HTMLElement
    return {
      belowScreen: footer.getBoundingClientRect().top >= screen.getBoundingClientRect().bottom - 1,
      text: (footer.textContent ?? '').trim().length,
    }
  })

  expect(placement.belowScreen).toBe(true)
  expect(placement.text).toBeGreaterThan(3)
})

test('整屏转场遮罩：导航时出现一次，落到 k-* 的三种皮肤之一', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  // 用 MutationObserver 记录遮罩节点：比 waitForSelector 更能抓住 280ms 的窗口
  await page.evaluate(() => {
    const seen: string[] = []
    ;(window as unknown as { __trans: string[] }).__trans = seen
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof HTMLElement && node.classList.contains('trans'))
            seen.push(node.className)
        }
      }
    }).observe(document.querySelector('#app') as Element, { childList: true, subtree: true })
  })

  // 走一次真实站内导航：点标签栏的「文章」页签（切标签是竖条擦除转场）
  await page.click('[data-testid="tab-posts"]')
  await expect(page).toHaveURL(/\/posts$/)

  const seen = await page.evaluate(() => (window as unknown as { __trans: string[] }).__trans)
  expect(seen.length).toBeGreaterThan(0)
  expect(seen[0]).toMatch(/k-(flash|wipe|shake)/)

  // 遮罩只是装饰：落下后必须自己撤掉，不能永久盖住画面
  await expect(page.locator('[data-testid="transition"]')).toHaveCount(0)
})

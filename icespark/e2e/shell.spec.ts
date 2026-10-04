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
 *        ├── .deck-scene     场景指示：一格一个场景（条数跟着 `scene/scenes.ts` 走），
 *        │                   当前项显示 label，其余 `·`
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

/**
 * 场景指示的格子数 = `scene/scenes.ts` 的场景表条数（样机口径：一格一个场景）。
 * 场景表随页面增加而变长：P3 时 6 格，P4 加用户档案页后 7 格，P6 加写作页后 8 格 —— 数字要跟着表走。
 */
test('场景指示：8 个场景，当前场景显示 label，其余是点', async ({ page }) => {
  await page.goto('/')
  await booted(page)

  await expect(page.locator('.deck-scene b')).toHaveCount(8)
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

test('ESC 在每一页都能起暂停菜单（不再有个别页面把它吃掉）', async ({ page }) => {
  // 用户反馈过：只有主页能按 ESC 起菜单。根因是 /about 与 /links 各自把 `cancel`
  // 吃下去改去 `focusTabs()`，`TabBar` 也会在光标停在自己身上时吃掉它。
  // 现在口径统一：ESC 只有一个含义，除非眼前有模态（那种情况下 ESC 关的是那一层）。
  await page.addInitScript(() => localStorage.setItem('synthspark-icespark-sound-prompt', '1'))

  const posts = await (await page.request.get('/api/posts/?limit=1&status=published')).json()
  const first = posts.items?.[0]
  const articleKey = first ? first.slug || first.id : null

  const paths = ['/', '/posts', '/links', '/about', '/user/icespark_admin', '/no/such/page']
  if (articleKey) paths.push(`/post/${encodeURIComponent(articleKey)}`)

  for (const path of paths) {
    await page.goto(path)
    await booted(page)
    await expect(page.locator('.app')).toHaveAttribute('data-scope', 'scene')

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="pause"]'), `${path} 上 ESC 应该起菜单`).toBeVisible()

    // 再按一次关掉，回到干净状态
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
  }
})

test('底条常驻：屏幕不高、正文又长时，键位/翻页条仍在下沿可见', async ({ page }) => {
  // 用户反馈过：这条提示排在正文最后，屏幕不够高就看不见。
  // 现在它挂 `.sticky-foot`（全局一条规则），滚动时贴住屏幕下沿。
  await page.addInitScript(() => localStorage.setItem('synthspark-icespark-sound-prompt', '1'))
  await page.setViewportSize({ width: 1100, height: 520 })

  for (const [path, sel, ready] of [
    ['/', '.home-foot', '[data-testid^="home-post-"]'],
    ['/posts', '.foot', '[data-testid="post-card"]'],
  ] as const) {
    await page.goto(path)
    await booted(page)
    const scroller = page.locator('.screen-inner')
    await expect(page.locator(sel)).toBeAttached()
    // 列表是异步拉的：先等第一批卡片真的渲染出来再量高度。
    // 不等的话并行跑（默认 8 个 worker）时页面还是空的，这条用例会假失败 ——
    // 它要证明的是「长页面也贴住下沿」，不是「接口有多快」。
    await expect(page.locator(ready).first()).toBeAttached()
    // 先确认这一页真的比视口高（否则这条用例证明不了什么）
    const tall = await scroller.evaluate((el) => el.scrollHeight > el.clientHeight + 40)
    expect(tall, `${path} 的正文应当比视口高`).toBe(true)

    // 滚到中间：底条必须仍在视口内（sticky）
    await scroller.evaluate((el) => void (el.scrollTop = Math.floor(el.scrollHeight / 2)))
    const box = await page.locator(sel).boundingBox()
    const vh = page.viewportSize()!.height
    expect(box, `${path} 的底条应当还量得到`).not.toBeNull()
    expect(box!.y + box!.height, `${path} 的底条应当贴在视口下沿`).toBeLessThanOrEqual(vh + 2)
    expect(box!.y, `${path} 的底条不该跑出视口上方`).toBeGreaterThan(0)

    // 常驻的前提是它看起来仍属于这一页：贴上去之后不能显出自己的色带。
    // 原先的底条没有背景，白画布透出来就是原貌 —— 所以底条的底色必须与画布一致。
    // 这一条不能靠肉眼在静止画面里判断，直接比计算值（曾误用 --paper-alt，浅蓝一条很显眼）。
    const [bar, canvas] = await page.evaluate((s) => {
      const el = document.querySelector(s) as HTMLElement
      const screen = document.querySelector('.screen') as HTMLElement
      return [getComputedStyle(el).backgroundColor, getComputedStyle(screen).backgroundColor]
    }, sel)
    expect(bar, `${path} 的底条不应当有自己的色带`).toBe(canvas)

    // 常驻的另一个前提：它得真是页面最下面那一条。
    // 曾经的缺陷（用户在 /admin/site 上发现的）：页面根节点被 `.screen-inner > *` 定死一屏高，
    // 内部那个 `flex: 1` 的容器被压回一屏、内容溢到盒子外面，于是紧随其后的底条落在
    // 「盒子的底」而不是「内容的底」上 —— 滚到底时指引停在页面中部、保存栏反在它下面。
    // 判据放在滚到底这一刻：底条此时处于自然位置，任何**可见的流内元素**都不该出现在它下面。
    await scroller.evaluate((el) => void (el.scrollTop = el.scrollHeight))
    const below = await page.evaluate((s) => {
      const foot = document.querySelector(s) as HTMLElement
      const viewport = document.querySelector('.screen-inner')!.getBoundingClientRect()
      const ft = foot.getBoundingClientRect()
      const hits: string[] = []
      for (const el of foot.parentElement!.querySelectorAll('*')) {
        if (foot.contains(el)) continue
        const cs = getComputedStyle(el)
        if (cs.position === 'absolute' || cs.position === 'fixed') continue
        if (cs.display === 'none' || cs.visibility === 'hidden') continue
        const rc = el.getBoundingClientRect()
        if (rc.height === 0 || rc.width === 0) continue
        if (rc.top > ft.top + 1 && rc.bottom <= viewport.bottom + 1) {
          hits.push(`${el.className || el.tagName}@${Math.round(rc.top)}`)
        }
      }
      return hits
    }, sel)
    expect(below, `${path} 的底条下面不该还有别的元素`).toEqual([])
  }
})

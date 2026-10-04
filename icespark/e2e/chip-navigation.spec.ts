import { expect, test, type Page } from '@playwright/test'

import { booted, press } from './helpers'

/**
 * 「芯片与栅格导航」用例簇：首页的三个芯片分区 + 文章列表页的栅格方向键 / 横向筛选条 / 标签栏导航。
 *
 * 为什么单独开一个文件：这一簇在样机里已经**冻结**，生产版源码也**已经实现**，
 * 但 `e2e/` 下零覆盖 —— 一份对样机 176 条断言的覆盖审计把这几条标成未覆盖。
 * 样机的冻结口径在：
 * · `design/icespark-prototype/e2e/smoke.mjs:88-200`
 *   （视觉相邻：从 0 按 ↓ 到 2 而不是 1；↑ 顶到标签栏；→ 到「关联」；ENTER 进关联页）
 * · `design/icespark-prototype/e2e/round5.mjs:100-140`（分组行是独立一行、G 键直达）
 * · `design/icespark-prototype/e2e/gates.mjs`
 *   （焦点门第 6 条「已选中芯片被聚焦时底色确实变了」、第 7 条「横向筛选条里焦点芯片滚进视野」）
 *
 * 三条自我约束与同目录既有 spec 同源（`write.spec.ts` / `list-paging.spec.ts` 的文件头把理由写全了）：
 *
 * 1. **不依赖真账号**：本文件只走公开页（`/`、`/posts`、`/links`），不需要登录态，
 *    因此 `addInitScript` 只写 `synthspark-icespark-sound-prompt=1`（不让音效询问框弹出来抢焦点），
 *    不写假令牌 —— 没有令牌，外壳挂载时的 `bootstrapAuth()` 不会打 `/api/auth/me`，也就没有 401。
 * 2. **不依赖后端有数据**：文章 / 分组 / 标签 / 统计 / 外链全部用夹具（见下）。
 * 3. **开机自检先让位**：每次 `goto` 之后 `await booted(page)`，否则第一下按键会被自检吃掉。
 *
 * 手法上注意两点（照 `list-paging.spec.ts`）：
 * - Playwright 里多条同时命中的 `route` 只有**最后注册**的那条生效，所以用**单条正则
 *   route 内部按 pathname 分派**，不靠注册顺序。
 * - 「哪一张卡带 `is-focused`」用 `page.evaluate` 读下标（与样机 `smoke.mjs` 的
 *   `focusedIdx()` 同一口径）—— 因为它验的是**视觉相邻**，只有下标能说明问题。
 *
 * 本文件全部是**只读断言**：没有写操作、没有 `test.only`。
 */

/* ────────────── 夹具 ────────────── */

/** 分组芯片夹具：字段按契约 `Group` 给全 */
function group(name: string, count: number, i: number) {
  return {
    id: `g-${i}`,
    name,
    description: null,
    icon: null,
    sort_order: i,
    post_count: count,
    created_at: '2026-09-01T10:00:00',
    updated_at: '2026-09-01T10:00:00',
  }
}

/** 标签芯片夹具：字段按契约 `Tag` 给全 */
function tag(name: string, count: number, i: number) {
  return {
    id: `t-${i}`,
    name,
    description: null,
    color: null,
    post_count: count,
    created_at: '2026-09-01T10:00:00',
  }
}

/** 列表项夹具：字段按契约 `PostListItem` 给全 */
function listItem(id: string, title: string, groupName: string) {
  return {
    id,
    title,
    slug: `slug-${id}`,
    introduction: `${title} 的摘要。`,
    cover_image: null,
    status: 'published',
    author_id: 'u-1',
    author_name: '测试读者',
    author_username: 'e2e_reader',
    author_avatar: null,
    author_type: 'user',
    tags: [],
    group_id: groupName === '技术' ? 'g-1' : 'g-2',
    group_name: groupName,
    view_count: 7,
    like_count: 3,
    created_at: '2026-09-01T10:00:00',
    updated_at: '2026-09-01T10:00:00',
    published_at: '2026-09-01T10:00:00',
  }
}

/** 两个分组 + 两个标签（首页用例的夹具口径：芯片计数 > 0 即可，不必多） */
const GROUPS = [group('技术', 3, 1), group('随笔', 3, 2)]
const TAGS = [tag('草图', 3, 1), tag('排版', 3, 2)]

/**
 * 横向筛选条的夹具：名字刻意长（8 个汉字）且数量多（18 枚），
 * 保证 1280 宽下 `group-row` 的 `scrollWidth > clientWidth` —— 否则「焦点芯片滚进视野」
 * 那条断言会退化成空转（元素本来就在视野里，滚不滚都成立）。
 * 样机 `gates.mjs` 用的是真实库里的 14 个标签，这里用夹具复刻同一个条件。
 */
const MANY_GROUPS = [
  '技术笔记归档',
  '随笔散记栏目',
  '像素图形实验',
  '排版字体研究',
  '后端接口笔记',
  '前端渲染札记',
  '数据库与事务',
  '部署运维记录',
  '主题皮肤设计',
  '键盘交互设计',
  '无障碍与焦点',
  '构建工具链',
  '测试与回归门',
  '性能与预算',
  '配色与令牌',
  '动画与转场',
  '存档与迁移',
  '杂项与其他',
].map((name, i) => group(name, 1, i + 1))

/**
 * 六篇：栅格是两列，六篇正好三行。
 * 「视觉相邻」的判定只需要「同一列下一行」存在，`pageSize` 设成 6 让六篇同页，下标一眼可辨。
 */
const POSTS = [
  listItem('p-1', '夹具文章一号', '技术'),
  listItem('p-2', '夹具文章二号', '技术'),
  listItem('p-3', '夹具文章三号', '技术'),
  listItem('p-4', '夹具文章四号', '随笔'),
  listItem('p-5', '夹具文章五号', '随笔'),
  listItem('p-6', '夹具文章六号', '随笔'),
]

/** 外链夹具：有关联页时渲染 `links-grid` 而不是空态 */
const LINKS = [
  {
    id: 'l-1',
    name: '示例站点',
    url: 'https://example.com/',
    cover_image: null,
    sort_order: 0,
    created_at: '2026-09-01T10:00:00',
    updated_at: '2026-09-01T10:00:00',
  },
  {
    id: 'l-2',
    name: '同域服务',
    url: '/api/services/hello/',
    cover_image: null,
    sort_order: 1,
    created_at: '2026-09-01T10:00:00',
    updated_at: '2026-09-01T10:00:00',
  },
]

const STATS = { agent_count: 2, post_count: 6, total_views: 42 }

/* ────────────── 桩 ────────────── */

interface StubOptions {
  /** 覆盖分组夹具（横向筛选条用例要一堆分组） */
  groups?: unknown[]
  /** 覆盖标签夹具 */
  tags?: unknown[]
}

/**
 * 页面要调的几组接口全部打桩：`/api/posts/`、`/api/groups/`、`/api/tags/`、
 * `/api/stats/summary`、`/api/links/`。其余 `/api/**`（站点配置…）放给真后端 ——
 * 本文件既不读也不断言它们，接口挂了页面照旧回退内置默认（`stores/site.ts` 的口径）。
 */
async function stubApi(page: Page, options: StubOptions = {}): Promise<void> {
  const groups = options.groups ?? GROUPS
  const tags = options.tags ?? TAGS

  await page.addInitScript(() => {
    // 音效询问框不弹（它是外壳级模态，会和这一页的按键路径抢焦点）
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
    // 每页 6 条：六篇正好一页三行，栅格下标不会被分页截断
    localStorage.setItem('synthspark-icespark-page-size', '6')
  })

  // 单条正则 + 内部按 pathname 分派（多条 route 同时命中只有最后注册的生效，见文件头）。
  // 正则只圈住本文件要打桩的几组接口：写成 `/\/api\//` 的话，dev 下的模块请求
  // （`/src/api/posts.ts` 这类）也会被这条 route 收进来，白白多绕一道。
  await page.route(/\/api\/(groups|links|posts|stats|tags)\//, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    // 本文件不涉及任何写操作，其余方法一律放行（放了也没人发）
    if (request.method() !== 'GET') return route.fallback()

    if (path === '/api/posts/') return json({ items: POSTS, total: POSTS.length })
    if (path === '/api/groups/') return json(groups)
    if (path === '/api/tags/') return json(tags)
    if (path === '/api/stats/summary') return json(STATS)
    if (path === '/api/links/') return json(LINKS)

    return route.fallback()
  })
}

/* ────────────── 助手 ────────────── */

/**
 * 当前带 `is-focused` 的那张卡在栅格里的下标（没有则 -1）。
 * 与样机 `smoke.mjs` 的 `focusedIdx()` 同一口径 —— 「视觉相邻」只有下标能说清。
 */
function focusedCardIndex(page: Page): Promise<number> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid="post-card"]'))
    const el = document.querySelector('[data-testid="post-card"].is-focused')
    return el ? cards.indexOf(el) : -1
  })
}

/** 某一枚分组芯片与 `group-row` 的几何关系（「焦点芯片滚进视野」的机器口径） */
function chipRowGeometry(page: Page, testId: string) {
  return page.evaluate((id) => {
    const row = document.querySelector('[data-testid="group-row"]') as HTMLElement | null
    const chip = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!row || !chip) return null
    const a = row.getBoundingClientRect()
    const b = chip.getBoundingClientRect()
    return {
      rowLeft: a.left,
      rowRight: a.right,
      left: b.left,
      right: b.right,
      /** 横向滚动了多少（不是 0 才说明「滚进视野」这条断言不是空转） */
      scrollLeft: row.scrollLeft,
      /** 芯片左右边界都落在行内 */
      ok: b.left >= a.left - 1 && b.right <= a.right + 1,
    }
  }, testId)
}

/**
 * 把一枚配色令牌解析成实际的 `rgb(...)`。
 *
 * 为什么要它：全站的配色令牌是「主题在自己作用域里覆盖 CSS 变量」的机制
 * （`src/styles/tokens.ts` + `theme.css`），用例不该把 `#6FBCE0` 这类色值写死；
 * 拿一个临时探针元素把它解析成 rgb，就能与 `getComputedStyle` 读到的底色逐字对比，
 * 而且换主题后依然成立。
 */
function tokenColor(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const probe = document.createElement('div')
    probe.style.background = `var(${token})`
    document.body.appendChild(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  }, name)
}

/** 停在文章列表页（栅格与两行筛选都渲染完） */
async function openList(page: Page): Promise<void> {
  await page.goto('/posts')
  await booted(page)
  await expect(page.locator('[data-testid="post-grid"]')).toBeVisible()
}

/* ────────────── ① 首页：三个分区都在 ────────────── */

test('首页：三个分区都在 —— LATEST / GROUPS / TAGS，分组与标签芯片都渲染出来', async ({ page }) => {
  await stubApi(page)
  await page.goto('/')
  await booted(page)

  // 三个分区的段标：顺序与机器字样都是样机冻结的
  await expect(page.locator('.sec-cap .cap-en')).toHaveText(['LATEST', 'GROUPS', 'TAGS'])

  // 段① LATEST：三张文章卡 + 末尾那张「全部文章」卡
  await expect(page.locator('[data-testid="home-post-0"]')).toBeVisible()
  await expect(page.locator('[data-testid^="home-post-"]')).toHaveCount(3)
  await expect(page.locator('.post.all')).toHaveCount(1)

  // 段② / 段③：分组与标签各两枚（夹具口径），计数大于 0 就说明分区不是空壳
  await expect(page.locator('[data-testid^="home-group-"]')).toHaveCount(2)
  await expect(page.locator('[data-testid^="home-tag-"]')).toHaveCount(2)
  await expect(page.locator('[data-testid="home-group-0"]')).toContainText('技术')
  await expect(page.locator('[data-testid="home-tag-1"]')).toContainText('排版')

  // 「查看全部」在同一页（LATEST 段标右边那颗），且真的挂在本页上
  await expect(page.locator('[data-testid="home-all"]')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.querySelector('[data-testid="home-all"]')?.closest('.home') !== null,
    ),
  ).toBe(true)
})

/* ────────────── ② 栅格方向键：视觉相邻 ────────────── */

test('文章列表：栅格方向键按视觉相邻走 —— ↓ 到第 3 张（下标 2）而不是第 2 张', async ({ page }) => {
  await stubApi(page)
  await openList(page)
  await expect(page.locator('[data-testid="post-card"]')).toHaveCount(6)

  // 初始焦点在第 0 张，且全场只有一个光标
  expect(await focusedCardIndex(page)).toBe(0)
  await expect(page.locator('[data-testid="post-card"].is-focused')).toHaveCount(1)

  /*
   * ↓：两列栅格下应当落到**同一列的下一行** = 下标 2。
   * 若实现写成「行号 + 1」（按顺序切换），这里就会是 1 —— 这一条就是冲着那个写法来的。
   */
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => focusedCardIndex(page)).toBe(2)
  await expect(page.locator('[data-testid="post-card"].is-focused')).toHaveCount(1)

  // → 同行右邻：2 → 3
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => focusedCardIndex(page)).toBe(3)

  // ← 同行左邻：3 → 2
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => focusedCardIndex(page)).toBe(2)

  // ↑ 同列上一行：2 → 0
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => focusedCardIndex(page)).toBe(0)

  // 反过来再验一次横向：从 0 按 → 是 1（同行相邻），与 ↓ 的 2 互不混淆
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => focusedCardIndex(page)).toBe(1)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => focusedCardIndex(page)).toBe(0)
})

/* ────────────── ③ 横向筛选条：单行横滚 + 焦点滚进视野 ────────────── */

test('文章列表：分组行是单行横滚条 —— 真的溢出，且焦点走到最后一枚时它滚进视野', async ({
  page,
}) => {
  // 18 枚长名分组：1280 宽下必然溢出这一条的单行
  await stubApi(page, { groups: MANY_GROUPS })
  await openList(page)

  const row = page.locator('[data-testid="group-row"]')
  const size = await row.evaluate((el) => ({
    sw: (el as HTMLElement).scrollWidth,
    cw: (el as HTMLElement).clientWidth,
  }))
  // 可横滚 = 内容比视口宽；不成立的话下面那条断言就是空转
  expect(size.sw).toBeGreaterThan(size.cw)

  // G 直达分组行首项，再一路 → 走到最后一枚（分组数 + 1 枚「全部分组」）
  await page.keyboard.press('g')
  await expect(page.locator('[data-testid="group-all"]')).toHaveClass(/is-focused/)
  for (let i = 0; i < MANY_GROUPS.length; i += 1) await page.keyboard.press('ArrowRight')

  const lastId = `group-${MANY_GROUPS[MANY_GROUPS.length - 1]!.name}`
  await expect(page.locator(`[data-testid="${lastId}"]`)).toHaveClass(/is-focused/)

  // 焦点芯片会滚进视野（`ensureFocusedVisible()` 在 requestAnimationFrame 里做，
  // 所以用可重试轮询而不是读一次就断言，否则会和那一帧抢时间）
  await expect.poll(async () => (await chipRowGeometry(page, lastId))?.ok).toBe(true)
  const geo = (await chipRowGeometry(page, lastId))!
  // 芯片左右边界都落在行内
  expect(geo.left).toBeGreaterThanOrEqual(geo.rowLeft - 1)
  expect(geo.right).toBeLessThanOrEqual(geo.rowRight + 1)
  // 且这一条真的横向滚了 —— 证明上一条不是空转
  expect(geo.scrollLeft).toBeGreaterThan(0)
})

/* ────────────── ④ 选中态不吞焦点 ────────────── */

test('文章列表：已选中的芯片被聚焦时底色确实变了（选中态不吞焦点）', async ({ page }) => {
  await stubApi(page)
  await openList(page)

  /** 读某一枚芯片的实际底色 */
  const bg = (testId: string) =>
    page.locator(`[data-testid="${testId}"]`).evaluate((el) => getComputedStyle(el).backgroundColor)

  // 无筛选时两行的「全部」都是选中态（`on`）、都没有焦点
  await expect(page.locator('[data-testid="group-all"]')).toHaveClass(/on/)
  await expect(page.locator('[data-testid="group-all"]')).not.toHaveClass(/is-focused/)
  // 此刻没有类变化，读到的是稳态值
  const groupAllOn = await bg('group-all')
  const tagAllOn = await bg('tag-all')
  // 对照项：同为「选中但未聚焦」，两枚该是同一个底色
  expect(tagAllOn).toBe(groupAllOn)
  // 「选中未聚焦」的底色就是配色令牌里的 blue-500（换主题也成立，不写死色值）
  expect(groupAllOn).toBe(await tokenColor(page, '--blue-500'))

  // G 聚焦分组行首项 —— 它**同时**是选中态，这正是「选中色会不会把焦点底色压掉」的现场
  await page.keyboard.press('g')
  await expect(page.locator('[data-testid="group-all"]')).toHaveClass(/is-focused/)
  /*
   * 底色必须**等过渡走完**再读：全站有 8bit 阶梯过渡 `transition: all 0.16s steps(4)`
   * （`src/styles/pixel.css` 的 `.focusable`），class 一变 `getComputedStyle` 立刻读到的是
   * 过渡起点那一档（实测：立刻读 = 选中色 rgb(61,155,208)，约 160ms 后才到焦点色
   * rgb(111,188,224)，中间还会读到 rgb(99,180,220) 这种阶梯档）。
   * 所以这里轮询到**过渡终点的那个色值**再断言，而不是读一次 —— 写这条时先吃了一发假红。
   */
  const focusedColor = await tokenColor(page, '--blue-400')
  await expect.poll(() => bg('group-all'), { timeout: 3000 }).toBe(focusedColor)
  const groupAllFocused = await bg('group-all')
  // 焦点色与选中色必须是两个值：同色就等于「加了 class 但屏幕上看不出焦点」
  expect(groupAllFocused).not.toBe(groupAllOn)
  // 对照项没被波及：标签行那枚仍是「选中未聚焦」的原色
  expect(await bg('tag-all')).toBe(tagAllOn)

  // 再把焦点移开（T 去标签行）：底色应当回到「选中未聚焦」的原值，说明变化来自焦点本身
  await page.keyboard.press('t')
  await expect(page.locator('[data-testid="group-all"]')).not.toHaveClass(/is-focused/)
  await expect.poll(() => bg('group-all'), { timeout: 3000 }).toBe(groupAllOn)
})

/* ────────────── ⑤ 方向键上到标签栏并切页 ────────────── */

test('文章列表：↑ 顶到标签栏、→ 走到下一枚页签、ENTER 切到关联页', async ({ page }) => {
  await stubApi(page)
  await openList(page)

  // 默认焦点分区是内容区
  await expect(page.locator('.app')).toHaveAttribute('data-zone', 'content')

  // 卡片栅格 → 标签行 → 分组行 → 标签栏：三次 ↑
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(page.locator('.app')).toHaveAttribute('data-zone', 'tabs')

  // 光标落在当前页签「文章」上，且只有一个页签带光标
  await expect(page.locator('[data-testid="tab-posts"]')).toHaveClass(/is-focused/)
  await expect(page.locator('[data-testid="tabbar"] .tab.is-focused')).toHaveCount(1)

  // → 到下一枚页签（「关联」）：只移动光标，不跳页
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="tab-links"]')).toHaveClass(/is-focused/)
  await expect(page.locator('[data-testid="tab-posts"]')).not.toHaveClass(/is-focused/)
  await expect(page).toHaveURL(/\/posts$/)

  // ENTER 才真的切页：URL 变、关联页渲染出来、焦点交还内容区
  await press(page, 'Enter')
  await expect(page).toHaveURL(/\/links$/)
  await expect(page.locator('[data-testid="links-grid"]')).toBeVisible()
  await expect(page.locator('[data-testid="link-card"]')).toHaveCount(LINKS.length)
  await expect(page.locator('.app')).toHaveAttribute('data-zone', 'content')
})

test('文章列表：进了标签栏分区之后，页内光标不再动（分区规则）+ 样机一致的那处「双光标」', async ({
  page,
}) => {
  await stubApi(page)
  await openList(page)

  /** 页内（非标签栏）带自绘光标的元素 */
  const pageSideFocused = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.focusable.is-focused')]
        .filter((el) => !el.closest('[data-testid="tabbar"]'))
        .map((el) => el.getAttribute('data-testid') ?? el.className)
        .sort(),
    )

  await expect(page.locator('.app')).toHaveAttribute('data-zone', 'content')

  // 三次 ↑ 顶到标签栏。注意这三次 ↑ **本来就会**把页内光标从卡片挪到分组行
  // （分区是 卡片栅格 → 标签行 → 分组行 → 标签栏），所以基线必须取在**进分区之后**，
  // 否则断言的是「↑ 不该动光标」——那是另一条规则（本门踩过一次）
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowUp')
  await expect(page.locator('.app')).toHaveAttribute('data-zone', 'tabs')
  const before = await pageSideFocused()

  // 规则（`pad.ts`）：`focusZone === 'tabs'` 时**场景监听器整层跳过** ——
  // 所以 ←→ 只该动标签栏的光标，页内光标一动不动
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="tab-links"]')).toHaveClass(/is-focused/)
  expect(await pageSideFocused(), '进了标签栏分区后，页内光标不该跟着动').toEqual(before)

  // 同一时刻**页内光标仍然画着**（`group-all`）—— 「屏幕上永远只有一个光标」在这条边界上不成立。
  // 这是**样机就有的怪相**，实测两个应用逐字一致（样机 `/posts` 三次 ↑ 之后：
  // `zone=tabs`，`.focusable.is-focused` = `['tab-posts', 'group-all']`），所以生产版照样机保留。
  // 谁要收掉它，属于改产品行为（先要用户口径），改的时候这条断言会拦一下并指向这里。
  expect(before.length, '页内光标在标签栏分区里仍然可见（样机一致，别顺手「修」）').toBeGreaterThan(0)
})

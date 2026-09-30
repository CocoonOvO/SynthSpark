import { expect, test, type Page } from '@playwright/test'

import { booted } from './helpers'

/**
 * 纯键盘旅程：**文章详情页**与**文章列表页**（样机已冻结、生产已实现、此前 e2e 零覆盖）。
 *
 * 三条自我约束与同目录既有 spec 同源（`write.spec.ts` 的文件头把理由写全了）：
 *
 * 1. **不依赖真账号**：登录态靠 `page.addInitScript` 写的两把键（`synthspark-token` +
 *    `synthspark-icespark-user`），并且 `GET /api/auth/me` 必须打桩 —— 假令牌打真接口
 *    只会 401，外壳挂载时的 `bootstrapAuth()` 会因此登出。
 * 2. **不依赖后端有数据**：文章 / 分组 / 标签 / 评论全部用夹具；与本页无关的
 *    `/api/**`（站点配置…）交给 `route.fallback()`，拦了反而要自己造整站配置。
 * 3. **开机自检先让位**：每次 `goto` 之后 `await booted(page)` —— 自检期按任意键会被吃掉。
 *
 * 两条本题独有的纪律：
 *
 * - **全程只用键盘**：除 `goto` / `booted` 外一次 `page.click` / `page.mouse` 都不用
 *   （要验的正是「单独用键盘能走完全程」）。需要鼠标才成立的路径不在这里写。
 * - **单条正则 route**：Playwright 里多条 route 同时命中时只有**最后注册**的生效，
 *   所以 `/api/**` 由一条 handler 内部按 pathname 分派（与 `write.spec.ts` 同一处改法）。
 *
 * ⚠️ 有一条用例曾标 `test.fail`（文章页 TAB 断在第一个落点）——那是产品真 bug，**已修**（架构 §32.3），
 * 不改 `src/`、不留红断言，原因写在用例体内，修复后该用例会自动由「预期失败」翻红提醒。
 */

/* ────────────── 夹具 ────────────── */

const USER = { id: 'u-1', username: 'e2e_kb', display_name: '键盘测试员', is_superuser: false }

/** 文章在 URL 里的 key（slug 优先，与 `api/format.ts` 的 `postKey` 同口径） */
const ARTICLE_KEY = 'e2e-article'
/** 正文里那条站内链接的目标（验「回车走前端路由」） */
const BODY_LINK_KEY = 'e2e-post-2'

/**
 * 正文要够长：屏幕是滚动容器 `.screen-inner`（`overflow-y: auto`），
 * 短正文既验不了 `↓` 滚一步 / `U` 回顶部，也验不了「焦点跑出屏幕自动滚进视野」。
 * 两个链接一个站内、一个站外，都落在文档深处（默认视口下在屏幕下方）。
 */
function bodyText(seed: string): string {
  const paras = Array.from(
    { length: 12 },
    (_, i) => `第 ${i + 1} 段。这一段刻意写长，用来把正文撑出屏幕：键盘使用者要能一路滚下去。`,
  ).join('\n\n')
  return [
    `## ${seed}·第一节`,
    paras,
    `站内链接：[另一篇](/post/${BODY_LINK_KEY})`,
    `## ${seed}·第二节`,
    paras,
    '外链：[example](https://example.com/)',
    `## ${seed}·第三节`,
    paras,
  ].join('\n\n')
}

/** 完整文章模型（`GET /api/posts/slug/{slug}` 与 `GET /api/posts/{id}` 都回它） */
function postModel(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'p-1',
    title: '键盘旅程：文章详情页',
    content: bodyText('文章'),
    introduction: '纯键盘用例的夹具文章。',
    cover_image: null,
    status: 'published',
    slug: ARTICLE_KEY,
    author_id: USER.id,
    author_name: USER.display_name,
    author_username: USER.username,
    author_avatar: null,
    author_type: 'user',
    // 两枚标签 + 一个分组：芯片行要有「不止一枚」，←→ 行内移动才验得出来
    tags: ['像素', '排版'],
    group_id: 'g-1',
    group_name: '技术笔记',
    view_count: 42,
    created_at: '2026-09-20T10:00:00',
    updated_at: '2026-09-20T10:00:00',
    published_at: '2026-09-20T10:00:00',
    ...over,
  }
}

const ARTICLE = postModel()
const SECOND_ARTICLE = postModel({
  id: 'p-2',
  title: '第二篇夹具文章',
  slug: BODY_LINK_KEY,
  content: bodyText('第二篇'),
  group_name: '随笔',
  tags: ['排版'],
})

const POSTS_BY_SLUG: Record<string, Record<string, unknown>> = {
  [ARTICLE_KEY]: ARTICLE,
  [BODY_LINK_KEY]: SECOND_ARTICLE,
}

/** 列表项（`PostListItem`：**没有 content**）—— 8 条，配合每页 6 条足以撑出滚动 */
function listItem(n: number): Record<string, unknown> {
  const {
    content: _content,
    introduction: _intro,
    ...rest
  } = postModel({
    id: `p-list-${n}`,
    title: `列表夹具 ${n}`,
    slug: `e2e-list-${n}`,
  })
  return { ...rest, like_count: n }
}
const POSTS = Array.from({ length: 8 }, (_, k) => listItem(k + 1))

const GROUPS = [
  {
    id: 'g-1',
    name: '技术笔记',
    description: null,
    icon: null,
    sort_order: 1,
    post_count: 8,
    created_at: '2026-09-01T10:00:00',
    updated_at: '2026-09-01T10:00:00',
  },
  {
    id: 'g-2',
    name: '随笔',
    description: null,
    icon: null,
    sort_order: 2,
    post_count: 1,
    created_at: '2026-09-02T10:00:00',
    updated_at: '2026-09-02T10:00:00',
  },
]

const TAGS = [
  {
    id: 't-1',
    name: '像素',
    description: null,
    color: null,
    post_count: 8,
    created_at: '2026-09-01T10:00:00',
  },
  {
    id: 't-2',
    name: '排版',
    description: null,
    color: null,
    post_count: 2,
    created_at: '2026-09-01T10:00:00',
  },
]

/* ────────────── 桩 ────────────── */

/** 登录态 + 夹具就位；返回记录到的 `/api/**` 请求（调试用） */
async function stubApi(page: Page): Promise<{ requests: string[] }> {
  const requests: string[] = []

  await page.addInitScript((u) => {
    // 音效询问框不弹（它是外壳级模态，会和这一页的按键路径抢焦点）
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
    // 每页 6 条：列表页要「焦点跑出屏幕」就必须让卡片超出一屏
    localStorage.setItem('synthspark-icespark-page-size', '6')
    localStorage.setItem('synthspark-token', 'e2e-token')
    localStorage.setItem('synthspark-icespark-user', JSON.stringify(u))
  }, USER)

  // 一条正则盖住 `/api/**`，内部按 pathname 分派（理由见文件头）
  await page.route(/\/api\//, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    requests.push(`${request.method()} ${path}`)
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (path === '/api/auth/me') return json(200, USER)
    if (path === '/api/stats/summary')
      return json(200, { agent_count: 2, post_count: 9, total_views: 128 })
    if (path === '/api/groups/') return json(200, GROUPS)
    if (path === '/api/tags/') return json(200, TAGS)
    // 注意顺序：`/api/posts/` 必须排在 startsWith 的那两条前面
    if (path === '/api/posts/') return json(200, { items: POSTS, total: POSTS.length })
    if (path.startsWith('/api/posts/slug/')) {
      const hit = POSTS_BY_SLUG[decodeURIComponent(path.slice('/api/posts/slug/'.length))]
      return hit ? json(200, hit) : json(404, { detail: '没有这篇文章' })
    }
    if (path.startsWith('/api/posts/')) {
      const key = decodeURIComponent(path.slice('/api/posts/'.length))
      const hit = Object.values(POSTS_BY_SLUG).find((p) => p.id === key)
      return hit ? json(200, hit) : json(404, { detail: '没有这篇文章' })
    }
    if (path.startsWith('/api/comments/')) return json(200, { total: 0, comments: [] })
    return route.fallback()
  })

  return { requests }
}

/** 停在文章详情页（正文与芯片都渲染完） */
async function openArticle(page: Page): Promise<void> {
  await stubApi(page)
  await page.goto(`/post/${ARTICLE_KEY}`)
  await booted(page)
  await expect(page.locator('.doc-title')).toHaveText(ARTICLE.title as string)
  await expect(page.locator('[data-testid="chips"]')).toBeVisible()
  await expect(page.locator('[data-testid="md-body"]')).toBeVisible()
}

/** 停在文章列表页（第一屏卡片与两行筛选都渲染完） */
async function openList(page: Page): Promise<void> {
  await stubApi(page)
  await page.goto('/posts')
  await booted(page)
  await expect(page.locator('[data-testid="post-card"]').first()).toBeVisible()
  await expect(page.locator('[data-testid="group-row"]')).toBeVisible()
  await expect(page.locator('[data-testid="tag-row"]')).toBeVisible()
}

/** `.screen-inner`（屏幕内层滚动容器）当前滚动位置 */
const scrollTop = (page: Page) =>
  page.evaluate(
    () => (document.querySelector('.screen-inner') as HTMLElement | null)?.scrollTop ?? -1,
  )

/** 卡片是不是「本来在屏幕下方」—— 用来证明滚进视野那条断言不是空转 */
const focusedCardGeometry = (page: Page) =>
  page.evaluate(() => {
    const screen = document.querySelector('.screen-inner') as HTMLElement
    const card = document.querySelector(
      '[data-testid="post-card"].is-focused',
    ) as HTMLElement | null
    const box = card?.getBoundingClientRect()
    const cup = screen.getBoundingClientRect()
    return {
      scrollTop: screen.scrollTop,
      top: box?.top ?? -1,
      bottom: box?.bottom ?? -1,
      cupTop: cup.top,
      cupBottom: cup.bottom,
      /** 不滚动的话，这张卡会不会露在屏幕下方（空转判据） */
      belowFold: !!box && box.top + screen.scrollTop > cup.bottom,
      inView: !!box && box.top >= cup.top - 1 && box.bottom <= cup.bottom + 1,
    }
  })

/* ────────────── 文章页：分区热键 ────────────── */

test('文章页：G 进芯片行、L 进操作条、←→ 行内移动、↓ 退出分区并下滚、U 回顶部', async ({
  page,
}) => {
  await openArticle(page)

  // G：直达分组 / 标签芯片行，焦点落在**第一枚**芯片上
  await page.keyboard.press('g')
  await expect(page.locator('[data-testid="chip-group-0"]')).toHaveClass(/is-focused/)

  // → 行内移到第二枚（标签），← 再回第一枚
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="chip-tag-1"]')).toHaveClass(/is-focused/)
  await expect(page.locator('[data-testid="chip-group-0"]')).not.toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-testid="chip-group-0"]')).toHaveClass(/is-focused/)

  // L：直达横向操作条，焦点落在第一枚（点赞）；芯片行的光标必须同时收掉（只有一个光标）
  await page.keyboard.press('l')
  await expect(page.locator('[data-testid="action-like"]')).toHaveClass(/is-focused/)
  await expect(page.locator('[data-testid="chip-group-0"]')).not.toHaveClass(/is-focused/)

  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="action-comment"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-testid="action-like"]')).toHaveClass(/is-focused/)

  // ↓：退出分区，并且让正文往下滚一步（屏幕是 overflow 容器，浏览器原生滚动滚不动它）
  expect(await scrollTop(page)).toBe(0)
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(0)
  await expect(page.locator('[data-testid="action-like"]')).not.toHaveClass(/is-focused/)

  // U：回到文章顶部
  await page.keyboard.press('u')
  expect(await scrollTop(page)).toBe(0)
})

/* ────────────── 文章页：芯片回车 = 跳筛选后的列表 ────────────── */

test('文章页：分组芯片回车 → 列表页且该分组选中，只加一条历史，Q 一次回到文章', async ({
  page,
}) => {
  await openArticle(page)

  await page.keyboard.press('g')
  await expect(page.locator('[data-testid="chip-group-0"]')).toHaveClass(/is-focused/)

  const before = await page.evaluate(() => history.length)
  await page.keyboard.press('Enter')

  // 跳到列表页，并且筛选状态**在地址栏里**（URL 是唯一真相）
  await expect(page).toHaveURL(/\/posts\?group=/)
  await expect(page).toHaveURL(/group=%E6%8A%80%E6%9C%AF%E7%AC%94%E8%AE%B0/)
  // 对应芯片是选中态（`on`）；另一行只有它自己的「全部」是选中态（没顺带选中别的标签）
  await expect(page.locator('[data-testid="group-row"] .fchip.on')).toHaveText(/技术笔记/)
  await expect(page.locator('[data-testid="tag-row"] .fchip.on')).toHaveText(/全部标签/)

  // 一次回车只产生一条历史（原生激活 + 手柄确认没有双触发）
  expect((await page.evaluate(() => history.length)) - before).toBe(1)

  // 键盘回退一次就回到文章页 —— 证明不是两条历史
  await page.keyboard.press('q')
  await expect(page).toHaveURL(new RegExp(`/post/${ARTICLE_KEY}$`))
  await expect(page.locator('[data-testid="chips"]')).toBeVisible()
})

test('文章页：标签芯片回车 → 列表页且该标签选中（tag-* 带 on），同样只加一条历史', async ({
  page,
}) => {
  await openArticle(page)

  // G 进芯片行后 →（第二枚就是第一枚标签芯片）
  await page.keyboard.press('g')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="chip-tag-1"]')).toHaveClass(/is-focused/)

  const before = await page.evaluate(() => history.length)
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/posts\?tag=/)
  await expect(page.locator('[data-testid="tag-row"] .fchip.on')).toHaveText(/像素/)
  await expect(page.locator('[data-testid="group-row"] .fchip.on')).toHaveText(/全部分组/)
  expect((await page.evaluate(() => history.length)) - before).toBe(1)
})

/* ────────────── 列表页：分区热键 ────────────── */

test('列表页：G 进分组行、T 进标签行、←→ 行内移动、↑ 顶到标签栏', async ({ page }) => {
  await openList(page)
  await expect(page.locator('.app')).toHaveAttribute('data-zone', 'content')

  // G：分组行（第一项永远是「全部分组」）
  await page.keyboard.press('g')
  await expect(page.locator('[data-testid="group-all"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="group-技术笔记"]')).toHaveClass(/is-focused/)
  await expect(page.locator('[data-testid="group-all"]')).not.toHaveClass(/is-focused/)

  // T：标签行
  await page.keyboard.press('t')
  await expect(page.locator('[data-testid="tag-all"]')).toHaveClass(/is-focused/)
  await expect(page.locator('[data-testid="group-技术笔记"]')).not.toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="tag-像素"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-testid="tag-all"]')).toHaveClass(/is-focused/)

  // ↑：标签行 → 分组行（行内光标各自记着）
  await page.keyboard.press('ArrowUp')
  await expect(page.locator('[data-testid="group-技术笔记"]')).toHaveClass(/is-focused/)

  // ↑：分组行 → 焦点交给顶部标签栏（`.app` 的 data-zone 变 tabs，光标落在当前页签「文章」）
  await page.keyboard.press('ArrowUp')
  await expect(page.locator('.app')).toHaveAttribute('data-zone', 'tabs')
  await expect(page.locator('[data-testid="tab-posts"]')).toHaveClass(/is-focused/)
})

/* ────────────── 焦点跑出屏幕：自动滚进视野 ────────────── */

test('列表页：焦点走到屏幕外的卡片上时，会自动把它滚进视野', async ({ page }) => {
  // 矮视口：6 张卡（每页 6 条）必定超出一屏，否则这条断言无从谈起
  await page.setViewportSize({ width: 1440, height: 560 })
  await openList(page)

  const gridSize = await page.evaluate(() => {
    const screen = document.querySelector('.screen-inner') as HTMLElement
    return { scrollHeight: screen.scrollHeight, clientHeight: screen.clientHeight }
  })
  expect(gridSize.scrollHeight).toBeGreaterThan(gridSize.clientHeight)

  // T 进标签行 → ↓ 进卡片栅格 → 再 ↓ 走到最后一行（默认视口下在屏幕下方）
  await page.keyboard.press('t')
  await expect(page.locator('[data-testid="tag-all"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')

  // 焦点卡片会被自动滚进视野 —— `ensureFocusedVisible()` 在 requestAnimationFrame 里做，
  // 所以这里用可重试轮询而不是读一次就断言（否则会和那一帧抢时间）
  await expect.poll(async () => (await focusedCardGeometry(page)).inView).toBe(true)

  const geo = await focusedCardGeometry(page)
  // 焦点确实被屏幕带着走了（滚动容器滚了）
  expect(geo.scrollTop).toBeGreaterThan(0)
  // 焦点卡片落在屏幕视口内
  expect(geo.top).toBeGreaterThanOrEqual(geo.cupTop - 1)
  expect(geo.bottom).toBeLessThanOrEqual(geo.cupBottom + 1)
  // 且它本来在屏幕下方 —— 证明上一条不是空转（`top + scrollTop` 不随滚动改变）
  expect(geo.belowFold).toBe(true)
})

/* ────────────── 正文里的站内链接 ────────────── */

test('文章页：正文站内链接回车走前端路由（URL 变、无整页刷新、只加一条历史）', async ({ page }) => {
  await openArticle(page)

  const link = page.locator(`[data-testid="md-body"] a[href="/post/${BODY_LINK_KEY}"]`)
  await expect(link).toHaveCount(1)

  // 为什么用焦点 API 而不是一路 TAB 走过来：这里只验「回车 → 前端路由」这条链路本身
  // （焦点放上去之后，激活只按回车，一次鼠标都不用）；TAB 的顺序遍历由下面那条专门的
  // 用例守着（它曾经因为文章页的 TAB 断在第一个落点而红，§32.3 已修）。
  await link.evaluate((el) => (el as HTMLElement).focus())
  await expect(link).toBeFocused()

  // 整页导航计数与一段 JS 状态：真刷新的话两者都会露馅
  const navEntries = await page.evaluate(() => performance.getEntriesByType('navigation').length)
  expect(navEntries).toBe(1)
  await page.evaluate(() => {
    ;(window as unknown as { __kb?: string }).__kb = 'alive'
  })

  const before = await page.evaluate(() => history.length)
  await page.keyboard.press('Enter')

  // URL 变成链接目标，页面渲染出第二篇（前端路由换的是 RouterView）
  await expect(page).toHaveURL(new RegExp(`/post/${BODY_LINK_KEY}$`))
  await expect(page.locator('.doc-title')).toHaveText(SECOND_ARTICLE.title as string)
  await expect(page.locator('[data-testid="md-body"]')).toBeVisible()

  // 没有整页刷新：导航条目还是 1 条，页面里的 JS 状态还在
  expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1)
  expect(await page.evaluate(() => (window as unknown as { __kb?: string }).__kb)).toBe('alive')
  // 一次回车只加一条历史（原生激活 + 手柄确认没有双触发）
  expect((await page.evaluate(() => history.length)) - before).toBe(1)
})

/* ────────────── 文章页：TAB 遍历（产品真 bug，预期失败） ────────────── */

test('文章页：TAB 严格按 DOM 顺序遍历（芯片 → 操作条 → 正文链接），Shift+TAB 反向，落点自动滚进视野', async ({
  page,
}) => {
  // 预期失败：这不是用例写错，是产品真 bug（现象 / 最小复现 / 源码 / 根因）——
  // · 现象：文章页连按 TAB，焦点永远停在第一个落点（第一枚芯片），到不了操作条与正文链接；
  //   每次按键的焦点轨迹都是 `out:app → in:chip-group-0`。
  // · 最小复现：打开任意 `/post/:key` → TAB → TAB，`document.activeElement` 两次都是第一枚芯片。
  // · 源码：`src/views/PostDetailView.vue:177` —— onPad 里在分支之前对**每一个**动作都调
  //   `dropNativeFocus()`（同文件 161-171 定义），于是 TAB 也被算作「我们自己的焦点动了」，
  //   经 `src/input/index.ts:25` 的 `focusShellRoot()` 把焦点收回外壳根节点 `.app`。
  // · 根因：`.app.focus()` 会把浏览器的「顺序焦点导航起点」挪到 `.app`，
  //   下一次 TAB 只能从文档里第一个可聚焦项重新开始。`App.vue:300-307` 的口径恰恰相反 ——
  //   文章页没有标签栏，TAB 应当**还给浏览器**按 DOM 顺序遍历。
  // · 为什么样机能过：样机 `scenes/ArticleScene.vue` 的 dropNativeFocus 用 `blur()`
  //   （焦点落到 body），而 body 不会挪动这个起点；实测 blur() 之后 TAB 能正常走到第二枚芯片。
  // · **已修（2026-10-01，架构 §32.3）**：`tabNext` / `tabPrev` 在 `dropNativeFocus()` 之前
  //   直接让路返回，不再把 `.app` 重新聚焦一次。这条用例因此从「预期失败」转正 ——
  //   现在它真的在守「TAB 按 DOM 顺序遍历」这条样机冻结的口径。

  await openArticle(page)

  // 期望序列：先由 DOM 算出来（文章范围内的可聚焦项，文档顺序）
  const expected = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.article button, .article a[href]')).map(
      (el) =>
        el.dataset.testid || el.getAttribute('href') || (el.textContent ?? '').trim().slice(0, 12),
    ),
  )
  // 夹具保证这条断言不是空转：芯片 + 操作条 + 两个正文链接
  expect(expected.length).toBeGreaterThanOrEqual(7)

  const walked: { sel: string; inView: boolean }[] = []
  for (let i = 0; i < expected.length; i++) {
    await page.keyboard.press('Tab')
    walked.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body) return { sel: '(body)', inView: false }
        const sel =
          el.dataset.testid || el.getAttribute('href') || (el.textContent ?? '').trim().slice(0, 12)
        const cup = (document.querySelector('.screen-inner') as HTMLElement).getBoundingClientRect()
        const box = el.getBoundingClientRect()
        return { sel, inView: box.top >= cup.top - 1 && box.bottom <= cup.bottom + 1 }
      }),
    )
  }

  // ① 顺序与 DOM 一致（TAB 第 2 下就应该到第二枚芯片）
  expect(walked.map((s) => s.sel)).toEqual(expected)
  // ② 每个落点都看得见（前 N 个落点里最后一个在屏幕下方，浏览器应已自动滚进视野）
  expect(walked.every((s) => s.inView)).toBe(true)
  // ③ Shift+TAB 反向回到上一个落点
  await page.keyboard.press('Shift+Tab')
  const back = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return '(body)'
    return (
      el.dataset.testid || el.getAttribute('href') || (el.textContent ?? '').trim().slice(0, 12)
    )
  })
  expect(back).toBe(expected[expected.length - 2])
})

import { expect, test, type Page } from '@playwright/test'

import { booted, press } from './helpers'

/**
 * 文章列表（`/posts`）的「浏览状态」用例：分页 / 跳页 / 筛选写 URL / 返回后不丢状态。
 *
 * 为什么单独开一个文件：这些交互在样机里已经冻结 ——
 * `design/icespark-prototype/e2e/round5.mjs` 的 ③（分组筛选写 URL）与 ⑥（跳页、越界收敛、
 * 跳页框吃 ESC）、`smoke.mjs` 的「PgDn 翻页 / 返回后回到第 1 页（浏览状态保留）/ 纯鼠标翻页」；
 * 生产版源码（`src/views/PostListView.vue` + `src/scene/nav.ts`）也已经实现，
 * 但 `e2e/` 下零覆盖：`pages.spec.ts` 只验到「列表页在、筛选写在 URL 里」这一层，
 * 翻页 / 跳页 / 返回后保留页码没人钉。
 *
 * 三条自我约束与同目录既有 spec 同源（`write.spec.ts` 的文件头把理由写全了）：
 *
 * 1. **不依赖真账号密码**：登录态靠 `page.addInitScript` 写的三把键
 *    （`synthspark-token` 假令牌 + `synthspark-icespark-user` + `synthspark-icespark-sound-prompt`），
 *    并且 `GET /api/auth/me` 必须打桩 —— 假令牌打真接口只会 401，
 *    外壳挂载时的 `bootstrapAuth()` 会因此登出（本轮用不到登录态，但保持与既有 spec 同一套底座）。
 * 2. **不依赖后端有数据**：文章 / 分组 / 标签 / 详情全部用夹具。夹具按「默认每页 4 篇」造 6 篇，
 *    于是「第 2 页独有」的那篇标题只在第 2 页出现 —— 页码与内容是同一次断言的两面。
 * 3. **开机自检先让位**：每次 `goto` 之后 `await booted(page)`（见 helpers.ts）。
 *
 * 桩只盖住这一页真要调的接口：`/api/posts/`（列表 + 详情）、`/api/groups/`、`/api/tags/`、
 * `/api/comments/*`、`/api/auth/me`。其余 `/api/**`（站点配置、统计…）不拦，直接放给真后端 ——
 * 本文件既不读也不断言它们，接口挂了页面照旧回退内置默认（`stores/site.ts` 的口径），
 * 与 `write.spec.ts` 的取舍一致。
 *
 * 手法上注意两点：
 * - Playwright 里多条同时命中的 `route` 只有**最后注册**的那条生效，所以下面用**单条正则
 *   route 内部按 pathname 分派**，不靠注册顺序。
 * - 浏览器地址栏是浏览状态的唯一来源（`scene/nav.ts` 的 `goPosts()` 把 group/tag/page 写进 query，
 *   且第 1 页**不写** `page` 参数），所以断言一律先读 URL、再读画面。
 *
 * ⚠️ 有三条用例曾经标着 `test.fail(...)`：它们钉的是写用例时发现的**生产版真实缺陷**
 * （不是夹具写错），各自用例上方写了现象 / 最小复现 / 源码行号。修好之后 Playwright 会把它们
 * 报成「预期失败却通过了」—— 2026-10-01 这三条真的翻红了（三条缺陷已修，见架构 §32），
 * 于是删掉 `test.fail` 转正：它们现在是**正常的回归断言**。
 */

/* ────────────── 夹具 ────────────── */

const USER = { id: 'u-1', username: 'e2e_reader', display_name: '测试读者', is_superuser: false }

/** 分组行：`全部分组` 之外还有两枚，`→` 一次就能从第 0 项走到「技术」 */
const GROUPS = [
  {
    id: 'g-1',
    name: '技术',
    description: null,
    icon: null,
    sort_order: 1,
    post_count: 3,
    created_at: '2026-09-01T10:00:00',
    updated_at: '2026-09-01T10:00:00',
  },
  {
    id: 'g-2',
    name: '随笔',
    description: null,
    icon: null,
    sort_order: 2,
    post_count: 3,
    created_at: '2026-09-02T10:00:00',
    updated_at: '2026-09-02T10:00:00',
  },
]

/**
 * 标签行：store 按 `post_count` 倒序排（`stores/content.ts` 的 `loadTags`），
 * 所以这里给三个**互不相同**的篇数，`T` + `→` 落到哪一枚就是确定的「草图」。
 */
const TAGS = [
  {
    id: 't-1',
    name: '草图',
    description: null,
    color: null,
    post_count: 3,
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
  {
    id: 't-3',
    name: '随笔',
    description: null,
    color: null,
    post_count: 1,
    created_at: '2026-09-01T10:00:00',
  },
]

/** 一条列表项：字段按契约 `PostListItem` 给全；`slug` 决定 `/post/<key>` 的地址 */
function listItem(id: string, slug: string, title: string, group: string, tags: string[]) {
  return {
    id,
    title,
    slug,
    introduction: `${title} 的摘要。`,
    cover_image: null,
    status: 'published',
    author_id: USER.id,
    author_name: USER.display_name,
    author_username: USER.username,
    author_avatar: null,
    author_type: 'user',
    tags,
    group_id: group === '技术' ? 'g-1' : 'g-2',
    group_name: group,
    view_count: 7,
    like_count: 3,
    created_at: '2026-09-01T10:00:00',
    updated_at: '2026-09-01T10:00:00',
    published_at: '2026-09-01T10:00:00',
  }
}

/**
 * 六篇：默认每页 4 篇（`config/prefs.ts` 的 `pageSize`）→ 正好两页，
 * 且两页内容**互不重叠**，页码一眼可辨：
 * · 第 1 页 = p-1 … p-4（`PAGE1_ONLY` 只在这里）
 * · 第 2 页 = p-5 / p-6（`PAGE2_ONLY` 只在这里）
 * 分组/标签的分布也刻意错开：筛「技术」= 3 篇、筛「草图」= 3 篇且**不含** `ONLY_TYPESET`。
 */
const POSTS = [
  listItem('p-1', 'slug-1', '技术一号：草图标签', '技术', ['草图']),
  listItem('p-2', 'slug-2', '技术二号：只有排版', '技术', ['排版']),
  listItem('p-3', 'slug-3', '技术三号：草图与排版', '技术', ['草图', '排版']),
  listItem('p-4', 'slug-4', '随笔一号：草图标签', '随笔', ['草图']),
  listItem('p-5', 'slug-5', '随笔二号：只有排版', '随笔', ['排版']),
  listItem('p-6', 'slug-6', '第二页专属：末页唯一标题', '随笔', ['随笔']),
]

/** 只出现在第 1 页的标题 */
const PAGE1_ONLY = '技术一号：草图标签'
/** 只出现在第 2 页的标题（翻页的「内容真的换了」就靠它） */
const PAGE2_ONLY = '第二页专属：末页唯一标题'
/** 只带「排版」标签：筛「草图」时它必须不在场 */
const ONLY_TYPESET = '技术二号：只有排版'

/** 详情（`/api/posts/{id}` 与 `/api/posts/slug/{slug}` 都回它）：补一段正文，文章页才有东西渲染 */
function detailPost(key: string): Record<string, unknown> {
  const hit = POSTS.find((p) => p.slug === key || p.id === key) ?? POSTS[0]
  return { ...hit, content: '# 正文\n\n这一段是夹具正文。' }
}

/* ────────────── 桩 ────────────── */

/**
 * 登录态 + 内容接口打桩。在 `beforeEach` 里调，早于用例里的任何 `goto`。
 *
 * 为什么 `addInitScript` 必须在这里而不是用例中间：它要赶在页面脚本之前写 localStorage，
 * 而 `prefs.ts` / `stores/auth.ts` 都是在模块加载时就把这些键读进 ref 的。
 */
async function stubApi(page: Page): Promise<void> {
  await page.addInitScript((user) => {
    // 音效询问框不弹（它是外壳级模态，会和这一页的按键路径抢焦点）
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
    localStorage.setItem('synthspark-token', 'e2e-token')
    localStorage.setItem('synthspark-icespark-user', JSON.stringify(user))
  }, USER)

  // 单条正则 + 内部按 pathname 分派（多条 route 同时命中只有最后注册的生效，见文件头）。
  // 正则只圈住本文件要打桩的几组接口：写成 `/\/api\//` 的话，dev 下的模块请求
  // （`/src/api/posts.ts` 这类）也会被这条 route 收进来，白白多绕一道。
  await page.route(/\/api\/(auth|comments|groups|posts|tags)\//, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    // 只读接口：本文件不涉及任何写操作，其余方法一律放行（放了也没人发）
    if (request.method() !== 'GET') return route.fallback()

    if (path === '/api/posts/') return json({ items: POSTS, total: POSTS.length })
    if (path === '/api/groups/') return json(GROUPS)
    if (path === '/api/tags/') return json(TAGS)
    if (path === '/api/auth/me') return json(USER)
    if (path.startsWith('/api/comments/')) return json({ comments: [], total: 0 })
    // 详情：`/api/posts/slug/{slug}` 与 `/api/posts/{id}` 两个形状都吃
    if (path.startsWith('/api/posts/'))
      return json(
        detailPost(decodeURIComponent(path.slice('/api/posts/'.length)).replace(/^slug\//, '')),
      )

    return route.fallback()
  })
}

/* ────────────── 助手 ────────────── */

/** 地址栏里当前生效的查询参数 —— 「浏览状态唯一来源是地址栏」的读法 */
function view(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams
}

/** 页脚那一行 `PAGE x / y` */
function pager(page: Page) {
  return page.locator('.pcount')
}

/** 当前渲染出来的卡片标题（按栅格顺序） */
function titles(page: Page): Promise<string[]> {
  return page.locator('[data-testid="post-card"] .card-title').allInnerTexts()
}

/**
 * 落在列表页：等开机自检播完（否则第一下按键会被自检吃掉），
 * 再等卡片真的渲染出来 —— `booted()` 只管自检，不管内容接口（夹具是异步回来的）。
 */
async function openList(page: Page, path = '/posts'): Promise<void> {
  await page.goto(path)
  await booted(page)
  await expect(page.locator('[data-testid="post-grid"]')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await stubApi(page)
})

/* ────────────── 分页 ────────────── */

test('文章列表：分页写 URL —— PgDn 到第 2 页带 page=2，PgUp 回第 1 页并抹掉参数', async ({
  page,
}) => {
  await openList(page)

  // 默认第 1 页：页码在内部是 0 起的，地址栏里**不该**出现 page=1（`nav.ts` 的 `page > 1` 才写）
  await expect(pager(page)).toHaveText('PAGE 1 / 2')
  expect(view(page).has('page'), '第 1 页不该写 page 参数').toBe(false)
  // 第一页上「上一页」是禁用的（到头了不是报错）
  await expect(page.locator('[data-testid="pager-prev"]')).toBeDisabled()
  await expect(page.locator('[data-testid="pager-next"]')).toBeEnabled()
  expect(await titles(page)).toContain(PAGE1_ONLY)
  expect(await titles(page)).not.toContain(PAGE2_ONLY)

  // PgDn → 第 2 页：URL 与内容同时跟着走（内容真的换了才算翻页，不只是写了个参数）
  await page.keyboard.press('PageDown')
  await expect(page).toHaveURL(/[?&]page=2/)
  await expect(pager(page)).toHaveText('PAGE 2 / 2')
  await expect(page.locator('[data-testid="pager-next"]')).toBeDisabled()
  expect(await titles(page)).toContain(PAGE2_ONLY)
  expect(await titles(page)).not.toContain(PAGE1_ONLY)

  // PgUp → 回第 1 页：参数是被**去掉**（不是写成 page=1），内容也回来
  await press(page, 'PageUp')
  await expect(page).toHaveURL((url) => !url.searchParams.has('page'))
  await expect(pager(page)).toHaveText('PAGE 1 / 2')
  expect(await titles(page)).toContain(PAGE1_ONLY)
  expect(await titles(page)).not.toContain(PAGE2_ONLY)
})

/* ────────────── 跳页 ────────────── */

test('文章列表：J 跳页 —— 输页码回车即达，越界收敛到最后一页', async ({ page }) => {
  await openList(page)

  // J 打开跳页框：输入框自动拿到焦点并全选（`openJump()` 的 nextTick），直接打字就能替换
  await page.keyboard.press('j')
  const input = page.locator('[data-testid="jump-input"]')
  await expect(input).toBeVisible()
  await expect(input).toBeFocused()

  // 越界页码（99 > 2 页）：收敛到最后一页，不越界、不报错、不留 page=99
  await input.fill('99')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/[?&]page=2/)
  await expect(pager(page)).toHaveText('PAGE 2 / 2')
  expect(await titles(page)).toContain(PAGE2_ONLY)
  await expect(input).toHaveCount(0) // 提交即关框

  // 跳回第 1 页：参数消失。这一趟从 `?page=2` 深链接进来 ——
  // 顺手证明「URL 是唯一真相」：不带任何操作，地址栏里的 page=2 就该落在第 2 页
  await openList(page, '/posts?page=2')
  await expect(pager(page)).toHaveText('PAGE 2 / 2')
  await press(page, 'j')
  await page.locator('[data-testid="jump-input"]').fill('1')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL((url) => !url.searchParams.has('page'))
  await expect(pager(page)).toHaveText('PAGE 1 / 2')

  // 跳页框的鼠标路径：`pager-jump` 开框 + `jump-go` 提交（与 J / 回车等价，样机也验了这一对）
  await page.click('[data-testid="pager-jump"]')
  await expect(page.locator('[data-testid="jump-input"]')).toBeVisible()
  await page.locator('[data-testid="jump-input"]').fill('2')
  await page.click('[data-testid="jump-go"]')
  await expect(page).toHaveURL(/[?&]page=2/)
  await expect(pager(page)).toHaveText('PAGE 2 / 2')
})

/* ────────────── 预期失败：跳页交互上生产版的缺陷（勿删标记，修好再转正） ────────────── */

test('文章列表：跳页框里 ESC 只关框、不开暂停菜单', async ({ page }) => {
  /**
   * 样机冻结口径：`design/icespark-prototype/e2e/round5.mjs:144-150` ——
   * 跳页框里按**一下** ESC，框关掉，且不许叠出暂停菜单。
   *
   * 生产版只做到一半：输入层把编辑框里的 ESC 一律当成「先失焦」
   * （`src/input/index.ts:49-53`，2026-09-30 用户裁定「第一下 ESC = 失焦」），
   * 于是场景里那段「跳页框这种局部临时状态才吃掉 ESC」
   * （`src/views/PostListView.vue:337-344` 的 `if (jumpOpen.value) closeJump()`）**这一下根本收不到** ——
   * 实测第一下 ESC 只把焦点交回外壳（`.app` 拿到焦点），框还开着；要按第二下才关。
   *
   * 最小复现：/posts → 按 J → 按一下 ESC → 跳页框仍在（期望：框关掉）。
   *
   * **已修（2026-10-01，架构 §32.1）**：跳页输入框自己挂 `@keydown.esc.stop="closeJump"`
   * —— 一个临时小框不该套用「正文编辑器」的失焦语义，照 `TextEditorDialog` 的先例走局部规则。
   */

  await openList(page)
  await page.keyboard.press('j')
  const input = page.locator('[data-testid="jump-input"]')
  await expect(input).toBeVisible()

  await page.keyboard.press('Escape')
  // 同一件事的两面：不许开菜单（现状成立）+ 框要关掉（现状不成立 → 这条会失败）
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
  await expect(input).toHaveCount(0)
})

test('文章列表：跳页回车之后键盘还活着（PgUp 仍能翻页）', async ({ page }) => {
  /**
   * 现象：在跳页框里按回车跳页之后，PgUp / PgDn / J / G **全都不响** ——
   * 键盘用户跳一次页就「死」了，必须再点一下鼠标才能继续；触屏上则彻底卡在第 2 页。
   *
   * 最小复现：/posts → 按 J → 输 2 → 回车（确实到了第 2 页）→ 按 PgUp（期望回第 1 页，实际毫无反应）。
   *
   * 根因（读源码）：`PostListView.vue:205-218` 的 `submitJump()` 先 `closeJump()`，
   * 而 `jumpOpen` 一置假，模板里那个 `v-if="jumpOpen"` 的 `<input id="jump-input">`
   * （`PostListView.vue:590-605`）当场卸载 —— 它此刻正持有 DOM 焦点，浏览器于是把焦点丢回 `<body>`。
   * 而外壳的键盘监听挂在 `.app` 根节点上（`src/input/index.ts:82`），body 上的 keydown
   * 不会经过它，`dispatchPadAction` 自然一次都不跑。这恰是 `input/index.ts:18-21` 与
   * `focusShellRoot()`（同文件 25-27 行）反复警告的那个坑：**焦点掉到 body = 整块键盘失灵**。
   *
   * **已修（架构 §32.2）**：输入层加了统一兜底 —— `focusout`（捕获）后推迟一个 tick 判断
   * 「原持有焦点的节点已不在文档里 + 焦点空在 body 上」，成立就把焦点收回外壳根节点。
   * 显式的 `focusShellRoot()` 调用照旧保留（它们更早、语义更具体）。
   */

  await openList(page)
  await page.keyboard.press('j')
  await page.locator('[data-testid="jump-input"]').fill('2')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/[?&]page=2/) // 跳页本身是成功的

  // 接着按 PgUp：期望回到第 1 页（page 参数被抹掉）—— 现在按下去毫无反应
  await press(page, 'PageUp')
  await expect(page).toHaveURL((url) => !url.searchParams.has('page'))
  await expect(pager(page)).toHaveText('PAGE 1 / 2')
})

test('文章列表：点「清除」之后键盘还活着（PgDn 仍能翻页）', async ({ page }) => {
  /**
   * 现象：用鼠标点场景头部那颗「✕ 清除」清掉筛选之后，PgDn / G / J **全都不响** ——
   * 鼠标点一下清除，键盘就跟着报废，得再点一下空白处才回来。
   *
   * 最小复现：/posts → G → → → ENTER（筛「技术」）→ 点 `filter-clear` → 按 PgDn
   * （期望翻到第 2 页，实际毫无反应）。
   *
   * 根因与上一条**同一个**：`filter-clear` 是 `v-if="activeFilterLabel"` 渲染的
   * （`src/views/PostListView.vue:427-430`），点它 → 清除生效 → 它自己当场卸载 ——
   * 而鼠标点在这颗 `<button>` 上时浏览器刚把 DOM 焦点给了它，元素一没，
   * 焦点就掉回 `<body>`，外壳挂在 `.app` 上的 keydown 监听（`src/input/index.ts:82`）
   * 再也收不到任何按键（`input/index.ts:18-21` 警告的就是这个）。
   *
   * 所以这是**一类**缺陷：凡是「被卸载的元素正好持有焦点」都会让整块键盘失灵
   * （跳页框、这颗清除按钮都是）。修复应当落在焦点的兜底上
   * （卸载后 `focusShellRoot()`，或在输入层统一兜住 `activeElement === body`），
   * 只补跳页框那一处的话，这条用例仍然会红 —— 所以修的是输入层的统一兜底（架构 §32.2），
   * 而不是某几个调用点。
   */

  await openList(page)
  // 先落一个筛选，让清除按钮出现
  await page.keyboard.press('g')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect.poll(() => view(page).get('group')).toBe('技术')

  // 鼠标点清除：筛选确实清了（URL 干净、卡片回到 4 张）—— 这一步本身是对的
  await page.click('[data-testid="filter-clear"]')
  await expect(page).toHaveURL((url) => url.search === '')
  await expect(page.locator('[data-testid="post-card"]')).toHaveCount(4)

  // 清除之后键盘应当照常可用：6 篇 / 每页 4 篇 → PgDn 该翻到第 2 页
  await press(page, 'PageDown')
  await expect(page).toHaveURL(/[?&]page=2/)
  await expect(pager(page)).toHaveText('PAGE 2 / 2')
})

/* ────────────── 筛选 ────────────── */

test('文章列表：G / → / ENTER 按分组筛选写进 URL，清除后回到无筛选', async ({ page }) => {
  await openList(page)

  // G 直达分组行首项「全部分组」（用户第 3 条：分组要用快捷键一键够到，不必拿方向键蹭上去）
  await press(page, 'g')
  await expect(page.locator('[data-testid="group-row"] .is-focused')).toHaveAttribute(
    'data-testid',
    'group-all',
  )

  // → 移到第二枚（夹具里是「技术」）：行内高亮跟着走
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="group-row"] .is-focused')).toHaveAttribute(
    'data-testid',
    'group-技术',
  )

  // ENTER 落地筛选：URL 带上分组，且卡片确实同属该分组
  await page.keyboard.press('Enter')
  await expect.poll(() => view(page).get('group')).toBe('技术')
  await expect(page.locator('[data-testid="group-row"] .fchip.on')).toContainText('技术')
  // 卡片自己在页脚印分组名（无封面卡还会多印一处 `.card-group`），逐张核对
  expect(await page.locator('[data-testid="post-card"] .tag').allInnerTexts()).toEqual([
    '技术',
    '技术',
    '技术',
  ])
  expect(await titles(page)).toEqual([
    '技术一号：草图标签',
    '技术二号：只有排版',
    '技术三号：草图与排版',
  ])
  // 筛掉之后总数与页数跟着重算：3 篇 → 1 页（不是还停在「共 6 篇 / 2 页」）
  await expect(page.locator('.range')).toContainText('共 1-3 / 3')
  await expect(pager(page)).toHaveText('PAGE 1 / 1')

  // 清除筛选（`filter-clear` 只在有筛选时才渲染）→ 回到无筛选：URL 干净、卡片回来、按钮消失
  await page.click('[data-testid="filter-clear"]')
  await expect(page).toHaveURL((url) => url.search === '')
  await expect(page.locator('[data-testid="post-card"]')).toHaveCount(4)
  await expect(page.locator('[data-testid="filter-clear"]')).toHaveCount(0)
})

test('文章列表：T / → / ENTER 按标签筛选，卡片确实同属该标签', async ({ page }) => {
  await openList(page)

  // T 直达标签行首项，→ 到「草图」（夹具按篇数倒序，第一枚是它）
  await press(page, 't')
  await expect(page.locator('[data-testid="tag-row"] .is-focused')).toHaveAttribute(
    'data-testid',
    'tag-all',
  )
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="tag-row"] .is-focused')).toHaveAttribute(
    'data-testid',
    'tag-草图',
  )
  await page.keyboard.press('Enter')

  await expect.poll(() => view(page).get('tag')).toBe('草图')
  await expect(page.locator('[data-testid="tag-row"] .fchip.on')).toContainText('#草图')
  /*
   * 卡片上**不印标签**（列表卡只有标题 / 摘要 / 分组名），所以这里反过来证明归属：
   * 夹具里带「草图」的是 p-1 / p-3 / p-4 三篇，而只带「排版」的 p-2 必须被筛掉。
   * 篇数 + 排除项两条一起看，才排得掉「没筛但碰巧也是 3 篇」这种假绿。
   */
  await expect(page.locator('[data-testid="post-card"]')).toHaveCount(3)
  expect(await titles(page)).toContain('技术一号：草图标签')
  expect(await titles(page)).toContain('技术三号：草图与排版')
  expect(await titles(page)).toContain('随笔一号：草图标签')
  expect(await titles(page)).not.toContain(ONLY_TYPESET)
  await expect(page.locator('.range')).toContainText('共 1-3 / 3')
})

/* ────────────── 返回后保留浏览状态 ────────────── */

test('文章列表：第 2 页点开文章，Q 返回后仍是第 2 页', async ({ page }) => {
  /*
   * 样机 `smoke.mjs:199-203` 只有一页可翻，验的是「返回后回到第 1 页（浏览状态保留）」；
   * 这里钉的是同一件事的**强形式**：翻到第 2 页再进详情，返回后必须还在第 2 页 ——
   * 因为 `page` 就在地址栏里（`PostListView.vue:78-88` 的注释：浏览状态全部写进 URL，
   * 所以从详情返回时页码与筛选都还在）。
   */
  await openList(page)
  await page.keyboard.press('PageDown')
  await expect(page).toHaveURL(/[?&]page=2/)

  // 点开第 2 页独有的那一篇（鼠标路径；卡片不可聚焦，所以外壳焦点不会被抢走）
  await page.getByTestId('post-card').filter({ hasText: PAGE2_ONLY }).click()
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'article')
  await expect(page).toHaveURL(/\/post\/slug-6$/)

  // Q（历史后退）回列表：页码与内容都必须是第 2 页那一套
  await press(page, 'q')
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'posts')
  await expect.poll(() => view(page).get('page')).toBe('2')
  await expect(pager(page)).toHaveText('PAGE 2 / 2')
  expect(await titles(page)).toContain(PAGE2_ONLY)
  expect(await titles(page)).not.toContain(PAGE1_ONLY)
})

/* ────────────── 纯鼠标 ────────────── */

test('文章列表：纯鼠标也能翻页 —— 点 pager-next 翻页且 URL 跟上', async ({ page }) => {
  // 全程一次键盘都不按（本用例里没有 keyboard.*，也没有 fill）
  await openList(page)

  await page.click('[data-testid="pager-next"]')
  await expect(page).toHaveURL(/[?&]page=2/)
  await expect(pager(page)).toHaveText('PAGE 2 / 2')
  expect(await titles(page)).toContain(PAGE2_ONLY)

  // 页码点（page-dot-1）回第 1 页：这一下走 page.mouse 的原始坐标，证明不依赖 click 的封装
  const dot = (await page.locator('[data-testid="page-dot-1"]').boundingBox())!
  await page.mouse.click(dot.x + dot.width / 2, dot.y + dot.height / 2)
  await expect(page).toHaveURL((url) => !url.searchParams.has('page'))
  await expect(pager(page)).toHaveText('PAGE 1 / 2')

  // 再翻过去、用「上一页」按钮回来：三颗鼠标控件都钉住
  await page.click('[data-testid="pager-next"]')
  await expect(pager(page)).toHaveText('PAGE 2 / 2')
  await page.click('[data-testid="pager-prev"]')
  await expect(page).toHaveURL((url) => !url.searchParams.has('page'))
  await expect(pager(page)).toHaveText('PAGE 1 / 2')
})

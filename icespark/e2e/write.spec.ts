import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { booted } from './helpers'

/**
 * P6 写作页（`/write`）的用例（架构 §28.8 的验收口径）。
 *
 * 三条自我约束与既有 spec 同源（`admin-links.spec.ts` 的注释把理由写全了）：
 *
 * 1. **不依赖真账号密码**：登录态靠 `page.addInitScript` 写的两把键
 *    （`synthspark-token` + `synthspark-icespark-user`），并且 `GET /api/auth/me`
 *    必须打桩 —— 假令牌打真接口只会 401，外壳挂载时的 `bootstrapAuth()` 会因此登出。
 * 2. **不依赖后端有数据**：文稿列表 / 分组 / 标签全部用夹具，写接口用记录器接住。
 * 3. **开机自检先让位**：每次 `goto` 之后 `await booted(page)`。
 *
 * 未登录深链接 `/write` 那一条**不在这里重复** —— 它是外壳级鉴权门，钉在
 * `admin-guard.spec.ts` 的「五个路径」那条用例里（`/write` 与四张账号 / 管理页同一条路）。
 *
 * 桩只盖住这一页真要调的接口：`/api/auth/me`、`/api/groups/*`、`/api/posts/*`、`/api/tags/*`。
 * 其余 `/api/**`（站点配置、搜索…）不拦，直接放给真后端 —— 拦了反而要自己造整站配置。
 */

/* ────────────── 夹具 ────────────── */

const USER = { id: 'u-1', username: 'e2e_writer', display_name: '测试作者', is_superuser: false }

/** 两个分组，字段就是契约 `Group` 的全部 */
const GROUPS = [
  {
    id: 'g-1',
    name: '技术',
    description: null,
    icon: null,
    sort_order: 1,
    post_count: 1,
    created_at: '2026-09-01T10:00:00',
    updated_at: '2026-09-01T10:00:00',
  },
  {
    id: 'g-2',
    name: '随笔',
    description: null,
    icon: null,
    sort_order: 2,
    post_count: 0,
    created_at: '2026-09-02T10:00:00',
    updated_at: '2026-09-02T10:00:00',
  },
]

const TAGS = [
  { id: 't-1', name: '草图', description: null, color: null, post_count: 9, created_at: '2026-09-01T10:00:00' },
  { id: 't-2', name: '排版', description: null, color: null, post_count: 5, created_at: '2026-09-01T10:00:00' },
  { id: 't-3', name: '像素', description: null, color: null, post_count: 3, created_at: '2026-09-01T10:00:00' },
  { id: 't-4', name: '像素风', description: null, color: null, post_count: 1, created_at: '2026-09-01T10:00:00' },
]

/** 完整文章模型（`GET /api/posts/{id}` 与 `GET /api/posts/slug/{slug}` 都回它） */
function postModel(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'p-draft',
    title: '草稿一篇',
    content: '# 草稿\n\n正文还很少。',
    introduction: null,
    cover_image: null,
    status: 'draft',
    slug: 'draft-one',
    author_id: USER.id,
    author_name: USER.display_name,
    author_username: USER.username,
    author_avatar: null,
    author_type: 'user',
    tags: ['像素'],
    group_id: 'g-1',
    group_name: '技术',
    view_count: 0,
    created_at: '2026-09-20T10:00:00',
    updated_at: '2026-09-20T10:00:00',
    published_at: null,
    ...over,
  }
}

/** 列表项（`GET /api/posts/my` 只回 `PostListItem`，**没有 content**） */
function listItem(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const full = postModel(over)
  const { content: _content, introduction: _intro, ...rest } = full as Record<string, unknown>
  return { ...rest, like_count: 0 }
}

const MY_POSTS = [
  listItem({ id: 'p-draft', title: '草稿一篇', slug: 'draft-one', status: 'draft', group_id: 'g-1', group_name: '技术' }),
  listItem({
    id: 'p-pub',
    title: '已发布一篇',
    slug: 'pub-one',
    status: 'published',
    group_id: 'g-1',
    group_name: '技术',
    published_at: '2026-09-18T10:00:00',
  }),
]

/* ────────────── 桩 ────────────── */

interface WriteRecord {
  method: string
  path: string
  body: unknown
}

interface Recorder {
  /** 发出去的写请求（method / pathname / JSON body），断言请求体用 */
  writes: WriteRecord[]
  /** `GET /api/posts/my` 调了几次 —— 切面板不该重新拉列表 */
  myCount: () => number
}

async function stubApi(page: Page): Promise<Recorder> {
  const writes: WriteRecord[] = []
  let myGets = 0
  /** 造出来的稿子：`POST` 之后按 slug / id 再取详情时要还同一份（真后端就是如此） */
  const created = new Map<string, Record<string, unknown>>()

  await page.addInitScript((u) => {
    // 音效询问框不弹（它是外壳级模态，会和这一页的按键路径抢焦点）
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
    localStorage.setItem('synthspark-token', 'e2e-token')
    localStorage.setItem('synthspark-icespark-user', JSON.stringify(u))
  }, USER)

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }),
  )

  // 一条正则盖住这一页的四组接口：分组（读 / 建）、我的文章、文章增删改查、标签。
  // 用单条 handler 内部按 pathname 分派，而不是注册多条 route —— Playwright 里
  // 多条同时命中时只有**最后注册**的那条生效，顺序很容易被后来的改动踩翻。
  await page.route(/\/api\/(groups|posts|tags)\//, async (route) => {
    const request = route.request()
    const method = request.method()
    const path = new URL(request.url()).pathname
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    /** 按 id 或 slug 取详情：先看造出来的那篇，落回夹具 */
    const detail = (key: string): Record<string, unknown> => {
      const hit = created.get(key)
      if (hit) return hit
      if (key === 'p-pub' || key === 'pub-one') {
        return postModel({ id: 'p-pub', title: '已发布一篇', slug: 'pub-one', status: 'published' })
      }
      return postModel()
    }

    // ── 读 ──
    if (method === 'GET') {
      if (path === '/api/groups/') return json(200, GROUPS)
      if (path === '/api/tags/') return json(200, TAGS)
      if (path === '/api/posts/my') {
        myGets += 1
        return json(200, { items: MY_POSTS, total: MY_POSTS.length })
      }
      if (path.startsWith('/api/posts/slug/')) {
        return json(200, detail(decodeURIComponent(path.slice('/api/posts/slug/'.length))))
      }
      if (path.startsWith('/api/posts/')) {
        return json(200, detail(decodeURIComponent(path.slice('/api/posts/'.length))))
      }
      return route.fallback()
    }

    // ── 写 ──
    const raw = request.postData()
    const body: unknown = raw ? (JSON.parse(raw) as unknown) : null
    writes.push({ method, path, body })

    if (method === 'POST' && path === '/api/groups/') {
      const name = (body as { name?: string })?.name ?? '新分组'
      return json(201, { ...GROUPS[1], id: 'g-9', name, sort_order: 9 })
    }
    if (method === 'POST' && path === '/api/posts/') {
      const saved = postModel({ ...(body as object), id: 'p-new', slug: 'brand-new' })
      created.set('p-new', saved)
      created.set('brand-new', saved)
      return json(201, saved)
    }
    if (method === 'PUT' && path.startsWith('/api/posts/')) {
      const id = decodeURIComponent(path.slice('/api/posts/'.length))
      const saved = postModel({ ...(body as object), id, slug: 'brand-new' })
      created.set(id, saved)
      created.set('brand-new', saved)
      return json(200, saved)
    }
    if (method === 'DELETE' && path.startsWith('/api/posts/')) {
      return route.fulfill({ status: 204 })
    }
    return route.fallback()
  })

  return { writes, myCount: () => myGets }
}

/** 登录态 + 夹具就位，停在写作页（新建稿） */
async function openWrite(page: Page): Promise<Recorder> {
  const recorder = await stubApi(page)
  await page.goto('/write')
  await booted(page)
  return recorder
}

/* ────────────── 用例 ────────────── */

test('写作页：登录后深链接直接打开，外壳底栏与页面自带 h1 都到位', async ({ page }) => {
  const recorder = await openWrite(page)

  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  // 路由与场景：写作页没有标签栏，场景由路由决定
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'write')
  await expect(page).toHaveURL(/\/write$/)
  // 站点小字常驻外壳底栏（硬要求 3）：这一页自己不做页脚
  await expect(page.locator('[data-testid="deck"]')).toBeVisible()
  // 页面自带可见一级标题（`write` 在 `SELF_TITLED_SCENES` 里，外壳不发隐藏 h1）
  await expect(page.locator('main h1')).toHaveText('写作台')

  // 新稿：没有任何改动，状态行说的是「未改动」而不是「已保存」
  await expect(page.locator('[data-testid="write-status"]')).toHaveText('未改动')
  await expect(page.locator('[data-testid="write-content"]')).toHaveValue('')
  // 还没落库 → 没有「查看」入口
  await expect(page.locator('[data-testid="write-view"]')).toHaveCount(0)

  expect(recorder.myCount()).toBe(1)
  expect(errors).toEqual([])
})

test('写作页：标题为空点发布不发请求，只给一句提示；填好再存草稿就落库', async ({ page }) => {
  const recorder = await openWrite(page)

  // ── 空标题按发布：一个请求都不许发 ──
  await page.fill('[data-testid="write-content"]', '# 你好\n\n正文。')
  await page.click('[data-testid="write-publish"]')
  await expect(page.locator('.dialog-text')).toContainText('请先给这篇文章起个标题')
  expect(recorder.writes, '标题为空时不该有任何写请求').toEqual([])
  // 提示框是外壳级模态：按键归它，不能穿透到背后的页面
  await expect(page.locator('.app')).toHaveAttribute('data-scope', 'pause')
  await page.keyboard.press('Escape')
  await expect(page.locator('.dialog-text')).toHaveCount(0)

  // ── 填标题 → 存草稿：POST 请求体正确 ──
  await page.fill('[data-testid="write-title"]', '我的草稿')
  await page.click('[data-testid="write-save"]')

  await expect.poll(() => recorder.writes.length, { message: 'POST 应当发出去' }).toBe(1)
  expect(recorder.writes[0]).toMatchObject({ method: 'POST', path: '/api/posts/' })
  expect(recorder.writes[0]?.body).toMatchObject({
    title: '我的草稿',
    content: '# 你好\n\n正文。',
    status: 'draft',
  })

  // 落库后：地址栏换成这一篇，状态行变成「已保存 ……」
  await expect(page).toHaveURL(/\/write\/brand-new$/)
  // 「人按的」这一次：不能写成「已自动保存 …」（两者不是子串关系，正则能分辨）
  await expect(page.locator('[data-testid="write-status"]')).toContainText(/^已保存 \d{2}:\d{2}:\d{2}$/)
  // 存的是草稿 → 「查看」入口仍然不出现（它只给已发布的稿子）
  await expect(page.locator('[data-testid="write-view"]')).toHaveCount(0)
})

test('写作页：发布走一次 PUT（status=published），发布后给「查看」入口', async ({ page }) => {
  const recorder = await openWrite(page)

  await page.fill('[data-testid="write-title"]', '要发布的文章')
  await page.fill('[data-testid="write-content"]', '正文一段。')
  await page.click('[data-testid="write-publish"]')

  // 新稿第一次保存是 POST；这里直接断言它带的是 published
  await expect.poll(() => recorder.writes.length).toBe(1)
  expect(recorder.writes[0]).toMatchObject({ method: 'POST', path: '/api/posts/' })
  expect(recorder.writes[0]?.body).toMatchObject({ status: 'published' })

  // 状态行与动作条都换成「已发布」那一套（按钮文案由 发布 → 更新）
  // 「人按的」这一次：不能写成「已自动保存 …」（两者不是子串关系，正则能分辨）
  await expect(page.locator('[data-testid="write-status"]')).toContainText(/^已保存 \d{2}:\d{2}:\d{2}$/)
  await expect(page.locator('[data-testid="write-publish"]')).toHaveText('更新')

  // D7：发布后**留在写作页**，另给一个「查看」入口
  await expect(page).toHaveURL(/\/write\/brand-new$/)
  const view = page.locator('[data-testid="write-view"]')
  await expect(view).toBeVisible()
  await expect(view).toHaveAttribute('href', '/post/brand-new')

  // 发布之后**不能**再冒出一次自动保存：它会拿本地那份（可能还是旧 status）再推一遍，
  // 把刚发布的文章两秒后打回草稿。这一条就是为那个坑钉的。
  await page.waitForTimeout(2600)
  expect(recorder.writes, '发布之后不该再补一次写').toHaveLength(1)
})

test('写作页：已发布的稿子再改，走的是 PUT 而不是又建一篇', async ({ page }) => {
  const recorder = await openWrite(page)

  // 先发布一篇把它落库
  await page.fill('[data-testid="write-title"]', '第一版')
  await page.click('[data-testid="write-publish"]')
  await expect.poll(() => recorder.writes.length).toBe(1)
  await expect(page).toHaveURL(/\/write\/brand-new$/)

  // 再改一行标题、按「更新」→ 应当是 PUT /api/posts/p-new
  await page.fill('[data-testid="write-title"]', '第二版')
  await page.click('[data-testid="write-publish"]')
  await expect.poll(() => recorder.writes.length).toBe(2)
  expect(recorder.writes[1]).toMatchObject({ method: 'PUT', path: '/api/posts/p-new' })
  expect(recorder.writes[1]?.body).toMatchObject({ title: '第二版', status: 'published' })
})

test('写作页：文稿面板按草稿 / 已发布分节，点一篇就装载进表单', async ({ page }) => {
  const recorder = await openWrite(page)

  await page.click('[data-testid="write-open-docs"]')
  const panel = page.locator('[data-testid="write-panel-docs"]')
  await expect(panel).toBeVisible()

  // 面板开着时告诉外壳「页内模态在台上」：P / ESC 不许穿透（§28 的口径）
  await expect(page.locator('.app')).toHaveAttribute('data-scope', 'scene')

  // 默认停在「文章」分节：只列已发布那一篇
  await expect(panel.locator('[data-testid="write-tab-published"]')).toHaveText(/文章 1/)
  await expect(panel.locator('[data-testid="write-tab-draft"]')).toHaveText(/草稿 1/)
  await expect(panel.locator('[data-testid="write-doc-p-pub"]')).toBeVisible()
  await expect(panel.locator('[data-testid="write-doc-p-draft"]')).toHaveCount(0)

  // 切到「草稿」分节 → 换成草稿那一篇
  await page.click('[data-testid="write-tab-draft"]')
  await expect(panel.locator('[data-testid="write-doc-p-draft"]')).toBeVisible()
  await expect(panel.locator('[data-testid="write-doc-p-pub"]')).toHaveCount(0)

  // 点它 → 关面板 + URL 换成它的 slug + 表单被填上
  await page.click('[data-testid="write-doc-p-draft"]')
  await expect(panel).toHaveCount(0)
  await expect(page).toHaveURL(/\/write\/draft-one$/)
  await expect(page.locator('[data-testid="write-title"]')).toHaveValue('草稿一篇')
  await expect(page.locator('[data-testid="write-content"]')).toHaveValue('# 草稿\n\n正文还很少。')

  // 切面板不该重新拉一遍我的文章
  expect(recorder.myCount()).toBe(1)
})

test('写作页：纯键盘 —— Tab 出正文到插入条、Enter 插入记法、N 开面板、方向键选稿', async ({
  page,
}) => {
  await openWrite(page)

  // 新稿会把光标放到标题上（标题空）；先写标题，再进正文
  await page.fill('[data-testid="write-title"]', '键盘一篇')
  await page.click('[data-testid="write-content"]')
  await expect(page.locator('[data-testid="write-content"]')).toBeFocused()

  // Tab 出正文：落点是插入条第一颗按钮（不是页面末尾那两个隐藏文件框）
  await page.keyboard.press('Tab')
  await expect(page.locator('[data-tool="bold"]')).toBeFocused()

  // Enter 走浏览器原生激活（内核把回车还给真实按钮）→ 插入粗体记号并选中占位文字
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="write-content"]')).toHaveValue('**粗体**')
  // 插完把焦点交回正文（接着打字就替换掉占位）—— 这是插入条能用的关键手感
  await expect(page.locator('[data-testid="write-content"]')).toBeFocused()

  // 再 Tab 出正文 → N 开文稿面板（焦点在正文里时要用 Shift+N，见下一条用例；这里走 Tab 这条路）
  await page.keyboard.press('Tab')
  await expect(page.locator('[data-tool="bold"]')).toBeFocused()
  await page.keyboard.press('n')
  const panel = page.locator('[data-testid="write-panel-docs"]')
  await expect(panel).toBeVisible()

  // 焦点环：第 0 格是「＋ 新建文章」，↓ 走到第一篇
  await expect(panel.locator('[data-testid="write-doc-new"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowDown')
  await expect(panel.locator('[data-testid="write-doc-p-pub"]')).toHaveClass(/is-focused/)

  // Enter 选中 → 关面板 + URL 换成它的 slug
  await page.keyboard.press('Enter')
  await expect(panel).toHaveCount(0)
  await expect(page).toHaveURL(/\/write\/pub-one$/)
  await expect(page.locator('[data-testid="write-title"]')).toHaveValue('已发布一篇')

  // M 开资料面板。选中一篇之后焦点落在正文里（`fill()` 的既定行为：接着写字），
  // 而焦点在可编辑目标里时面板键要加 Shift 才响 —— 先 Tab 出正文，和上面 N 那一步同一条路。
  await page.keyboard.press('Tab')
  await expect(page.locator('[data-tool="bold"]')).toBeFocused()
  await page.keyboard.press('m')
  const meta = page.locator('[data-testid="write-panel-meta"]')
  await expect(meta).toBeVisible()
  await expect(meta.locator('[data-testid="write-act-0"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowRight')
  await expect(meta.locator('[data-testid="write-act-1"]')).toHaveClass(/is-focused/)

  // ESC 关面板（页内模态自己消费；外壳这一层已经让位，不吃就是死键）
  await page.keyboard.press('Escape')
  await expect(meta).toHaveCount(0)
  await expect(page.locator('.app')).toHaveAttribute('data-scope', 'scene')
})

test('写作页：正文里 ESC 先失焦、再起菜单，面板开着时 P 不叠二层菜单', async ({ page }) => {
  await openWrite(page)

  // 第一下 ESC = 失焦（2026-09-30 用户裁定）：焦点交回外壳根节点，菜单还不许出来。
  // 断言的是 `.app` 拿到焦点 —— 掉到 body 就整块键盘失灵（内核注释里那条坑）
  await page.click('[data-testid="write-content"]')
  await expect(page.locator('[data-testid="write-content"]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.app')).toBeFocused()
  await expect(page.locator('[data-testid="write-content"]')).not.toBeFocused()
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)

  // 第二下：焦点已经不在编辑框里，基础态不消费 → 起菜单；再一下菜单自己关掉
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)

  // 面板 = 页内模态：P 被页面的 `pageModalOpen` 挡掉，屏幕上只能有一个模态
  await page.click('[data-testid="write-open-docs"]')
  await expect(page.locator('[data-testid="write-panel-docs"]')).toBeVisible()
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="write-panel-docs"]')).toBeVisible()

  // 点遮罩关面板（鼠标路径）
  await page.locator('.sheet-mask').click({ position: { x: 8, y: 8 } })
  await expect(page.locator('[data-testid="write-panel-docs"]')).toHaveCount(0)
})

test('写作页：正文里 Shift+字母 直接开面板，白名单之外的字母照旧是打字', async ({ page }) => {
  await openWrite(page)

  // 1) 正文里 `Shift+N`：不必先 Tab 出正文（组合键白名单就是这三个面板键）
  const content = page.locator('[data-testid="write-content"]')
  const docs = page.locator('[data-testid="write-panel-docs"]')
  const meta = page.locator('[data-testid="write-panel-meta"]')
  await page.click('[data-testid="write-content"]')
  await expect(content).toBeFocused()
  await page.keyboard.press('Shift+N')
  await expect(docs).toBeVisible()
  // 组合键被吃掉：正文里没有多出一个「N」
  await expect(content).toHaveValue('')

  // 2) `Shift+M` 直接换面板（面板里的面板键归面板，不必先关再开）
  await page.keyboard.press('Shift+M')
  await expect(meta).toBeVisible()
  await expect(docs).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(meta).toHaveCount(0)

  // 3) 白名单之外的字母不抢：`Shift+W` 就是个大写 W。
  //    字母快捷键里它归方向键，那一路假设「焦点不在输入框」，抢了就成了
  //    「想打大写字母，光标却掉了、字也没进去」
  await page.click('[data-testid="write-content"]')
  await page.keyboard.press('Shift+W')
  await expect(content).toHaveValue('W')
  await expect(content).toBeFocused()

  // 4) 不带 Shift 的字母就是打字，面板不许开
  await page.keyboard.press('n')
  await expect(content).toHaveValue('Wn')
  await expect(docs).toHaveCount(0)

  // 5) 宽屏没有预览面板：`Shift+V` 不消费，照常打出大写 V
  await page.keyboard.press('Shift+V')
  await expect(content).toHaveValue('WnV')
  await expect(page.locator('[data-testid="write-panel-preview"]')).toHaveCount(0)

  // 全程不许冒出暂停菜单：组合键走的是页面动作，不是全局 START
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
})

test('写作页：纯鼠标 —— 三个面板互相切换、删除走二次确认框', async ({ page }) => {
  const recorder = await openWrite(page)

  // 先落库一篇，删除才有对象
  await page.fill('[data-testid="write-title"]', '待删除')
  await page.click('[data-testid="write-save"]')
  await expect(page).toHaveURL(/\/write\/brand-new$/)

  // 面板是页内模态（§28.4）：一次只开一个，动作条也被遮罩盖住 —— 换面板先关
  // （这是全站页内模态的既定口径，管理页的 `.del-mask` 同款；遮罩自带点击即关）
  await page.click('[data-testid="write-open-docs"]')
  await expect(page.locator('[data-testid="write-panel-docs"]')).toBeVisible()
  await page.locator('.sheet-mask').click({ position: { x: 6, y: 6 } })
  await expect(page.locator('[data-testid="write-panel-docs"]')).toHaveCount(0)
  await page.click('[data-testid="write-open-meta"]')
  await expect(page.locator('[data-testid="write-panel-meta"]')).toBeVisible()

  // 资料面板里加一个标签（回车提交）
  await page.fill('[data-testid="write-tag-input"]', '像素')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="write-tag-remove-像素"]')).toBeVisible()

  // 删除 → 二次确认框（PixelDialog 之外的像素确认框）
  await page.click('[data-testid="write-act-2"]')
  const confirm = page.locator('[data-testid="write-confirm"]')
  await expect(confirm).toBeVisible()
  await expect(confirm).toContainText('待删除')
  // 先取消：什么也不该发生
  await page.click('[data-testid="write-confirm-cancel"]')
  await expect(confirm).toHaveCount(0)
  expect(recorder.writes.map((w) => w.method)).toEqual(['POST'])

  // 再来一次，这回确认（`askDelete()` 会先关面板 —— 确认框不叠在面板上，得重新开资料）
  await page.click('[data-testid="write-open-meta"]')
  await page.click('[data-testid="write-act-2"]')
  await page.click('[data-testid="write-confirm-ok"]')
  await expect.poll(() => recorder.writes.length).toBe(2)
  expect(recorder.writes[1]).toMatchObject({ method: 'DELETE', path: '/api/posts/p-new' })
  // 删完回到一张新稿（URL 退回 /write，表单清空）
  await expect(page).toHaveURL(/\/write$/)
  await expect(page.locator('[data-testid="write-title"]')).toHaveValue('')
})

test('写作页：axe 扫描无违规（面板与确认框都要扫）', async ({ page }) => {
  await openWrite(page)

  /**
   * 全站已知取舍（`a11y.spec.ts` 的清单，本页不重复判）：外壳底栏那几行小字的对比度。
   * 这里是外壳的东西，不是写作页自己的 —— 排除口径与 `admin-links.spec.ts` 逐字相同。
   */
  const KNOWN = ['.deck-src', '.is-copyright', '.is-slogan', '.is-icp']

  const clean = async () => {
    const result = await new AxeBuilder({ page }).analyze()
    const summary = result.violations.flatMap((v) =>
      v.nodes
        .filter((n) => !KNOWN.some((s) => n.target.join(' ').includes(s)))
        .map((n) => `[${v.impact ?? 'unknown'}] ${v.id} → ${n.target.join(' ')}`),
    )
    expect(summary).toEqual([])
  }

  await clean()

  await page.click('[data-testid="write-open-docs"]')
  await expect(page.locator('[data-testid="write-panel-docs"]')).toBeVisible()
  await clean()

  await page.click('[data-testid="write-panel-close"]')
  await expect(page.locator('[data-testid="write-panel-docs"]')).toHaveCount(0)
  await page.click('[data-testid="write-open-meta"]')
  await expect(page.locator('[data-testid="write-panel-meta"]')).toBeVisible()
  await clean()
})

/* ────────────── 窄屏自适应（预览折成 V 面板） ────────────── */

test('写作页：窄屏把预览折成 V 面板，断点两侧来回切都跟得上', async ({ page }) => {
  await openWrite(page)
  await page.fill('[data-testid="write-content"]', '# 窄屏\n\n预览也要跟着走。')

  /** 源码列有没有独占整条分屏（曾经窄屏下栅格还是两列，源码只占左半屏） */
  const sourceFillsSplit = async () => {
    const [split, source] = await page.evaluate(() =>
      ['.write-split', '.split-source'].map(
        (s) => document.querySelector(s)!.getBoundingClientRect().width,
      ),
    )
    return Math.abs((split ?? 0) - (source ?? 0)) < 4
  }

  // ── 宽屏：左右分屏，没有「预览」那颗按钮 ──
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.locator('[data-testid="write-preview"]')).toBeVisible()
  await expect(page.locator('[data-testid="write-open-preview"]')).toHaveCount(0)

  // ── 原位缩到窄屏：分屏塌成一列、预览栏让位给 V 面板 ──
  await page.setViewportSize({ width: 900, height: 800 })
  await expect(page.locator('[data-testid="write-preview"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="write-open-preview"]')).toBeVisible()
  expect(await sourceFillsSplit(), '窄屏下源码应当独占全宽').toBe(true)

  // V 面板里就是同一份实时预览
  await page.click('[data-testid="write-open-preview"]')
  const panel = page.locator('[data-testid="write-panel-preview"]')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('预览也要跟着走。')

  // ── 原位放大回宽屏：面板自动关（预览栏回来了，再叠一个面板是重复的） ──
  await page.setViewportSize({ width: 1440, height: 800 })
  await expect(panel).toHaveCount(0)
  await expect(page.locator('[data-testid="write-preview"]')).toBeVisible()
  await expect(page.locator('[data-testid="write-preview"]')).toContainText('预览也要跟着走。')
  expect(await sourceFillsSplit(), '宽屏回到两栏').toBe(false)

  // ── 更窄（手机宽）：仍然是一列、源码不被挤出去 ──
  await page.setViewportSize({ width: 640, height: 800 })
  await expect(page.locator('[data-testid="write-open-preview"]')).toBeVisible()
  expect(await sourceFillsSplit(), '640 下源码也应当独占全宽').toBe(true)
  const [splitW, innerW] = await page.evaluate(() => [
    document.querySelector('.write-split')!.getBoundingClientRect().width,
    document.querySelector('.screen-inner')!.clientWidth,
  ])
  expect(splitW, '分屏不该比屏幕还宽').toBeLessThanOrEqual(innerW + 1)
})

/** 够长的正文：窄屏预览面板必须真的滚得动，短正文试不出滚轮/方向键 */
const LONG_MD = Array.from(
  { length: 60 },
  (_, i) => `第 ${i + 1} 段：这是一段用来撑长度的正文。`,
).join('\n\n')

test('写作页：窄屏预览面板滚得动（滚轮 + 方向键），关掉之后键盘不掉线', async ({ page }) => {
  await openWrite(page)
  await page.setViewportSize({ width: 900, height: 720 })
  await page.fill('[data-testid="write-content"]', LONG_MD)
  await page.click('[data-testid="write-open-preview"]')

  const body = page.locator('[data-testid="write-preview-body"]')
  await expect(body).toBeVisible()

  // 焦点必须在滚动容器本身上：方向键滚的是「当前焦点所在的滚动容器」，
  // 焦点落在里面那层 inert 包装上（或掉在 body 上）就谁也滚不动（§28.12 的真机根因）
  await expect(body).toBeFocused()
  const scrollTop = () => body.evaluate((el) => el.scrollTop)
  expect(await body.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(200)

  // ── 滚轮：指针落在正文里，遮罩铺满视口也不许吃掉滚轮 ──
  const box = (await body.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 240)
  await expect.poll(scrollTop).toBeGreaterThan(0)

  // ── 方向键：先回顶部，增量只能来自键盘 ──
  await body.evaluate((el) => {
    el.scrollTop = 0
  })
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect.poll(scrollTop).toBeGreaterThan(0)
  await expect(body).toBeFocused()

  // ── 切到资料面板：焦点跟着走（预览体马上要被卸载，不收焦点键盘就掉线） ──
  await page.keyboard.press('m')
  await expect(page.locator('[data-testid="write-panel-meta"]')).toBeVisible()
  await expect(page.locator('.app')).toBeFocused()

  // ── 关面板：焦点回外壳，ESC 还能起菜单（键盘真活着的硬证据） ──
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="write-panel-meta"]')).toHaveCount(0)
  await expect(page.locator('.app')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
})

test('写作页：页内模态盖住外壳底栏，软键不再浮在遮罩之上', async ({ page }) => {
  await openWrite(page)
  await page.setViewportSize({ width: 900, height: 720 })

  /** 某个元素中心点上的最上层元素（点的到底是谁，一眼可辨） */
  const topAt = (testid: string) =>
    page.evaluate((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement
      const rect = el.getBoundingClientRect()
      const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return top ? top.className || top.tagName : 'NONE'
    }, testid)

  // ── 没有弹窗：软键照旧在最上层（层级修正对它零影响） ──
  expect(await topAt('softkey-menu')).toContain('softkey')

  // ── 页内模态（fixed 遮罩铺满视口，含底栏那一条）：软键必须让位 ──
  await page.click('[data-testid="write-open-preview"]')
  await expect(page.locator('[data-testid="write-panel-preview"]')).toBeVisible()
  expect(await topAt('softkey-menu')).toContain('sheet-mask')
  expect(await topAt('softkey-sound')).toContain('sheet-mask')

  // 真按一下软键所在的位置：点到的是遮罩 —— 关掉面板，音效没被穿透改成 ON，菜单也没弹出
  const key = (await page.locator('[data-testid="softkey-menu"]').boundingBox())!
  await page.mouse.click(key.x + key.width / 2, key.y + key.height / 2)
  await expect(page.locator('[data-testid="write-panel-preview"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="softkey-sound"]')).toHaveText(/OFF/)
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)

  // ── 弹窗关掉：软键照旧点得到（点一下真的开菜单） ──
  expect(await topAt('softkey-menu')).toContain('softkey')
  await page.click('[data-testid="softkey-menu"]')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
})

/* ────────────── 标签从已有标签里挑 ────────────── */

test('写作页：标签可以从已有标签里挑（常用在前、打字过滤、已加的不再出现）', async ({ page }) => {
  await openWrite(page)
  await page.click('[data-testid="write-open-meta"]')
  const picker = page.locator('[data-testid="write-tag-suggest"]')
  await expect(picker).toBeVisible()

  // 一个字都不打就先给「常用的几枚」，按篇数倒序（与全站标签取数口径一致）
  const names = await picker.locator('button').evaluateAll((els) =>
    els.map((el) => (el.textContent ?? '').trim()),
  )
  expect(names[0]).toContain('草图')
  expect(names).toHaveLength(4)
  await expect(page.locator('[data-testid="write-tag-suggest-草图"]')).toContainText('9')

  // 点一枚就加上去，加上去的那枚从候选里消失（已加的不再出现）
  await page.click('[data-testid="write-tag-suggest-像素风"]')
  await expect(page.locator('[data-testid="write-tag-remove-像素风"]')).toBeVisible()
  await expect(page.locator('[data-testid="write-tag-suggest-像素风"]')).toHaveCount(0)

  // 打字按包含过滤：「像素」只剩没加过的那一枚
  await page.fill('[data-testid="write-tag-input"]', '像素')
  await expect(picker.locator('button')).toHaveCount(1)
  await expect(page.locator('[data-testid="write-tag-suggest-像素"]')).toBeVisible()

  // 键盘：↓ 高亮第一枚、Enter 收下它（不需要鼠标）
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="write-tag-suggest-像素"]')).toHaveClass(/on/)
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="write-tag-remove-像素"]')).toBeVisible()
  await expect(page.locator('[data-testid="write-tag-input"]')).toHaveValue('')

  // 手打一个站上没有的词：候选空 → 提示可以新建，Enter 就新建
  await page.fill('[data-testid="write-tag-input"]', '自造词')
  await expect(picker).toHaveCount(0)
  await expect(page.locator('.meta-note')).toContainText('自造词')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="write-tag-remove-自造词"]')).toBeVisible()
})

/* ────────────── 自动保存 ────────────── */

test('写作页：停笔两秒自动存一次（已落库的稿子），新稿不自动建', async ({ page }) => {
  const recorder = await openWrite(page)

  // 新稿还没 id：写多少都不该自动建（否则「打开看看」也会留下空稿）
  await page.fill('[data-testid="write-title"]', '自动保存试验')
  await page.fill('[data-testid="write-content"]', '第一段。')
  await page.waitForTimeout(2600)
  expect(recorder.writes, '新稿不该被自动创建').toHaveLength(0)
  await expect(page.locator('[data-testid="write-status"]')).toContainText('未保存')

  // 手工存一次落库 → 之后再改动，停笔两秒应当自己 PUT 一次
  await page.click('[data-testid="write-save"]')
  await expect(page).toHaveURL(/\/write\/brand-new$/)
  // 「人按的」这一次：不能写成「已自动保存 …」（两者不是子串关系，正则能分辨）
  await expect(page.locator('[data-testid="write-status"]')).toContainText(/^已保存 \d{2}:\d{2}:\d{2}$/)

  await page.fill('[data-testid="write-content"]', '第一段。第二段是停笔之后自己存的。')
  await expect(page.locator('[data-testid="write-status"]')).toContainText('未保存')
  await expect.poll(() => recorder.writes.length, { timeout: 8000 }).toBe(2)
  expect(recorder.writes[1]).toMatchObject({ method: 'PUT', path: '/api/posts/p-new' })
  expect(recorder.writes[1]?.body).toMatchObject({
    content: '第一段。第二段是停笔之后自己存的。',
    status: 'draft',
  })

  // 页头写清楚这一次是自动的（旧版口径「已自动保存」），并且不再是「未保存」
  await expect(page.locator('[data-testid="write-status"]')).toContainText('已自动保存')
  await expect(page.locator('[data-testid="write-status"]')).not.toContainText('未保存')

  // 自动保存期间编辑区不能被打断（曾经 busy 会把 textarea 与标题一起 disabled）
  await page.fill('[data-testid="write-content"]', '再写一段，接着写不该被卡住。')
  await expect(page.locator('[data-testid="write-content"]')).toBeEnabled()
  await expect(page.locator('[data-testid="write-title"]')).toBeEnabled()
})

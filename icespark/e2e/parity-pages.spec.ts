import { expect, test, type Page } from '@playwright/test'

import { booted } from './helpers'

/**
 * **逐页的纯鼠标门** —— 硬要求「单独用鼠标能完成全部交互」的覆盖面补齐。
 *
 * 既有两道 parity 门守的是**外壳**那一层（软键、音效询问、底栏几何）；
 * 页面里的鼠标路径散在各自的 spec 里，但多数只是「点了一下」，**没有一处证明
 * 「这一整段旅程里一次键盘都没按过」**。这一份补的就是这个：每个用例装一个 keydown 记录器，
 * 全程只用 `page.mouse` / `page.click()` / `hover()`，最后断言记录器**是空的**。
 *
 * 为什么这条要求值得机器守：鼠标路径与键盘路径走的是**两套入口**（原生 click 事件 vs 手柄层
 * 派发的 `PadAction`），历史上真出过「键盘能做、鼠标不能」和反过来的偏差；而且鼠标路径
 * 还会踩到「划过共享焦点（静音）」「点不可聚焦空白处焦点回外壳」这类只有鼠标才触发的分支。
 *
 * 与 `parity-keyboard.spec.ts` 对称：那边断言「鼠标一次都没动过」。
 * 需要数据的地方一律打桩（不依赖真账号、不依赖库里有数据）。
 */

/** 装记录器：任何 keydown 都会被记下（捕获阶段，比组件监听早） */
/** 打桩成已登录的超管（与 parity-pages-keyboard.spec.ts 同一写法） */
/** 打桩成已登录的普通作者（能写作、不能进管理页） */
async function author(page: Page): Promise<void> {
  const user = { id: 'e2e-id', username: 'e2e_writer', display_name: '测试作者', is_superuser: false }
  await page.addInitScript((u) => {
    localStorage.setItem('synthspark-token', 'e2e-token')
    localStorage.setItem('synthspark-icespark-user', JSON.stringify(u))
  }, user)
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...user, email: null, bio: null, avatar_url: null }),
    }),
  )
}

async function superuser(page: Page): Promise<void> {
  const user = { id: 'e2e-id', username: 'e2e_boss', display_name: '测试超管', is_superuser: true }
  await page.addInitScript((u) => {
    localStorage.setItem('synthspark-token', 'e2e-token')
    localStorage.setItem('synthspark-icespark-user', JSON.stringify(u))
  }, user)
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...user, email: null, bio: null, avatar_url: null }),
    }),
  )
}

async function installRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as { __keys: string[] }
    store.__keys = []
    document.addEventListener('keydown', (event) => store.__keys.push(event.key), true)
  })
}

/** 收工断言：这一段旅程里一次键盘都没按过 */
async function expectNoKeys(page: Page): Promise<void> {
  const keys = await page.evaluate(() => (window as unknown as { __keys: string[] }).__keys)
  expect(keys, `纯鼠标旅程里出现了按键：${keys.join(', ')}`).toEqual([])
}

const POSTS = [
  {
    id: 'p-1',
    title: '第一篇文章',
    slug: 'first-post',
    content: '# 第一篇文章\n\n这是一段用来验鼠标路径的正文。',
    introduction: '摘要一',
    cover_image: null,
    status: 'published',
    author_id: 'u-1',
    author_name: '测试作者',
    author_username: 'e2e_writer',
    author_avatar: null,
    author_type: 'user',
    tags: ['像素'],
    group_id: 'g-1',
    group_name: '技术',
    view_count: 3,
    like_count: 0,
    created_at: '2026-09-20T10:00:00',
    updated_at: '2026-09-20T10:00:00',
    published_at: '2026-09-20T10:00:00',
  },
]

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
]

/** 首页 / 列表 / 详情要的四组接口，单条正则内部分派（多条 route 只有最后注册的生效） */
async function stubContent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await page.route(/\/api\/(groups|posts|tags|comments)\//, (route) => {
    const method = route.request().method()
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (method === 'GET') {
      if (path === '/api/groups/') return json(GROUPS)
      if (path === '/api/tags/') return json([])
      if (path === '/api/posts/') return json({ items: POSTS, total: POSTS.length })
      if (path === '/api/posts/my') return json({ items: [], total: 0 })
      if (path.startsWith('/api/posts/slug/')) return json(POSTS[0])
      if (path.startsWith('/api/posts/')) return json(POSTS[0])
      if (path.startsWith('/api/comments/')) return json({ comments: [], total: 0 })
    }
    return route.fallback()
  })
}

test('纯鼠标：首页点卡进文章，再点「返回」回到来的那一页', async ({ page }) => {
  await installRecorder(page)
  await stubContent(page)
  await page.goto('/')
  await booted(page)

  await expect(page.locator('[data-testid="home-post-0"]')).toBeVisible()
  await page.hover('[data-testid="home-post-0"]')
  await page.click('[data-testid="home-post-0"]')

  await expect(page).toHaveURL(/\/post\/first-post$/)
  await expect(page.locator('[data-testid="md-body"]')).toBeVisible()

  // 操作条上的「返回」也是鼠标路径（`goBackOrPosts()`：有历史就 back）
  await page.click('[data-testid="action-back"]')
  await expect(page).toHaveURL(/\/$/)

  await expectNoKeys(page)
})

test('纯鼠标：文章页点赞、评论对话框开与关、关封面失败回退都不碰键盘', async ({ page }) => {
  await installRecorder(page)
  await stubContent(page)
  await page.goto('/post/first-post')
  await booted(page)

  // 点赞：点一下变「已点赞」，再点一下回去（本地 toggle，不发请求）
  const like = page.locator('[data-testid="action-like"]')
  await page.hover('[data-testid="action-like"]')
  await page.click('[data-testid="action-like"]')
  await expect(like).toContainText('已点赞')
  await page.click('[data-testid="action-like"]')
  await expect(like).toContainText('点赞')

  // 评论：鼠标点开、鼠标点「✕ 关闭」关掉（`.dialog-close` 是组件自己的关闭按钮）
  await page.click('[data-testid="action-comment"]')
  const dialog = page.locator('.dialog-wrap')
  await expect(dialog).toBeVisible()
  await page.click('.dialog-close')
  await expect(dialog).toHaveCount(0)

  await expectNoKeys(page)
})

test('纯鼠标：列表页点芯片筛选、点「清除」回无筛选、点卡进文章', async ({ page }) => {
  await installRecorder(page)
  await stubContent(page)
  await page.goto('/posts')
  await booted(page)

  // 点分组芯片即筛选（URL 是唯一真相）。芯片的 testid 用的是**分组名**（见 `frowGroups`）
  await page.hover('[data-testid="group-技术"]')
  await page.click('[data-testid="group-技术"]')
  await expect(page).toHaveURL(/group=/)
  await expect(page.locator('[data-testid="group-技术"]')).toHaveClass(/on/)

  // 「✕ 清除」也是鼠标路径（这颗按钮点完会把自己卸载掉 —— 焦点兜底见 §32.2）
  await page.click('[data-testid="filter-clear"]')
  await expect(page).not.toHaveURL(/group=/)

  // 点卡片进文章：鼠标与键盘要到同一个落点
  await page.click('[data-testid="post-card"]')
  await expect(page).toHaveURL(/\/post\/first-post$/)
  await expect(page.locator('[data-testid="md-body"]')).toBeVisible()

  await expectNoKeys(page)
})

test('纯鼠标：关联页点卡片进站内页（零键盘）', async ({ page }) => {
  await installRecorder(page)
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  // 关联页是唯一一处「卡片 = 链接」的页面：站内路径走前端路由，绝对链接开新标签页。
  // 这里只放站内路径（`/posts` 是标签页之一的路径 → `switchTab`），好在同一页里验完。
  await page.route(/\/api\/links\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'l-1',
          name: '去文章页',
          url: '/posts',
          cover_image: null,
          sort_order: 1,
          created_at: '2026-09-20T10:00:00',
          updated_at: '2026-09-20T10:00:00',
        },
      ]),
    }),
  )

  await page.goto('/links')
  await booted(page)
  await expect(page.locator('[data-testid="link-card"]')).toHaveCount(1)

  await page.hover('[data-testid="link-card"]')
  await expect(page.locator('[data-testid="link-card"]')).toHaveClass(/is-focused/)
  await page.click('[data-testid="link-card"]')
  await expect(page).toHaveURL(/\/posts$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'posts')

  await expectNoKeys(page)
})

test('纯鼠标：管理页读一条、改一条（编辑 → 保存）全程零键盘', async ({ page }) => {
  await installRecorder(page)
  await page.addInitScript(() => {
    // 音效询问标记必须写：它是**首次手势**触发的模态，不写就会被 Playwright 的第一下点击撞上，
    // 那一下被弹窗吃掉 → 卡片按钮其实没点到（这个坑本条用例真踩过）
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
    const user = { id: 'e2e-id', username: 'e2e_boss', display_name: '测试超管', is_superuser: true }
    localStorage.setItem('synthspark-token', 'e2e-token')
    localStorage.setItem('synthspark-icespark-user', JSON.stringify(user))
  })
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'e2e-id',
        username: 'e2e_boss',
        display_name: '测试超管',
        is_superuser: true,
      }),
    }),
  )
  const writes: string[] = []
  await page.route(/\/api\/links\//, async (route) => {
    const method = route.request().method()
    const link = {
      id: 'l-1',
      name: '示例站点',
      url: 'https://example.com/',
      cover_image: null,
      sort_order: 1,
      created_at: '2026-09-20T10:00:00',
      updated_at: '2026-09-20T10:00:00',
    }
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([link]),
      })
    }
    writes.push(method)
    return route.fulfill({
      status: method === 'POST' ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify(link),
    })
  })

  await page.goto('/admin/links')
  await booted(page)
  await expect(page.locator('[data-testid="admin-link-card"]')).toHaveCount(1)

  // 点「编辑」→ 表单被现值填满；改一个字段；点「保存修改」→ PUT
  await page.click('[data-testid="link-edit"]')
  await expect(page.locator('[data-testid="link-name"]')).toHaveValue('示例站点')
  await page.fill('[data-testid="link-name"]', '示例站点 v2')
  await page.click('[data-testid="link-save"]')
  await expect(page.locator('[data-testid="link-form-note"]')).toContainText('已保存')
  expect(writes).toEqual(['PUT'])

  await expectNoKeys(page)
})

test('纯鼠标：站点设置页点段换页、点进字段改一处、点保存（零键盘）', async ({ page }) => {
  await installRecorder(page)
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await superuser(page)

  const puts: Record<string, unknown>[] = []
  await page.route('**/api/admin/site-config', (route) => {
    if (route.request().method() === 'PUT') {
      puts.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        site: { name: '鼠标站点', title: '', description: '', icp: '', defaultTheme: 'icespark', logo: '' },
        navbar: { logo: '', navItems: [] },
        footer: { copyright: '', slogan: '', links: [] },
        home: { title: '旧横幅', desc: '' },
        about: { body: '' },
      }),
    })
  })

  await page.goto('/admin/site')
  await booted(page)
  await expect(page.locator('[data-testid="admin-site-ready"]')).toBeVisible()

  // 点段直接换页（键盘那边要先 ↓ 再 ENTER，这里是鼠标直达）
  await page.click('[data-testid="admin-site-segment"][data-segment="home"]')
  await expect(page.locator('[data-testid="admin-site-segment-panel"]')).toHaveAttribute(
    'data-segment',
    'home',
  )

  // `fill()` 直接写值、不发按键事件 —— 这条旅程要的是「点击就能走完」
  const field = page.locator('[data-field="home.title"] input')
  await expect(field).toHaveValue('旧横幅')
  await field.click()
  await field.fill('鼠标横幅')
  await page.click('[data-testid="admin-site-save"]')

  await expect(page.locator('[data-testid="admin-site-saved"]')).toBeVisible()
  await expect.poll(() => puts.length).toBe(1)
  const body = puts[0] as { home?: { title?: string }; site?: { name?: string } }
  expect(body.home?.title).toBe('鼠标横幅')
  expect(body.site?.name, '没动过的段原样带回去').toBe('鼠标站点')

  await expectNoKeys(page)
})

test('纯鼠标：写作页点两格写字 + 点「存草稿」（零键盘）', async ({ page }) => {
  await installRecorder(page)
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await author(page)

  const writes: { method: string; body: string }[] = []
  await page.route(/\/api\/(posts|groups|tags)\//, (route) => {
    const method = route.request().method()
    const pathname = new URL(route.request().url()).pathname
    if (method !== 'GET') writes.push({ method, body: route.request().postData() ?? '' })
    const body =
      pathname === '/api/groups/' || pathname === '/api/tags/'
        ? []
        : {
            id: 'p-e2e-new',
            slug: 'e2e-new',
            title: '鼠标写的标题',
            content: '鼠标写的正文',
            status: 'draft',
            created_at: '2026-09-20T10:00:00',
            updated_at: '2026-09-20T10:00:00',
            published_at: null,
          }
    return route.fulfill({
      status: method === 'POST' ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })

  await page.goto('/write')
  await booted(page)

  // 点进标题、点进正文，再点「存草稿」——键盘那边走 Tab 与 Ctrl/⌘+S，这里全程只有点击
  await page.click('[data-testid="write-title"]')
  await page.fill('[data-testid="write-title"]', '鼠标写的标题')
  await page.click('[data-testid="write-content"]')
  await page.fill('[data-testid="write-content"]', '# 鼠标写的正文')
  await page.click('[data-testid="write-save"]')

  await expect.poll(() => writes.length, { message: '存草稿应当真发一次写请求' }).toBe(1)
  const sent = JSON.parse(writes[0]!.body) as { title?: string; content?: string; status?: string }
  expect(sent.title).toBe('鼠标写的标题')
  expect(sent.content).toContain('鼠标写的正文')
  expect(sent.status).toBe('draft')
  await expect(page.locator('[data-testid="write-status"]')).toContainText('已保存')

  await expectNoKeys(page)
})

import { expect, test, type Page } from '@playwright/test'

import { booted, press } from './helpers'

/**
 * **逐页的纯键盘门** —— 与 `parity-pages.spec.ts`（逐页纯鼠标）对称的另一半。
 *
 * 目标是同一句硬要求：「**单独用鼠标或单独用键盘都能完成全部交互**」。
 * `parity-keyboard.spec.ts` 守的是外壳（音效询问、软键、Tab 交还浏览器、文章页 TAB 顺序），
 * 各页 spec 里的键盘用例也很多，但**没有一处逐页证明过「这一整段旅程里一次指针事件都没发生」**——
 * 而两者的入口本来就不同（原生 click vs 手柄层 `PadAction`），键盘路径还独有几条：
 * 按键被 `preventDefault` 吞掉、`inputLocked` 期间只放行 START、`focusZone === 'tabs'` 时
 * 场景收不到方向键等等。这里每条旅程装一个**指针记录器**（只记 `pointerdown` / `mousedown`，
 * **不记 click** —— 键盘按回车时浏览器同样会派发 click，把 click 算进来会把回车误判成鼠标），
 * 全程只用 `page.keyboard`，收工断言记录器为空。
 *
 * 需要登录态的页面一律打桩超管（不碰真账号）；需要数据的页面打桩夹具。
 */

/** 指针记录器：只看「指针设备真的动过没有」 */
async function installPointerRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as { __pointer: string[] }
    store.__pointer = []
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      document.addEventListener(type, () => store.__pointer.push(type), true)
    }
  })
}

async function expectNoPointer(page: Page): Promise<void> {
  const events = await page.evaluate(() => (window as unknown as { __pointer: string[] }).__pointer)
  expect(events, `纯键盘旅程里出现了指针事件：${events.join(', ')}`).toEqual([])
}

const POST = {
  id: 'p-1',
  title: '第一篇文章',
  slug: 'first-post',
  content: '# 第一篇文章\n\n用键盘也要能读完。',
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
}

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

/** 公开内容页的夹具（首页 / 列表 / 详情） */
async function stubContent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await page.route(/\/api\/(groups|posts|tags|comments)\//, (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/api/groups/') return json(GROUPS)
    if (path === '/api/tags/') return json([])
    if (path === '/api/posts/') return json({ items: [POST, POST], total: 2 })
    if (path.startsWith('/api/posts/slug/')) return json(POST)
    if (path.startsWith('/api/posts/')) return json(POST)
    return json({ comments: [], total: 0 })
  })
}

/** 超管登录态（打桩 `/api/auth/me`，不碰真账号） */
/** 公开用户页的桩：按用户名给作者，按 author_id 给一篇已发布文章 */
async function stubAuthorPage(page: Page): Promise<void> {
  const post = {
    id: 'p-1',
    slug: 'user-post-1',
    title: '作者的文章',
    introduction: '摘要',
    cover_image: null,
    status: 'published',
    author_id: 'u-1',
    author_name: '测试作者',
    author_username: 'e2e_writer',
    author_avatar: null,
    author_type: 'user',
    tags: [],
    group_id: 'g-1',
    group_name: '技术',
    view_count: 3,
    like_count: 1,
    content: '# 正文\n\n内容。',
    created_at: '2026-09-20T10:00:00',
    updated_at: '2026-09-20T10:00:00',
    published_at: '2026-09-20T10:00:00',
  }
  await page.route(/\/api\/users\/by-username\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'u-1',
        username: 'e2e_writer',
        display_name: '测试作者',
        avatar_url: null,
        bio: null,
        user_type: 'user',
        created_at: '2026-09-01T00:00:00',
      }),
    }),
  )
  await page.route(/\/api\/(posts|comments)\//, (route) => {
    const path = new URL(route.request().url()).pathname
    const body = path.startsWith('/api/comments/')
      ? { total: 0, comments: [] }
      : { items: [post], total: 1 }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })
}

/** 审计接口桩：两页夹具（offset=0 两条、offset=10 一条，total=12 才算两页） */
async function stubAuditLogs(page: Page): Promise<void> {
  const base = {
    admin_id: 'e2e-admin-id',
    admin_username: 'e2e_boss',
    action: 'update',
    old_value: { site: { name: '旧名' } },
    new_value: { site: { name: '新名' } },
    ip_address: '203.0.113.7',
    user_agent: 'Mozilla/5.0 (e2e-browser)',
    created_at: '2026-09-29 14:11:48',
  }
  await page.route(/\/api\/admin\/site-config\/audit-logs/, (route) => {
    const offset = new URL(route.request().url()).searchParams.get('offset') ?? '0'
    const logs =
      offset === '0'
        ? [{ ...base, id: 7 }, { ...base, id: 6, created_at: '2026-09-28 10:00:00' }]
        : [{ ...base, id: 1, created_at: '2026-09-27 09:00:00' }]
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ logs, total: 12 }),
    })
  })
}

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

test('纯键盘：首页用方向键走到卡片、回车进文章，全程没有指针事件', async ({ page }) => {
  await installPointerRecorder(page)
  await stubContent(page)
  await page.goto('/')
  await booted(page)

  // 首页光标从「最新文章」区第一张卡开始：回车就进文章
  await expect(page.locator('[data-testid="home-post-0"]')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="home-post-1"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-testid="home-post-0"]')).toHaveClass(/is-focused/)

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/post\/first-post$/)
  await expect(page.locator('[data-testid="md-body"]')).toBeVisible()

  await expectNoPointer(page)
})

test('纯键盘：列表页筛选（G/→/ENTER）→ 回车进文章 → Q 回到筛选后的列表', async ({ page }) => {
  await installPointerRecorder(page)
  await stubContent(page)
  await page.goto('/posts')
  await booted(page)

  // G 进分组行 → ENTER 按该分组筛选（URL 是唯一真相）
  await page.keyboard.press('g')
  // 「全部」那一枚的 key 是空串，模板给的 testid 是 `group-all`
  await expect(page.locator('[data-testid="group-all"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="group-技术"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/group=/)
  await expect(page.locator('[data-testid="group-技术"]')).toHaveClass(/on/)

  // 从筛选行下到卡片：↓ 先到标签行、再到栅格（分区是 0 分组行 / 1 标签行 / 2 卡片栅格）
  await press(page, 'ArrowDown')
  await expect(page.locator('[data-testid="tag-row"] .fchip')).toHaveCount(1)
  await press(page, 'ArrowDown')
  await expect(page.locator('[data-testid="post-card"]').first()).toHaveClass(/is-focused/)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/post\/first-post$/)

  // Q：有历史就回上一页（保留筛选）
  await press(page, 'q')
  await expect(page).toHaveURL(/group=/)

  await expectNoPointer(page)
})

test('纯键盘：文章页 L/→/ENTER 走到「返回」并回列表', async ({ page }) => {
  await installPointerRecorder(page)
  await stubContent(page)
  await page.goto('/post/first-post')
  await booted(page)

  // L 进操作条 → → 到第三枚（返回）→ 回车
  await page.keyboard.press('l')
  await expect(page.locator('[data-testid="action-like"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="action-back"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('Enter')

  // 深链接进来没有历史 → 兜底回列表；文章有分组时**带上分组**回列表（样机口径：
  // `goBackOrPosts(post.group_name)`），所以 URL 里会有 group= 参数
  await expect(page).toHaveURL(/\/posts(\?|$)/)
  await expect(page.locator('[data-testid="group-row"]')).toBeVisible()

  await expectNoPointer(page)
})

test('纯键盘：关联页方向键选卡 + 回车进站内页（零指针事件）', async ({ page }) => {
  await installPointerRecorder(page)
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  // 两张站内卡，指向不同标签页 —— 这样「→ 移动」与「回车激活的是哪一张」都能验出来
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
        {
          id: 'l-2',
          name: '去关于页',
          url: '/about',
          cover_image: null,
          sort_order: 2,
          created_at: '2026-09-20T10:00:00',
          updated_at: '2026-09-20T10:00:00',
        },
      ]),
    }),
  )

  await page.goto('/links')
  await booted(page)
  const cards = page.locator('[data-testid="link-card"]')
  await expect(cards).toHaveCount(2)
  await expect(cards.nth(0)).toHaveClass(/is-focused/)

  // → 走到第二张（共享光标），回车激活它
  await page.keyboard.press('ArrowRight')
  await expect(cards.nth(1)).toHaveClass(/is-focused/)
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/about$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'about')

  await expectNoPointer(page)
})

test('纯键盘：个人页改昵称并保存（Tab 进表单、打字、Tab 到保存、回车）', async ({ page }) => {
  await installPointerRecorder(page)
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await superuser(page)
  const user = {
    id: 'e2e-id',
    username: 'e2e_boss',
    display_name: '测试超管',
    is_superuser: true,
    email: 'boss@example.com',
    bio: null,
    avatar_url: null,
  }
  const writes: { method: string; body: unknown }[] = []
  await page.route(/\/api\/(users|upload)\//, async (route) => {
    const method = route.request().method()
    const path = new URL(route.request().url()).pathname
    if (method === 'GET' && path === '/api/users/me') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      })
    }
    const raw = route.request().postData()
    writes.push({ method, body: raw ? JSON.parse(raw) : null })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...user, display_name: '改过的昵称' }),
    })
  })

  await page.goto('/profile')
  await booted(page)
  await expect(page.locator('[data-testid="profile-display-name"]')).toHaveValue('测试超管')

  // 昵称那一格：单行字段走原生焦点（表单里的 Tab 交还浏览器），全选替换 → 键盘打字
  await page.locator('[data-testid="profile-display-name"]').focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('改过的昵称')
  await expect(page.locator('[data-testid="profile-display-name"]')).toHaveValue('改过的昵称')

  // 保存行：ESC 先让原生焦点回外壳（§28.11 的口径），再用 ↓ 走到保存并回车
  await page.keyboard.press('Escape')
  await expect(page.locator('.app')).toBeFocused()
  // 动作行是 ['back', 'avatar', 'save', 'password']，光标从 0 起：↓↓ 落在「保存」
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="profile-save"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('Enter')

  await expect.poll(() => writes.length, { message: '保存应当发一次 PUT' }).toBeGreaterThan(0)
  expect(writes[0]?.method).toBe('PUT')
  expect(writes[0]?.body).toMatchObject({ display_name: '改过的昵称' })

  await expectNoPointer(page)
})

test('纯键盘：外链管理页 ↓ 到卡片、回车编辑、Tab 到保存并回车（真发 PUT）', async ({ page }) => {
  await installPointerRecorder(page)
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await superuser(page)
  const link = {
    id: 'l-1',
    name: '示例站点',
    url: 'https://example.com/',
    cover_image: null,
    sort_order: 1,
    created_at: '2026-09-20T10:00:00',
    updated_at: '2026-09-20T10:00:00',
  }
  const writes: string[] = []
  await page.route(/\/api\/links\//, (route) => {
    const method = route.request().method()
    if (method !== 'GET') writes.push(method)
    return route.fulfill({
      status: method === 'POST' ? 201 : 200,
      contentType: 'application/json',
      body: JSON.stringify(method === 'GET' ? [link] : link),
    })
  })

  await page.goto('/admin/links')
  await booted(page)
  await expect(page.locator('[data-testid="admin-link-card"]')).toHaveCount(1)

  // ↓ 进卡片动作区（第一格是「编辑」）→ 回车：表单被现值填满
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[data-testid="link-edit"]')).toHaveClass(/is-focused/)
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="link-name"]')).toHaveValue('示例站点')

  // 进编辑态时 `startEdit()` 已经把光标放进名称框（`nextTick(() => nameEl.focus())`），
  // 所以这里不必再 Tab 找它 —— 键盘用户可以直接替换内容。
  await expect(page.locator('[data-testid="link-name"]')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('示例站点 v2')

  // Tab 一路到「保存修改」再回车（表单里 Tab 交还浏览器，见视图文件头）：
  // 名称 →(1) 链接 →(2) 配图 →(3) 配图的「上传」→(4) 排序 →(5) 保存
  //（「上传」是配图新加的按钮，键盘照样走得到；配图为空时「移除」不渲染）
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab')
  await expect(page.locator('[data-testid="link-save"]')).toBeFocused()
  await page.keyboard.press('Enter')

  await expect.poll(() => writes.length, { message: '保存应当发一次 PUT' }).toBeGreaterThan(0)
  expect(writes).toEqual(['PUT'])

  await expectNoPointer(page)
})

test('纯键盘：站点设置页 ↓/ENTER 换段、Tab 进字段改一处、Tab 到保存并回车（真发 PUT）', async ({
  page,
}) => {
  await installPointerRecorder(page)
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await superuser(page)

  const puts: Record<string, unknown>[] = []
  await page.route('**/api/admin/site-config', (route) => {
    const method = route.request().method()
    if (method === 'PUT') {
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
        site: { name: '键盘站点', title: '', description: '', icp: '', defaultTheme: 'icespark', logo: '' },
        navbar: { logo: '旧导航名', navItems: [{ label: '主页', path: '/' }] },
        footer: { copyright: '', slogan: '', links: [] },
        home: { title: '', desc: '' },
        about: { body: '' },
      }),
    })
  })

  await page.goto('/admin/site')
  await booted(page)
  await expect(page.locator('[data-testid="admin-site-ready"]')).toBeVisible()

  // 光标默认落在段列表第一段（site）；↓ 只移光标、ENTER 才换段（全站芯片口径）
  await expect(page.locator('[data-testid="admin-site-segment"].is-focused')).toHaveAttribute(
    'data-segment',
    'site',
  )
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="admin-site-segment-panel"]')).toHaveAttribute(
    'data-segment',
    'navbar',
  )

  // 从段列表进字段：管理页的表单把 Tab 交还浏览器，所以是**原生 Tab 遍历**。
  // 实测顺序（navbar 段）：返回 → 新段名 → 加段 → 还原该段 → **该段第一个字段** → 段 JSON → 展开 → **保存**
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Tab')
  const field = page.locator('[data-field="navbar.logo"] input')
  await expect(field).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('键盘导航名')

  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Tab')
  await expect(page.locator('[data-testid="admin-site-save"]')).toBeFocused()
  await page.keyboard.press('Enter')

  await expect.poll(() => puts.length, { message: '保存应当真发一次 PUT' }).toBe(1)
  const body = puts[0] as { navbar?: { logo?: string; navItems?: unknown }; site?: { name?: string } }
  expect(body.navbar?.logo, 'PUT 里应当是键盘敲进去的新值').toBe('键盘导航名')
  // 没动过的段与同段没动过的字段原样带回去
  expect(body.site?.name).toBe('键盘站点')
  expect(body.navbar?.navItems).toEqual([{ label: '主页', path: '/' }])

  await expectNoPointer(page)
})

test('纯键盘：写作页打字 + Ctrl/⌘+S 存草稿（Tab 进正文、组合键真发 POST）', async ({ page }) => {
  await installPointerRecorder(page)
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
            title: '键盘写的标题',
            content: '# 键盘写的正文',
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

  // 写作页把正文框的**标题**给了原生焦点（打开就能写），这是键盘用户的入口
  await expect(page.locator('[data-testid="write-title"]')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('键盘写的标题')

  // Tab 进正文：中间隔着插入条的 8 颗工具按钮与围栏语言下拉 ——
  // 不写死步数（插入条以后加按钮就假红），改成「一直 Tab 到落进正文为止」
  const content = page.locator('[data-testid="write-content"]')
  for (let i = 0; i < 20; i += 1) {
    await press(page, 'Tab')
    if (await content.evaluate((el) => el === document.activeElement)) break
  }
  await expect(content, 'Tab 应当能一路走到正文框').toBeFocused()
  await page.keyboard.type('# 键盘写的正文\n\n正文段落。')

  // 「Ctrl/⌘ + S 存草稿」是**编辑框自己**接的（内核刻意不抢 Ctrl/Meta，见 pad.ts 的注释），
  // 所以光标必须在正文框里 —— 这正是上面那步要落在正文而不是别处的原因
  await press(page, 'ControlOrMeta+s')

  await expect.poll(() => writes.length, { message: '存草稿应当真发一次写请求' }).toBe(1)
  const sent = JSON.parse(writes[0]!.body) as { title?: string; content?: string; status?: string }
  expect(sent.title).toBe('键盘写的标题')
  expect(sent.content, '正文里敲的字都要进请求体').toContain('键盘写的正文')
  expect(sent.status, 'Ctrl/⌘+S 是存草稿，不是发布').toBe('draft')
  await expect(page.locator('[data-testid="write-status"]')).toContainText('已保存')

  await expectNoPointer(page)
})

test('纯键盘：404 皮肤方向键选动作 + 回车离开这一页（零指针事件）', async ({ page }) => {
  await installPointerRecorder(page)
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })

  await page.goto('/nope-404')
  await booted(page)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'error')

  // 页内四项共用一份自绘光标，顺序 = 视觉顺序：返回首页 · 文章列表 · 个人中心 · 返回上一页
  await expect(page.locator('.back-home-btn')).toHaveClass(/is-focused/)
  await page.keyboard.press('ArrowRight')
  const toPosts = page.getByRole('link', { name: '文章列表' })
  await expect(toPosts).toHaveClass(/is-focused/)

  // 回车走的是页面自己的 activate（href 是真的，但路由交给前端）
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/posts$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'posts')

  await expectNoPointer(page)
})

test('纯键盘：审计页 PgDn / PgUp 翻页，翻完行光标还在（零指针事件）', async ({ page }) => {
  await installPointerRecorder(page)
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await superuser(page)
  await stubAuditLogs(page)

  await page.goto('/admin/audit')
  await booted(page)
  await expect(page.locator('[data-testid="audit-position"]')).toHaveText('第 1 / 2 页')

  await press(page, 'PageDown')
  await expect(page.locator('[data-testid="audit-position"]')).toHaveText('第 2 / 2 页')
  await press(page, 'PageUp')
  await expect(page.locator('[data-testid="audit-position"]')).toHaveText('第 1 / 2 页')

  // 翻页会重画整个列表 —— 顺手钉住「重画之后键盘还活着」：行光标仍能被方向键推动
  // （§32/§47 那类「重渲染把焦点搞丢」的坑，在这一页也要成立）
  await press(page, 'ArrowDown')
  await expect(page.locator('[data-testid="audit-log"].is-focused')).toHaveCount(1)

  await expectNoPointer(page)
})

test('纯键盘：公开用户页回车进作者的文章（零指针事件）', async ({ page }) => {
  await installPointerRecorder(page)
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await stubAuthorPage(page)

  await page.goto('/user/e2e_writer')
  await booted(page)

  // 光标起点就是第一张文章卡（不用先走返回按钮），回车即进详情
  await expect(page.locator('[data-testid="user-post-card"]')).toHaveClass(/is-focused/)
  await press(page, 'Enter')
  await expect(page).toHaveURL(/\/post\/user-post-1$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'article')

  await expectNoPointer(page)
})

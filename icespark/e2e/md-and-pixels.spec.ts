import { expect, test, type Page } from '@playwright/test'

import { booted } from './helpers'

/**
 * 两簇「样机踩过坑、生产只有等价替代或完全没门」的回归事实：
 *
 *   ① markdown 正文渲染（`src/signal/MarkdownBody.vue`）
 *      —— 样机的正文是三段夹具 + 一个第三方渲染器；生产版换成了 markdown-it + DOMPurify
 *      白名单。白名单裁错一项的表现是**静默少显示**（表格没了、代码块变纯文本），
 *      没有报错，只能靠断言钉住。样机口径见 `design/icespark-prototype/e2e/smoke.mjs`
 *      第 145–161 行那三条。
 *
 *   ② 设计系统的像素 / 版式事实（`src/styles/pixel.css`、`src/views/PostListView.vue`、
 *      `src/views/PostDetailView.vue`、`src/App.vue`）
 *      —— 样机第 4 轮（无封面卡换版式）、第 5 轮（删掉左侧竖列、keybar 常驻）、
 *      焦点口径（`design/icespark-prototype/e2e/gates.mjs` 第 65–130 行）都是用户逐条
 *      反馈定下来的；生产版的视图是**懒加载**的（组件样式注入顺序与样机相反），
 *      这类「样式源序一变就静默失效」的坑正是本文件要守的。
 *
 * 三条自我约束（与 pages.spec.ts / palette.spec.ts 同一条规矩）：
 *   1. **全程打桩，不依赖真账号、不依赖后端有数据**。夹具正文与文章列表都在本文件里，
 *      接口由 `page.route` 现造。
 *   2. **颜色一律拿 token 对照**，断言里不写死色值（色值只住在 `src/styles/tokens.ts`）。
 *      读法与 palette.spec.ts 一致：先在 `document.documentElement` 上确认 token 有值，
 *      再交给浏览器把它归一成 `rgb()` 与元素计算值对比。
 *   3. **开机自检先让位**：每次 `goto` 之后都 `await booted(page)`（见 helpers.ts），
 *      否则首次按键 / 交互会被自检吃掉。
 */

/* ══════════════════════════════════════════════════════════════
   固定夹具（不依赖后端）
   ══════════════════════════════════════════════════════════════ */

const FIXTURE_SLUG = 'md-pixel-fixture'
const FIXTURE_ID = '11111111-2222-3333-4444-555555555555'
const COVER_SLUG = 'cover-pixel-fixture'
const COVER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

/**
 * 1×1 的 GIF data URI：有封面卡必须真的**加载成功**。
 * 不能用假 URL —— `<img>` 一旦报错，ImageFrame 会 `emit('error')` →
 * `markCoverFailed()` → 这张卡当场从「有封面」翻成「文字卡」版式，
 * 于是「有 / 无封面两套版式」的对照就没了（这正是 scene/cover.ts 的用意）。
 */
const COVER_DATA_URI =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/**
 * 夹具正文：一条 markdown 覆盖 A 组四条断言所需的全部语法 ——
 * `##` 标题（≥2 个）、带语言的围栏代码块、标准表格、站内链接。
 * 末尾再灌 30 段正文把页面撑高，好让「滚动之后 keybar 仍在视口内」这条真的有滚动发生。
 */
const FIXTURE_MD = [
  '# 夹具：像素是外壳，文档是本体',
  '',
  '## 第一节 · markdown 渲染门',
  '',
  '正文里的站内链接：[另一篇夹具文章](/post/another-fixture)；外链交给浏览器：[示例站](https://example.com/)。',
  '',
  '```ts',
  'const PX = 8',
  '',
  'export function grid(n: number): number {',
  '  return n * PX',
  '}',
  '```',
  '',
  '## 第二节 · 表格与滚动',
  '',
  '| 键位 | 作用 |',
  '| --- | --- |',
  '| PgUp | 上一页 |',
  '| PgDn | 下一页 |',
  '',
  '### 小节 2.1',
  '',
  ...Array.from(
    { length: 30 },
    (_, i) =>
      `第 ${i + 1} 段填充正文：把正文撑高，让「滚动之后快捷键指南仍在视口内」这条断言真的有滚动发生。`,
  ),
].join('\n')

/** 列表夹具的一篇：默认无封面（走文字卡版式） */
function listItem(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: FIXTURE_ID,
    slug: FIXTURE_SLUG,
    title: '夹具：无封面文字卡',
    introduction: '夹具简介，用来占住正文栏的高度。',
    cover_image: null,
    author_name: '夹具作者',
    author_avatar: null,
    author_type: 'agent',
    created_at: '2026-02-03T04:05:06Z',
    view_count: 12,
    like_count: 3,
    group_name: '夹具分组',
    tags: ['夹具'],
    status: 'published',
    ...overrides,
  }
}

/** 一篇文章（详情页正文用它） */
const ARTICLE = listItem({ content: FIXTURE_MD, cover_image: null })

/** 列表页两篇：一篇无封面、一篇有封面 —— 「两套版式」必须能直接对照 */
const LIST_ITEMS: Record<string, unknown>[] = [
  listItem({}),
  listItem({ id: COVER_ID, slug: COVER_SLUG, title: '夹具：有封面卡', cover_image: COVER_DATA_URI }),
]

/* ══════════════════════════════════════════════════════════════
   打桩
   ══════════════════════════════════════════════════════════════ */

/**
 * 只注册**一条**正则 route，内部按 `pathname` 分派。
 *
 * 为什么不写多条：Playwright 里多条 route 同时命中时**只有最后注册的那条生效**，
 * 前面那条被静默吞掉（排查起来像「桩没生效」），所以全部收口在这一条里。
 *
 * 拦的不止 `/api/posts/**`：详情页在拿到文章之后必然再取一次评论
 * （`GET /api/comments/post/{id}`，见 stores/content.ts 的 loadPost）。
 * 不桩它的话，夹具的假 id 会打到真后端拿 404，而 loadPost 的 catch 会把
 * **整篇文章**落成空态（正文直接消失）—— 那就成了「依赖后端恰好没有这条评论」。
 */
async function stubIcesparkApi(page: Page): Promise<void> {
  await page.route(/\/api\/(posts|comments)\//, async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    // 评论：夹具文章固定「还没有人留言」
    if (pathname.startsWith('/api/comments/')) {
      await json({ total: 0, comments: [] })
      return
    }

    // 详情：`/api/posts/slug/<slug>`（非 UUID 走这条）或 `/api/posts/<id>`
    if (/^\/api\/posts\/(slug\/)?[^/]+$/.test(pathname)) {
      await json(ARTICLE)
      return
    }

    // 其余（`/api/posts/`、`/api/posts/?limit=…`）按列表返回
    await json({ items: LIST_ITEMS, total: LIST_ITEMS.length })
  })
}

test.beforeEach(async ({ page }) => {
  // 关掉首访的「要不要开音效」询问框：它不是本文件要验的东西，却会挡在每次交互前面
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await stubIcesparkApi(page)
})

/* ══════════════════════════════════════════════════════════════
   开场助手
   ══════════════════════════════════════════════════════════════ */

/** 打开文章列表（两篇夹具：一无封面、一有封面） */
async function openList(page: Page): Promise<void> {
  await page.goto('/posts')
  await booted(page)
  await expect(page.locator('[data-testid="post-card"]')).toHaveCount(LIST_ITEMS.length)
}

/** 打开夹具文章的详情页 */
async function openArticle(page: Page): Promise<void> {
  await page.goto(`/post/${FIXTURE_SLUG}`)
  await booted(page)
  await expect(page.locator('[data-testid="md-body"]')).toBeVisible()
}

/**
 * 把 token 交给浏览器解析成与元素计算值**同一种写法**，避免把色值写死进断言。
 *
 * 读法照 palette.spec.ts：`document.documentElement` 上的 `--x` 是**原始声明值**
 * （`#6FBCE0` 这种），而元素计算值是 `rgb(111, 188, 224)`；两者不能直接比。
 * 所以先确认 token 在 `:root` 上有非空值（漏注入 token 时整条声明会按「计算值无效」
 * 处理，是最难发现的一类静默失效），再让浏览器把 `var(--x)` 归一成计算值返回。
 */
async function resolveToken(page: Page, name: string): Promise<string> {
  const result = await page.evaluate((token) => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    const probe = document.createElement('div')
    probe.style.backgroundColor = `var(${token})`
    document.body.appendChild(probe)
    const computed = getComputedStyle(probe).backgroundColor
    probe.remove()
    return { raw, computed }
  }, name)

  expect(result.raw, `token ${name} 必须在 :root 上解析出非空值`).not.toBe('')
  return result.computed
}

/**
 * 让某张卡拿到焦点（鼠标 hover 与键盘走的是同一个共享焦点，见 input/focus.ts）。
 *
 * 先等整屏转场遮罩撤掉：遮罩会在导航后 280ms 内盖住画面，鼠标落上去时卡片收不到 hover。
 */
async function focusCardByHover(page: Page, index: number) {
  await expect(page.locator('.trans')).toHaveCount(0)
  const card = page.locator('[data-testid="post-card"]').nth(index)
  await card.hover()
  await expect(card).toHaveClass(/is-focused/)
  return card
}

/* ══════════════════════════════════════════════════════════════
   ① markdown 正文渲染
   ══════════════════════════════════════════════════════════════ */

test.describe('① markdown 正文渲染（MarkdownBody.vue + DOMPurify 白名单）', () => {
  test('标题：正文里的二级标题至少渲染出 2 个 h2', async ({ page }) => {
    await openArticle(page)

    // `h2` 在 PURIFY_TAGS 白名单里；裁掉它不会报错，只会静默少显示
    await expect(page.locator('[data-testid="md-body"] h2')).toHaveCount(2)
    await expect(page.locator('[data-testid="md-body"] h2').first()).toHaveText('第一节 · markdown 渲染门')
  })

  test('代码块：围栏渲染出 .md-fence，且里面真的是 pre > code', async ({ page }) => {
    await openArticle(page)

    const fence = page.locator('[data-testid="md-body"] .md-fence')
    await expect(fence).toHaveCount(1)
    // 语言铭牌挂在容器上（样式靠 attr(data-lang) 取它，不放行这个属性标签会静默消失）
    await expect(fence).toHaveAttribute('data-lang', 'ts')
    // 结构必须是 pre > code（DOMPurify 白名单同时放行 div/pre/code 三者）
    await expect(fence.locator('pre > code')).toHaveCount(1)
  })

  test('表格：渲染出 table，且首行单元格是 th（表头没被裁成 td）', async ({ page }) => {
    await openArticle(page)

    const table = page.locator('[data-testid="md-body"] table')
    await expect(table).toHaveCount(1)

    // 逐格看第一行的标签名，而不是只数 th 的个数：表头整行没了的失败信息要能一眼定位
    const firstRowTags = await table.evaluate((el) => {
      const row = el.querySelector('tr')
      return row ? Array.from(row.children).map((cell) => cell.tagName) : []
    })
    expect(firstRowTags, '表格首行必须是表头单元格').toEqual(['TH', 'TH'])
    await expect(table.locator('thead th')).toHaveCount(2)
  })

  test('站内链接：正文里的 /post/ 链接渲染成 a[href^="/post/"]，并接上全站焦点视觉', async ({ page }) => {
    await openArticle(page)

    const innerLink = page.locator('[data-testid="md-body"] a[href^="/post/"]')
    // 这一条同时是「正文里确实有站内链接」的事实：夹具正文第一篇就有
    await expect(innerLink).toHaveCount(1)
    await expect(innerLink).toHaveText('另一篇夹具文章')
    // 渲染出的链接挂 .focusable（见 MarkdownBody.vue 的 link_open 规则），才吃得到那套 8bit 光标
    await expect(innerLink).toHaveClass(/focusable/)

    // 站内链接被接管成前端路由跳转（不是整页刷新）
    await innerLink.click()
    await expect(page).toHaveURL(/\/post\/another-fixture$/)
  })
})

/* ══════════════════════════════════════════════════════════════
   ② 设计系统的像素 / 版式事实
   ══════════════════════════════════════════════════════════════ */

test.describe('② 设计系统：像素 / 版式事实', () => {
  test('屏幕底色是白：screen 的背景色等于 --paper，且不是透明', async ({ page }) => {
    await openList(page)

    const paper = await resolveToken(page, '--paper')
    const background = await page
      .locator('[data-testid="screen"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor)

    // 解析后的实际值：rgb(255, 255, 255)（见交付报告）
    expect(background, '屏幕底色必须等于 --paper').toBe(paper)
    // 白底与「没画底」在 computed 上都是浅色，只差一个 alpha：这条专防后者
    expect(background, '屏幕底色不能是透明（透明说明底色根本没画出来）').not.toBe(
      'rgba(0, 0, 0, 0)',
    )
  })

  test('卡片边框真的画出来了：3px solid --blue-400，且颜色不等于卡片背景色', async ({ page }) => {
    await openList(page)

    const blue400 = await resolveToken(page, '--blue-400')
    const card = await page.locator('[data-testid="post-card"]').first().evaluate((el) => {
      const cs = getComputedStyle(el)
      return {
        top: cs.borderTopWidth,
        right: cs.borderRightWidth,
        bottom: cs.borderBottomWidth,
        left: cs.borderLeftWidth,
        style: cs.borderTopStyle,
        color: cs.borderTopColor,
        background: cs.backgroundColor,
      }
    })

    // var() 失效时 `border` 简写会被整条重置成 none：宽度变 0px、样式变 none
    expect(`${card.top} ${card.style}`, '边框宽度/线型').toBe('3px solid')
    expect([card.right, card.bottom, card.left], '四边都要画出来').toEqual(['3px', '3px', '3px'])
    expect(card.color, '边框颜色必须取 --blue-400').toBe(blue400)
    // 「看得见」：边框颜色等于背景色就等于没画
    expect(card.color, '边框颜色不能等于卡片背景色').not.toBe(card.background)
  })

  test('无封面卡走另一套版式：is-text、没有 img-frame、有 card-side 数据脊、标题字号更大', async ({ page }) => {
    await openList(page)

    const textCard = page.locator('[data-testid="post-card"].is-text')
    const coverCard = page.locator('[data-testid="post-card"]:not(.is-text)')
    await expect(textCard).toHaveCount(1)
    await expect(coverCard).toHaveCount(1)

    // 样机第 4 轮的坑：「没有封面」曾被做成「留一个空图片位」。
    // 用户的定稿是**换一套版式**，而不是在卡片里留洞 —— ImageFrame 无图时整个组件不输出。
    await expect(textCard.locator('.img-frame'), '无封面卡不许出现图片位').toHaveCount(0)
    await expect(coverCard.locator('.img-frame'), '有封面卡必须真的有画框').toHaveCount(1)

    // 另一套版式的可见证据：右侧立了一列「数据脊」（.card-side 上的日期 / 阅读 / 点赞）
    await expect(textCard.locator('.card-side')).toHaveCount(1)
    await expect(coverCard.locator('.card-side')).toHaveCount(0)

    // 正文栏收窄之后标题放大（源码：.card.is-text .card-title = 24px / .card-title = 17px）
    const textSize = await textCard
      .locator('.card-title')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    const coverSize = await coverCard
      .locator('.card-title')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(textSize, `无封面卡标题字号（${textSize}px）必须明显大于有封面卡（${coverSize}px）`).toBeGreaterThan(
      coverSize,
    )
  })

  test('焦点光标：蓝色实心块、左右各一块、8px 宽、走 blink-step 离散闪烁', async ({ page }) => {
    await openList(page)

    const blue500 = await resolveToken(page, '--blue-500')
    const card = await focusCardByHover(page, 1)

    const cursor = await card.evaluate((el) => {
      const before = getComputedStyle(el, '::before')
      const after = getComputedStyle(el, '::after')
      return {
        beforeWidth: before.width,
        beforeHeight: before.height,
        beforeColor: before.backgroundColor,
        beforeAnimation: before.animationName,
        beforeContent: before.content,
        beforeLeft: before.left,
        afterWidth: after.width,
        afterRight: after.right,
        afterColor: after.backgroundColor,
        afterAnimation: after.animationName,
      }
    })

    // 光标是画出来的（content 非 none），不是只写了尺寸
    expect(cursor.beforeContent, '::before 必须真的生成伪元素').not.toBe('none')
    expect(cursor.beforeWidth, '::before 宽度').toBe('8px')
    expect(cursor.afterWidth, '::after 宽度').toBe('8px')
    expect(cursor.beforeHeight, '::before 高度').toBe('16px')
    expect(cursor.beforeColor, '::before 必须是 --blue-500 的实心块').toBe(blue500)
    expect(cursor.afterColor, '::after 必须是 --blue-500 的实心块').toBe(blue500)
    // 左右各一块：一块贴左内壁（3px）、一块贴右内壁（3px）
    expect(cursor.beforeLeft, '左侧光标贴左内壁').toBe('3px')
    expect(cursor.afterRight, '右侧光标贴右内壁').toBe('3px')
    // 动画必须是离散关键帧，不是淡入淡出
    expect(cursor.beforeAnimation, '光标闪的是 blink-step').toBe('blink-step')
    expect(cursor.afterAnimation, '光标闪的是 blink-step').toBe('blink-step')
  })

  test('焦点不给额外粗描边：outline 不画出来，且边框仍是 3px（没有为焦点加粗）', async ({ page }) => {
    await openList(page)

    const focused = await focusCardByHover(page, 0)
    const unfocused = page.locator('[data-testid="post-card"]').nth(1)

    const styles = await focused.evaluate((el) => {
      const cs = getComputedStyle(el)
      return {
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
        borderTop: cs.borderTopWidth,
        borderBottom: cs.borderBottomWidth,
        borderLeft: cs.borderLeftWidth,
        borderRight: cs.borderRightWidth,
      }
    })
    const unfocusedBorder = await unfocused.evaluate((el) => getComputedStyle(el).borderTopWidth)

    // 实测（本机 chromium）：`outlineWidth` 是 **3px** 而不是 0px —— `.focusable { outline: none }`
    // 这条简写只显式写了 style，width 因此停在浏览器初始值 `medium`（= 3px）。
    // 真正决定「画不画」的是 **outline-style**：为 none 时一条 outline 都不渲染，
    // 所以「没有额外粗描边」的正确不变量是 style === none（样机 gates.mjs 第 123–127 行
    // 同样用 `outlineStyle === 'none' || outlineWidth === '0px'` 的或式，就是这个原因）。
    expect(
      styles.outlineStyle,
      `焦点卡不许画出 outline（实测 outlineWidth=${styles.outlineWidth}，但样式为 none 时不会渲染）`,
    ).toBe('none')

    // 「不为焦点加粗」：四边仍是 3px，且与未聚焦的卡完全一样
    expect(
      [styles.borderTop, styles.borderRight, styles.borderBottom, styles.borderLeft],
      '焦点卡四边仍旧 3px',
    ).toEqual(['3px', '3px', '3px', '3px'])
    expect(styles.borderTop, '焦点卡的边框宽度不能与未聚焦卡不同').toBe(unfocusedBorder)
  })

  test('keybar 常驻：文章页可见，滚动正文之后依旧贴在屏幕下沿、仍在视口内', async ({ page }) => {
    await openArticle(page)

    const keybar = page.locator('[data-testid="keybar"]')
    await expect(keybar).toBeVisible()
    await expect(keybar).toHaveCSS('position', 'sticky')

    // 正文必须真的能滚：否则「滚动后仍在视口内」是句空话
    const scrolled = await page.evaluate(() => {
      const inner = document.querySelector('.screen-inner') as HTMLElement
      inner.scrollTop = 600
      return { scrollTop: inner.scrollTop, scrollHeight: inner.scrollHeight, clientHeight: inner.clientHeight }
    })
    expect(scrolled.scrollHeight, '夹具正文要比一屏高').toBeGreaterThan(scrolled.clientHeight)
    expect(scrolled.scrollTop, '正文确实滚下去了').toBeGreaterThan(0)

    await expect(keybar).toBeVisible()
    const keybarBox = await keybar.boundingBox()
    const screenBox = await page.locator('[data-testid="screen"]').boundingBox()
    const viewport = page.viewportSize()
    expect(keybarBox, 'keybar 必须有盒子').not.toBeNull()
    expect(screenBox, 'screen 必须有盒子').not.toBeNull()
    expect(viewport, '需要一个视口尺寸').not.toBeNull()

    // 直接量「贴在屏幕下沿」：sticky bottom:0 停在滚动容器底部，
    // 与 .screen 下沿只差一条 3px 边框
    const keybarBottom = keybarBox!.y + keybarBox!.height
    expect(
      Math.abs(keybarBottom - (screenBox!.y + screenBox!.height)),
      `keybar 下沿（${keybarBottom}）应贴在屏幕下沿（${screenBox!.y + screenBox!.height}）`,
    ).toBeLessThanOrEqual(4)

    // 并且真的落在视口里（而不是滚到屏幕外面去了）
    expect(
      keybarBottom,
      `keybar 下沿（${keybarBottom}）必须在视口内（视口高 ${viewport!.height}）`,
    ).toBeGreaterThan(viewport!.height - 200)
  })

  test('旧的左侧竖列已消失：.side 计数为 0（样机第 5 轮删掉的版式不许回来）', async ({ page }) => {
    await openArticle(page)

    // 负向断言：左侧竖列（作者 / 点赞 / 评论 / 返回）在窄屏上只会把正文挤成一条，
    // 第 5 轮定稿是「标题下的横向操作条」取代它。
    await expect(page.locator('.side')).toHaveCount(0)
    // 替代品在位：横向操作条
    await expect(page.locator('[data-testid="actions"]')).toBeVisible()

    // 列表页同样不该有竖列
    await openList(page)
    await expect(page.locator('.side')).toHaveCount(0)
  })
})

test('版式：长标题在任何宽度下都不被裁（缩的是摘要，不是标题）', async ({ page }) => {
  await stubIcesparkApi(page)

  // 长到必然折行的标题：中文长句 + 一段**没有空格**的长 token（URL 那种）
  const longTitle =
    '这是一条很长的标题，用来验证它在窄屏下也不会被吃掉：像素风博客列表的标题允许长到四五' +
    '行以上，宁可把卡片顶高，也不能像摘要那样补个省略号了事https://example.com/very/long/unbreakable/token/aaaa'
  // 摘要必须长到「任何宽度下都超过它的 clamp 行数」—— 文字卡是 5 行，
  // 所以这里要灌得足够多，否则反向对照会因为「其实没超」而假红（本门踩过一次）
  const longIntro =
    '摘要可以缩：这条摘要有意写得很长，长到 clamp 装不下，好证明「缩的是摘要」这件事本身没坏。'.repeat(6)

  await page.route(/\/api\/posts\//, (route) => {
    const pathname = new URL(route.request().url()).pathname
    const body = pathname.startsWith('/api/comments/')
      ? { total: 0, comments: [] }
      : {
          items: [listItem({ title: longTitle, introduction: longIntro, cover_image: null })],
          total: 1,
        }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })

  for (const width of [1280, 900, 640]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/posts')
    await booted(page)

    const title = page.locator('[data-testid="post-card"] .card-title').first()
    await expect(title).toBeVisible()
    // 文字一个字都没少（被裁的典型症状是 textContent 还在、渲染上却看不见）
    await expect(title).toHaveText(longTitle)

    const metrics = await title.evaluate((el) => {
      const node = el as HTMLElement
      const style = getComputedStyle(node)
      return {
        scrollW: node.scrollWidth,
        clientW: node.clientWidth,
        scrollH: node.scrollHeight,
        clientH: node.clientHeight,
        lines: Math.round(node.getBoundingClientRect().height / parseFloat(style.lineHeight)),
        whiteSpace: style.whiteSpace,
      }
    })

    // 横向不许溢出（长 token 要在框内换行，而不是把卡片撑破）
    expect(metrics.scrollW, `${width}px 下标题横向溢出了`).toBeLessThanOrEqual(metrics.clientW + 1)
    // 纵向不许被切（旧行为是 clamp 到 3 行 —— 用户第七轮明确否掉了）
    expect(metrics.scrollH, `${width}px 下标题纵向被切了`).toBeLessThanOrEqual(metrics.clientH + 1)
    expect(metrics.lines, `${width}px 下长标题应当超过 3 行（说明没被 clamp）`).toBeGreaterThan(3)
  }

  // 反向对照：**摘要**是故意截断的（`line-clamp` 补省略号）—— 证明上面那条不是「谁都不裁」的空转
  await page.setViewportSize({ width: 640, height: 800 })
  const introClamped = await page
    .locator('[data-testid="post-card"] .card-intro')
    .first()
    .evaluate((el) => (el as HTMLElement).scrollHeight > (el as HTMLElement).clientHeight + 1)
  expect(introClamped, '摘要按设计是要截断的（这条是标题那条断言的反向对照）').toBe(true)
})

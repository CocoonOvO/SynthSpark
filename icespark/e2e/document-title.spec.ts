import { expect, test, type Page } from '@playwright/test'

import { booted } from './helpers'

/**
 * **浏览器标题与页面描述**（用户 2026-10-01 裁决；实现见 `src/frame/documentMeta.ts`）。
 *
 * 口径：`<title>` = **`页面名 · 站点名`**，站点名与描述都取自**三级合并后的配置**
 * （后台改站名，标签页跟着变），页面名默认取路由 `meta.title`；文章页 / 用户主页
 * 这类「打开才知道名字」的页面由 `usePageTitle()` 覆盖。此前 `meta.title` 是**没人消费的
 * 死数据**、`site.name` / `site.description` 是「能填但不显示」的字段，这一批一起接上了。
 *
 * 写法沿用 `site-config.spec.ts` 的自我约束：**不断言写死的字**，而是从运行期取当前
 * 生效的最高优先级覆盖层，再拿它核对页面上的值。取不到任何覆盖层（全新克隆）时，
 * 站点名那一半退回「只验形状」（页面名 + ` · ` + 非空）。
 */

interface SiteCopy {
  name: string
  description: string
}

/** 取当前生效的最高优先级覆盖层里的站点名与描述；两层都取不到返回 null */
async function siteCopy(page: Page): Promise<SiteCopy | null> {
  return page.evaluate(async () => {
    for (const url of ['/api/site-config', '/site.config.json']) {
      try {
        const response = await fetch(url, { headers: { accept: 'application/json' } })
        if (!response.ok) continue
        if (!(response.headers.get('content-type') ?? '').includes('json')) continue
        const data = (await response.json()) as { site?: { name?: string; description?: string } }
        if (!data.site) continue
        return { name: data.site.name ?? '', description: data.site.description ?? '' }
      } catch {
        // 取不到就试下一层
      }
    }
    return null
  })
}

/** 断言标题形状：`<页面名> · <站点名>`（站点名未知时只验「有分隔符且后缀非空」） */
async function expectTitle(
  page: Page,
  pageName: string,
  copy: SiteCopy | null,
): Promise<void> {
  const title = await page.title()
  if (copy && copy.name.trim() !== '') {
    expect(title, `${pageName} 的标题应当带上配置里的站点名`).toBe(
      `${pageName} · ${copy.name.trim()}`,
    )
    return
  }
  expect(title.startsWith(`${pageName} · `), `标题应以「${pageName} · 」开头，实际 ${title}`).toBe(
    true,
  )
  expect(title.slice(pageName.length + 3).trim().length).toBeGreaterThan(0)
}

test('逐页标题：`页面名 · 站点名`，两个名字分别来自路由表与配置', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('synthspark-icespark-sound-prompt', '1'))
  await page.goto('/')
  await booted(page)
  const copy = await siteCopy(page)

  const pages = [
    ['/', '首页'],
    ['/posts', '文章'],
    ['/links', '关联'],
    ['/about', '关于'],
    ['/nope-404', '页面不存在'],
  ] as const

  for (const [path, name] of pages) {
    await page.goto(path)
    await booted(page)
    await expectTitle(page, name, copy)
  }
})

test('文章页标题跟着文章走，离开后回到路由表那一页的名字', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('synthspark-icespark-sound-prompt', '1'))
  await page.goto('/')
  await booted(page)
  const copy = await siteCopy(page)

  const post = {
    id: 'p-title',
    slug: 'title-fixture',
    title: '标题夹具 · 一篇有名字的文章',
    introduction: '摘要',
    content: '# 正文\n\n内容。',
    cover_image: null,
    status: 'published',
    author_id: 'u-1',
    author_name: '作者',
    author_username: 'e2e_writer',
    author_avatar: null,
    author_type: 'user',
    tags: [],
    group_id: null,
    group_name: null,
    view_count: 0,
    like_count: 0,
    created_at: '2026-09-20T10:00:00',
    updated_at: '2026-09-20T10:00:00',
    published_at: '2026-09-20T10:00:00',
  }
  await page.route(/\/api\/(posts|comments)\//, (route) => {
    const path = new URL(route.request().url()).pathname
    const body = path.startsWith('/api/comments/')
      ? { total: 0, comments: [] }
      : /^\/api\/posts\/(slug\/)?[^/]+$/.test(path)
        ? post
        : { items: [post], total: 1 }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })
  })

  await page.goto('/post/title-fixture')
  await booted(page)
  // 文章标题要等接口回来才进标题栏 —— 用可重试断言等它
  await expect(page.locator('.doc-title')).toHaveText(post.title)
  await expect
    .poll(() => page.title(), { message: '标题应当变成文章名 + 站点名' })
    .toContain(post.title)

  await page.goto('/posts')
  await booted(page)
  await expectTitle(page, '文章', copy)
})

test('页面描述：<meta name="description"> 等于配置里的站点描述', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('synthspark-icespark-sound-prompt', '1'))
  await page.goto('/')
  await booted(page)

  const copy = await siteCopy(page)
  const meta = page.locator('head meta[name="description"]')

  if (!copy || copy.description.trim() === '') {
    // 配置没给描述：那就**不该**挂一个空的上去（空描述会被搜索引擎当成"没描述"）
    await expect(meta).toHaveCount(0)
    return
  }
  await expect(meta).toHaveAttribute('content', copy.description.trim())
  await expect(meta).toHaveCount(1)
})

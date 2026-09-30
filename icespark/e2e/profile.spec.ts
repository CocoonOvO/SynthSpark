import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

import { scanViolations } from './a11y-known'

import { booted } from './helpers'

/**
 * P5 个人信息编辑页（`/profile`）的用例（架构 §23.4 的三条手法）。
 *
 * 三条自我约束：
 * 1. **不写死真令牌 / 真密码**：`e2e-token` 是假串，改密码用的 `e2e-old-pass` 之类也是编的；
 *    所有接口都用 `page.route()` 换成夹具 —— 假令牌打真接口只会拿到 401。
 * 2. **登录态与打桩函数写在本文件里**，`e2e/helpers.ts` 一个字不动（并行任务共用那个文件）。
 * 3. **不追求「全站唯一真相」**：断言只钉契约里写死的东西（字段名、请求体形状、四态文案方向），
 *    文案细节（比如「已保存」四个字）钉住是为了防回归，不是设计文档。
 *
 * 覆盖（7 条）：深链接读态 · 保存只带改动字段 + 成功反馈 + 外壳登录态同步 ·
 * 保存失败把后端 detail 原文摆出来 · `fetchMe` 401 的人话态 · 原生焦点与方向键的等价性 ·
 * 标题层级 + axe · 改密码（前端拦截 + query string）。
 */

/** 夹具：一份「后端现在记着的」账号资料（编造值，不含任何真凭据） */
interface Me {
  username: string
  email: string
  display_name: string
  avatar_url: string
  bio: string
}

const ME: Me = {
  username: 'e2e_user',
  email: 'e2e-old@example.com',
  display_name: '旧昵称',
  avatar_url: '',
  bio: '旧简介',
}

/** 契约 `User` 里那几个与表单无关的字段（夹具补齐，免得页面按 undefined 处理） */
function fullUser(me: Me): Record<string, unknown> {
  return {
    id: 'e2e-id',
    user_type: 'user',
    is_active: true,
    is_superuser: false,
    created_at: '2026-01-01T00:00:00Z',
    ...me,
  }
}

/** 打桩后的「服务端」状态与收到的请求，用例直接读它做断言 */
interface Stub {
  me: Me
  /** `PUT /api/users/me` 的请求体，按顺序 */
  puts: Record<string, unknown>[]
  /** `POST /api/auth/password/reset` 收到的 query 与 body */
  pwPosts: { query: URLSearchParams; body: string | null }[]
  /** 下一次 PUT 的响应；null = 正常成功 */
  putReply: { status: number; body: unknown } | null
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

/**
 * 登录态 + 打桩（§23.4 手法二）。
 *
 * 两把键都要写：`synthspark-token` 让路由守卫放行，`synthspark-icespark-user` 让外壳立刻有昵称。
 * 另外 `/api/auth/me` **必须**打桩 —— 外壳挂载时会 `bootstrapAuth()` 静默校验一次，
 * 假令牌打真接口拿 401，`stores/auth` 的 `loadMe()` 会登出并清缓存，
 * 表现是「守卫放行了、页面却在未登录态」（实测撞到过）。
 */
async function loggedIn(page: Page, me: Me = { ...ME }): Promise<Stub> {
  const stub: Stub = { me, puts: [], pwPosts: [], putReply: null }

  await page.addInitScript((u) => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
    localStorage.setItem('synthspark-token', 'e2e-token')
    localStorage.setItem(
      'synthspark-icespark-user',
      JSON.stringify({ username: u.username, display_name: u.display_name, is_superuser: false }),
    )
  }, me)

  await page.route(/\/api\/auth\/me$/, (route) => json(route, 200, fullUser(stub.me)))

  await page.route(/\/api\/users\/me/, async (route) => {
    const request = route.request()
    if (request.method() !== 'PUT') {
      await json(route, 200, fullUser(stub.me))
      return
    }

    const payload = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>
    stub.puts.push(payload)

    if (stub.putReply) {
      const reply = stub.putReply
      await json(route, reply.status, reply.body)
      return
    }
    Object.assign(stub.me, payload)
    await json(route, 200, fullUser(stub.me))
  })

  // 改密码：参数在 query string 上，body 必须是空的（契约如此）
  await page.route(/\/api\/auth\/password\/reset/, async (route) => {
    const request = route.request()
    stub.pwPosts.push({
      query: new URLSearchParams(new URL(request.url()).search),
      body: request.postData(),
    })
    await json(route, 200, { success: true })
  })

  return stub
}

/** 运行期零报错（浏览器自己给 4xx 资源打的 console error 不算 —— 那正是打桩要制造的东西） */
function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      errors.push(message.text())
    }
  })
  return errors
}

/** 扫描并返回「不在已知清单里」的违规（清单只有一份：`e2e/a11y-known.ts`，理由见该文件头） */
async function scan(page: Page): Promise<string[]> {
  return scanViolations(await new AxeBuilder({ page }).analyze()).violations
}

test('登录态深链接 /profile：表单里就是接口给的值，标题 / 分节 / 底栏提示都在', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await loggedIn(page)
  await page.goto('/profile')
  await booted(page)

  // 深链接不回落：场景是 profile，URL 还是 /profile，底栏在
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'profile')
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.locator('[data-testid="deck"]')).toBeVisible()

  await expect(page.locator('[data-testid="profile-form"]')).toBeVisible()
  await expect(page.locator('[data-testid="profile-display-name"]')).toHaveValue('旧昵称')
  await expect(page.locator('[data-testid="profile-email"]')).toHaveValue('e2e-old@example.com')
  await expect(page.locator('[data-testid="profile-bio"]')).toHaveValue('旧简介')
  // 用户名只读展示（旧前端的 username 输入框是 disabled 的）
  await expect(page.locator('[data-testid="profile-username"]')).toHaveText('@e2e_user')
  // 两个小节：基本资料 / 修改密码
  await expect(page.locator('[data-testid="profile-password"]')).toBeVisible()
  // 底栏键位提示一行（与首页 / 关于页同一套措辞的「P / ESC 菜单」）
  await expect(page.locator('.foot')).toContainText('P / ESC 菜单')

  expect(errors).toEqual([])
})

test('改一个字段保存：PUT 只带改动过的那个字段，给成功反馈并同步外壳登录态', async ({ page }) => {
  const stub = await loggedIn(page)
  await page.goto('/profile')
  await booted(page)

  await page.locator('[data-testid="profile-display-name"]').fill('新昵称')
  await page.locator('[data-testid="profile-save"]').click()

  await expect(page.locator('[data-testid="profile-saved"]')).toContainText('已保存')

  // 请求体只带改动字段：契约 UserUpdate 是补丁语义，不该顺手把 email / bio 一起回传
  expect(stub.puts).toHaveLength(1)
  expect(stub.puts[0]).toEqual({ display_name: '新昵称' })

  // 外壳登录态也同步了：菜单里账号那一行读的是 auth.displayName（否则还是旧昵称）
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause-account"]')).toContainText('新昵称')
})

test('保存失败：后端 detail 原文（422 校验数组 / 500 字符串两种形状）都摆在页面上，页面不崩', async ({
  page,
}) => {
  const errors = collectErrors(page)
  const stub = await loggedIn(page)
  await page.goto('/profile')
  await booted(page)

  // 形状一：FastAPI 422，detail 是校验错误数组 —— 客户端该抠出第一条的 msg
  stub.putReply = {
    status: 422,
    body: {
      detail: [{ loc: ['body', 'email'], msg: '不是合法的邮箱地址', type: 'value_error' }],
    },
  }
  await page.locator('[data-testid="profile-email"]').fill('not-an-email')
  await page.locator('[data-testid="profile-save"]').click()
  await expect(page.locator('[data-testid="profile-save-error"]')).toContainText(
    '不是合法的邮箱地址',
  )

  // 形状二：500，detail 是字符串
  stub.putReply = { status: 500, body: { detail: '数据库连接不可用' } }
  await page.locator('[data-testid="profile-save"]').click()
  await expect(page.locator('[data-testid="profile-save-error"]')).toContainText('数据库连接不可用')

  // 页面没崩、也没白屏：标题、表单、用户刚输入的值都还在
  await expect(page.locator('h1')).toHaveText('个人信息编辑')
  await expect(page.locator('[data-testid="profile-form"]')).toBeVisible()
  await expect(page.locator('[data-testid="profile-email"]')).toHaveValue('not-an-email')

  expect(errors).toEqual([])
})

test('fetchMe 401（令牌失效）：给一条人话，不白屏也不当后端故障', async ({ page }) => {
  const stub = await loggedIn(page)
  // 后注册的路由先匹配：把读自己资料改成 401（外壳那条 /api/auth/me 仍是 200，守卫照常放行）
  await page.route(/\/api\/users\/me/, (route) => json(route, 401, { detail: '无效的认证凭证' }))
  await page.goto('/profile')
  await booted(page)

  await expect(page.locator('[data-testid="profile-guest"]')).toBeVisible()
  await expect(page.locator('[data-testid="profile-guest"]')).toContainText('登录状态')
  // 空态，不是错误态、也不留半张表单
  await expect(page.locator('[data-testid="profile-error"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="profile-form"]')).toHaveCount(0)
  // 可见 h1 仍然在（这一页自带标题）
  await expect(page.locator('h1')).toHaveText('个人信息编辑')
  expect(stub.puts).toHaveLength(0)
})

test('原生焦点与方向键的等价性：Tab 进输入框能打字，方向键不把焦点弄丢、键盘不失活', async ({
  page,
}) => {
  await loggedIn(page)
  await page.goto('/profile')
  await booted(page)
  await expect(page.locator('[data-testid="profile-form"]')).toBeVisible()

  // 从外壳根节点出发，用浏览器原生 Tab 走进表单（这一页没有标签栏，外壳把 Tab 让给浏览器）
  await page.locator('.app').focus()
  const name = page.locator('[data-testid="profile-display-name"]')
  let reached = false
  for (let i = 0; i < 24 && !reached; i++) {
    await page.keyboard.press('Tab')
    reached = await name.evaluate((el) => el === document.activeElement)
  }
  expect(reached, 'Tab 应该能走到昵称输入框').toBe(true)

  // 输入框里按键不劫持：打字就是打字（方向键也不会被页面吃掉）
  await page.keyboard.type('E2E 昵称')
  await expect(name).toHaveValue('E2E 昵称')

  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    await page.keyboard.press(key)
    const where = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return {
        testid: el?.dataset?.testid ?? '',
        inShell: !!el && el !== document.body && document.querySelector('.app')!.contains(el),
      }
    })
    expect(where.inShell, `${key} 之后焦点不能掉出外壳`).toBe(true)
    expect(where.testid, `${key} 之后焦点还在输入框里`).toBe('profile-display-name')
  }
  await expect(name).toHaveValue('E2E 昵称')
  await expect(page.locator('.app')).toHaveAttribute('data-scope', 'scene')

  // 另一条路径：焦点落在真实按钮上（自绘光标管不到它）再按方向键 ——
  // 页面必须把焦点收回外壳根节点（架构 §21 的真 bug：掉到 body 之后整块键盘失灵）
  await page.locator('[data-testid="profile-back"]').focus()
  await page.keyboard.press('ArrowDown')
  const moved = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return !!el && el !== document.body && document.querySelector('.app')!.contains(el)
  })
  expect(moved, '方向键之后焦点应被收回外壳内部').toBe(true)

  // 「键盘不失活」的硬证据：这一下 P 必须能呼出菜单
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()

  // ESC 不被页面消费：它归全局（菜单开着时先关掉，关掉之后再按一次重新呼出）
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)

  // 文件框是唯一会被 `isEditableTarget()` 当成「正在输入」的控件：焦点在它身上时
  // Q / P / 方向键都会被它吃掉（键盘等于失活）。页面必须松手 ——
  // 只把 Tab / Enter / Space / ESC 留给原生控件，其余按键把焦点交还外壳。
  await page.locator('[data-testid="profile-avatar-file"]').focus()
  await page.keyboard.press('ArrowDown')
  const afterFile = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return !!el && el !== document.body && document.querySelector('.app')!.contains(el)
  })
  expect(afterFile, '文件框上的方向键应把焦点交还外壳').toBe(true)
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)

  // Q 返回上一页：深链接直接打开时历史里没有上一页，兜底回主页（否则键盘会卡死在这一页）
  await page.keyboard.press('q')
  await expect(page).toHaveURL(/\/$/)
})

test('/profile：可见 h1 只有一个、h1→h2 不跳级、装饰层不进无障碍树，axe 无新增违规', async ({
  page,
}) => {
  await loggedIn(page)
  await page.goto('/profile')
  await booted(page)
  await expect(page.locator('[data-testid="profile-form"]')).toBeVisible()

  // 这一页自带标题：外壳的 SELF_TITLED_SCENES 含 profile，不该再多一个隐藏 h1
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveText('个人信息编辑')
  expect(await page.locator('h2').allInnerTexts()).toEqual(['基本资料', '修改密码'])

  // 装饰层：头像是给眼睛看的（相邻字段已经写清了信息），不许进无障碍树
  await expect(page.locator('[data-testid="profile-avatar-canvas"]')).toHaveAttribute(
    'aria-hidden',
    'true',
  )

  expect(await scan(page)).toEqual([])
})

test('改密码：两次不一致在前端拦下不发请求；一致时参数走 query string 且 body 为空', async ({
  page,
}) => {
  const stub = await loggedIn(page)
  await page.goto('/profile')
  await booted(page)

  await page.locator('[data-testid="profile-pw-old"]').fill('e2e-old-pass')
  await page.locator('[data-testid="profile-pw-new"]').fill('e2e-new-pass')
  await page.locator('[data-testid="profile-pw-confirm"]').fill('e2e-typo-pass')
  await page.locator('[data-testid="profile-pw-submit"]').click()

  await expect(page.locator('[data-testid="profile-pw-error"]')).toContainText(
    '两次输入的新密码不一致',
  )
  // 前端拦住就是真的没发出去（旧前端口径）
  expect(stub.pwPosts).toHaveLength(0)

  await page.locator('[data-testid="profile-pw-confirm"]').fill('e2e-new-pass')
  await page.locator('[data-testid="profile-pw-submit"]').click()

  await expect(page.locator('[data-testid="profile-pw-ok"]')).toContainText('密码已修改')
  expect(stub.pwPosts).toHaveLength(1)
  expect(stub.pwPosts[0]!.query.get('old_password')).toBe('e2e-old-pass')
  expect(stub.pwPosts[0]!.query.get('new_password')).toBe('e2e-new-pass')
  // 参数不在 body 里：契约收的是 query string，塞 JSON 会被后端当成参数缺失
  expect(stub.pwPosts[0]!.body).toBeNull()
})

test('登出：在需要权限的页面上登出后自动回主页（普通页面上则原地不动）', async ({ page }) => {
  // 用户口径：登出前停在需要权限的页面时，登出必须把人送回主页 ——
  // 否则地址栏写着 /profile、屏幕上却是登出后的空壳，URL 与画面互相矛盾。
  await loggedIn(page)
  await page.goto('/profile')
  await booted(page)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'profile')

  // 菜单 → 账号行（已登录时它是「退出登录」）
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  await page.click('[data-testid="pause-account"]')

  // 回主页：URL、场景、令牌一起收口
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'home')
  expect(await page.evaluate(() => localStorage.getItem('synthspark-token'))).toBeNull()
  // 提示照旧留在菜单里（反馈没丢，只是人换了地方）
  await expect(page.locator('[data-testid="pause-hint"]')).toContainText('已退出登录')

  // 反向：在**不**需要权限的页面上登出，不该被挪走（否则就是多管闲事）
  await page.goto('/posts')
  await booted(page)
  await page.evaluate(() => localStorage.setItem('synthspark-token', 'e2e-token-2'))
  await page.reload()
  await booted(page)
  await page.keyboard.press('p')
  await page.click('[data-testid="pause-account"]')
  await expect(page).toHaveURL(/\/posts$/)
  await expect(page.locator('.app')).toHaveAttribute('data-scene', 'posts')
})

test('长文本编辑：图标 / F2 两个入口，保存写回那一格、ESC 丢弃，打开期间 P 不叠菜单', async ({
  page,
}) => {
  const errors = collectErrors(page)
  const stub = await loggedIn(page)
  await page.goto('/profile')
  await booted(page)

  const bio = page.locator('[data-testid="profile-bio"]')
  const dialog = page.locator('[data-testid="long-text-dialog"]')
  const area = page.locator('[data-testid="long-text-area"]')

  // 入口一：焦点在那一格里按 F2（内核 KEYMAP 里没有 F2，不会被外壳吃掉）
  await bio.focus()
  await page.keyboard.press('F2')
  await expect(dialog).toBeVisible()
  // 模态该有的语义，缺了屏幕阅读器只会念到一堆孤立的文本框与按钮
  await expect(dialog).toHaveAttribute('role', 'dialog')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(dialog).toHaveAttribute('aria-labelledby', 'long-text-title')
  await expect(area).toHaveValue('旧简介')
  // 上限跟那一格同一个
  await expect(page.locator('[data-testid="long-text-count"]')).toContainText('/ 500')
  // 弹窗里只留必要的东西：没有说明文字，也没有快捷键说明（键位在页脚那一行）
  await expect(dialog.locator('p')).toHaveCount(0)

  // 焦点不在编辑区里时（这里落在「取消」按钮上）P 也不该再叠一层暂停菜单
  await page.locator('[data-testid="long-text-cancel"]').focus()
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)
  await expect(dialog).toBeVisible()

  // ESC 丢弃：那一格还是原来的值，一个字符都没写进去。
  // 这里先点一下遮罩：它**不关**框（框里可能是几百字，一次误点不该丢），
  // 但焦点会被外壳收回根节点 —— 于是这一下 ESC 只剩页面 `longTextPad` 那条路能关框，
  // 弹窗自己的 DOM 监听已经收不到这个键了（守卫被拿掉时这条断言就红）
  await area.fill('这一段不要了')
  await page.locator('[data-testid="long-text-mask"]').click({ position: { x: 5, y: 5 } })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(bio).toHaveValue('旧简介')

  // 弹窗关掉后 P 要恢复（`pageModalOpen` 没还回去的话菜单就再也打不开）。
  // 先把焦点移出输入框：焦点在编辑区里时字母本来就该是打字（全站口径，不是 bug）
  await page.locator('.app').focus()
  await page.keyboard.press('p')
  await expect(page.locator('[data-testid="pause"]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="pause"]')).toHaveCount(0)

  // 入口二：框内右上角那个图标
  await page.locator('[data-testid="profile-bio-expand"]').click()
  await expect(dialog).toBeVisible()
  // 多行：单独一个 ENTER 是换行，不许被当成保存
  await area.fill('一段很长的简介')
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await expect(area).toHaveValue('一段很长的简介\n')
  // CTRL + ENTER 才是保存
  await page.keyboard.press('Control+Enter')
  await expect(dialog).toHaveCount(0)
  await expect(bio).toHaveValue('一段很长的简介\n')
  // 焦点还给原来那一格（弹窗卸载时焦点先落回外壳，这一句排在它之后）
  await expect(bio).toBeFocused()
  // 弹窗只换画布：写回的是这一格的表单字段，不会自己发请求
  expect(stub.puts).toHaveLength(0)

  // 打开状态下的无障碍：模态语义齐备，没有新增违规
  await page.locator('[data-testid="profile-bio-expand"]').click()
  await expect(dialog).toBeVisible()
  expect(await scan(page)).toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  expect(errors).toEqual([])
})

test('长文本编辑只给文档型文本框：图标在框里，昵称 / 邮箱 / 密码 / 文件框都没有这个入口', async ({
  page,
}) => {
  await loggedIn(page)
  await page.goto('/profile')
  await booted(page)

  const bio = page.locator('[data-testid="profile-bio"]')
  const icon = page.locator('[data-testid="profile-bio-expand"]')
  await expect(icon).toBeVisible()

  // 「在框里」不是形容词：图标的盒子真的落在简介文本框的盒子内部（右上角）
  const box = (await bio.boundingBox())!
  const spot = (await icon.boundingBox())!
  expect(spot.x).toBeGreaterThan(box.x)
  expect(spot.y).toBeGreaterThan(box.y)
  expect(spot.x + spot.width).toBeLessThanOrEqual(box.x + box.width)
  expect(spot.y + spot.height).toBeLessThanOrEqual(box.y + box.height)
  // 图标是给眼睛看的几何形状，不进无障碍树；按钮本身有名字
  await expect(icon.locator('svg')).toHaveAttribute('aria-hidden', 'true')
  await expect(icon).toHaveAttribute('aria-label', '编辑全文：简介')

  // 单行框一个都不加（用户口径：只有文档形式的文本框需要）
  for (const id of ['profile-display-name', 'profile-email']) {
    await expect(page.locator(`[data-testid="${id}-expand"]`)).toHaveCount(0)
  }
  // 密码三格与文件框同理
  for (const id of ['profile-pw-old', 'profile-pw-new', 'profile-pw-confirm', 'profile-avatar-file']) {
    await expect(page.locator(`[data-testid="${id}-expand"]`)).toHaveCount(0)
  }
  // 页脚那一行键位提示里说明了这个功能（发现路径不能只靠图标）
  await expect(page.locator('.foot')).toContainText('F2 编辑全文')
})

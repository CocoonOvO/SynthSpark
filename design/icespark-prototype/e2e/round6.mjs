/**
 * 第 6 轮交互验收：用户这一轮说的五件事逐条走一遍
 *
 * 0. 样张数据 vs 实时数据（截图里为什么和实际访问不同）—— 只能人肉解释，脚本不测
 * 1. 截图用的是哪套数据（同上，不测）
 * 2. 设置只保留展示相关项；菜单去掉前进/后退，登录后加编辑文章 / 个人信息编辑，
 *    超管再多一条站点管理
 * 3. 文章页 TAB 按 DOM 顺序遍历链接（用户批准）
 * 4. 无封面的文章不占图片位（第七轮第 1 条：连空画框也不要），改用另一套排版
 * 5. 超管账号可登录（前台登录接口，不是 /api/admin/login）
 *
 * 用法：node e2e/round6.mjs
 * 账号可用环境变量覆盖：ICESPARK_ADMIN_USER / ICESPARK_ADMIN_PW /
 *                        ICESPARK_USER / ICESPARK_USER_PW
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = new URL('../../icespark-shots-v3/round6/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const ADMIN_USER = process.env.ICESPARK_ADMIN_USER || 'icespark_admin'
const ADMIN_PW = process.env.ICESPARK_ADMIN_PW || 'icespark2026'
const PLAIN_USER = process.env.ICESPARK_USER || 'icespark_user'
const PLAIN_PW = process.env.ICESPARK_USER_PW || 'icespark2026'

const errors = []
const results = []
function check(name, ok, extra = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  return ok
}

const BASE = 'http://127.0.0.1:5173'
const DEMO = '?demo=1'
let fatal = null

try {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  const shot = (n) => page.screenshot({ path: `${OUT}${n}.png` })
  const url = () => page.url().replace(BASE, '')
  const path = () => page.url().replace(BASE, '').split('?')[0]
  const settle = (ms = 460) => page.waitForTimeout(ms)
  const rowCount = () => page.locator('.pause-rows .row').count()
  const focusedRow = () =>
    page.evaluate(() => {
      const el = document.querySelector('.pause-rows .row.is-focused')
      return el ? el.dataset.row : ''
    })
  const nativeFocus = () =>
    page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      return {
        tag: el.tagName,
        testid: el.dataset.testid || '',
        text: (el.textContent || '').trim().slice(0, 14),
        href: el.getAttribute('href') || '',
        visible: el.matches(':focus-visible'),
      }
    })

  /** 顶到第一行再往下数，避免依赖上一段的焦点位置 */
  async function focusRow(id) {
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowUp')
    for (let i = 0; i < 16; i++) {
      if ((await focusedRow()) === id) return true
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(30)
    }
    return (await focusedRow()) === id
  }
  async function openMenu() {
    await page.keyboard.press('p')
    await page.waitForTimeout(260)
  }
  async function closeMenu() {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(220)
  }
  async function loginAs(user, pw) {
    const ok = await focusRow('account')
    if (!ok) return false
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    await page.fill('[data-testid="login-username"]', user)
    await page.fill('[data-testid="login-password"]', pw)
    await page.click('[data-testid="login-submit"]')
    await page.waitForTimeout(1500)
    return (await page.locator('[data-testid="login-dialog"]').count()) === 0
  }
  async function logoutIfLoggedIn() {
    if ((await page.locator('[data-testid="login-dialog"]').count()) > 0) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
    }
    if ((await page.locator('[data-testid="pause"]').count()) === 0) await openMenu()
    if (await focusRow('account')) {
      const text = await page.locator('[data-row="account"]').innerText()
      if (/退出登录/.test(text)) {
        await page.keyboard.press('Enter')
        await page.waitForTimeout(300)
      }
    }
  }

  // ── 准备：处理首次手势必然弹出的音效询问 ──
  await page.goto(`${BASE}/posts${DEMO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)
  await page.keyboard.press('Shift')
  await page.waitForTimeout(220)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(240)
  await page.evaluate(() => localStorage.removeItem('synthspark-token'))
  await page.evaluate(() => localStorage.removeItem('synthspark-icespark-user'))

  // ══ 第 4 条：无封面换版式（不摆空图片位、不摆任何占位记号）══
  // 第七轮第 1 条改过一次：马赛克 → 空画框 → 最初直接不要画框，改用另一套排版
  const cards = await page.evaluate(() => {
    const round = (n) => Math.round(n)
    return Array.from(document.querySelectorAll('[data-testid="post-card"]')).map((c) => {
      const box = c.getBoundingClientRect()
      const side = c.querySelector('.card-side')
      const title = c.querySelector('.card-title')
      return {
        text: c.classList.contains('is-text'),
        top: round(box.top),
        h: round(box.height),
        hasCoverBox: !!c.querySelector('.card-cover'),
        hasFrame: !!c.querySelector('.img-frame'),
        hasSide: !!side,
        sideH: side ? round(side.getBoundingClientRect().height) : 0,
        hasGroup: !!c.querySelector('.card-group'),
        titlePx: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
        img: c.querySelector('.img-frame img')?.naturalWidth || 0,
      }
    })
  })
  const textCards = cards.filter((c) => c.text)
  const imgCards = cards.filter((c) => !c.text)
  check(
    '④ 同一页上「有封面 / 无封面」混排',
    cards.length >= 4 && textCards.length >= 1 && imgCards.length >= 1,
    `共 ${cards.length}：有封面 ${imgCards.length} / 无封面 ${textCards.length}`
  )
  check('④ 旧马赛克占位已彻底移除', (await page.locator('.img-fallback').count()) === 0)
  check(
    '④ 无封面卡不占图片位（没有画框、没有占位记号）',
    (await page.locator('.card.is-text .card-cover').count()) === 0 &&
      (await page.locator('.card.is-text .img-frame').count()) === 0 &&
      (await page.locator('.img-ph-box').count()) === 0 &&
      (await page.locator('.img-ph-glyph').count()) === 0
  )
  check(
    '④ 无封面卡换的是另一套排版（右侧数据脊 + 顶部分组行 + 更大标题）',
    textCards.length > 0 &&
      textCards.every((c) => c.hasSide && c.hasGroup && c.titlePx >= 20) &&
      textCards.every((c) => c.sideH >= c.h * 0.7) &&
      imgCards.every((c) => !c.hasSide),
    '数据脊 ' +
      textCards.map((c) => `${c.sideH}/${c.h}`).join(' ') +
      ' · 标题 ' +
      textCards.map((c) => c.titlePx).join('/') +
      'px'
  )
  const loaded = imgCards.map((c) => c.img)
  check(
    '④ 样张封面真的加载出来了（不依赖外网）',
    loaded.length >= 1 && loaded.every((w) => w > 0),
    `naturalWidth=${loaded.join(',')}`
  )
  const rowHeights = Object.values(
    cards.reduce((m, c) => {
      ;(m[c.top] ||= new Set()).add(c.h)
      return m
    }, {})
  )
  check(
    '④ 同一行里有无封面都不参差',
    rowHeights.length >= 2 && rowHeights.every((hs) => hs.size === 1),
    cards.map((c) => `${c.h}@${c.top}`).join(' ')
  )
  await shot('1-list-no-cover')

  // 首页小卡同样换版式（顶部分组 / 日期头，正文撑满）
  await page.goto(`${BASE}/${DEMO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  const homeCards = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="home-post-"]')).map((c) => ({
      text: c.classList.contains('is-text'),
      top: Math.round(c.getBoundingClientRect().top),
      h: Math.round(c.getBoundingClientRect().height),
      hasThumb: !!c.querySelector('.post-thumb'),
      hasFrame: !!c.querySelector('.img-frame'),
      hasHead: !!c.querySelector('.post-head'),
    }))
  )
  const homeText = homeCards.filter((c) => c.text)
  const homeImg = homeCards.filter((c) => !c.text)
  check(
    '④ 首页混排：有封面卡保留缩略图，无封面卡没有空图位',
    homeText.length >= 1 && homeImg.length >= 1,
    `共 ${homeCards.length}：有封面 ${homeImg.length} / 无封面 ${homeText.length}`
  )
  check(
    '④ 首页无封面卡顶部有分组 / 日期头',
    homeText.every((c) => c.hasHead && !c.hasThumb && !c.hasFrame) &&
      homeImg.every((c) => c.hasThumb && !c.hasHead),
    homeText.map((c) => `${c.hasHead ? '头' : '无'}`).join(',')
  )
  check(
    '④ 首页一行三张等高',
    new Set(homeCards.map((c) => c.top)).size === 1 &&
      new Set(homeCards.map((c) => c.h)).size === 1,
    homeCards.map((c) => `${c.h}@${c.top}`).join(' ')
  )

  // ══ 第 2 条：设置里只留展示相关项 ══
  await openMenu()
  check('② 未登录时菜单 6 行', (await rowCount()) === 6, String(await rowCount()))
  check(
    '② 菜单里已没有「返回上一页 / 转到下一页」',
    (await page.locator('[data-row="back"]').count()) === 0 &&
      (await page.locator('[data-row="forward"]').count()) === 0
  )
  check('② 有设置行', (await focusRow('settings')) && (await page.locator('[data-row="settings"]').count()) === 1)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(260)
  check('② 设置弹窗打开', (await page.locator('[data-testid="settings-dialog"]').count()) === 1)
  const setRows = await page.locator('.rows .row').count()
  check('② 设置只留 3 行', setRows === 3, String(setRows))
  const setKeys = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.rows .row')).map((r) => r.dataset.testid)
  )
  check(
    '② 三项就是 音效 / 每页条数 / 动效',
    JSON.stringify(setKeys) === JSON.stringify(['set-sound', 'set-pageSize', 'set-motion']),
    setKeys.join(',')
  )
  check(
    '② 与展示无关的项已移出设置（数据来源 / 信号强度）',
    (await page.locator('[data-testid="set-source"]').count()) === 0 &&
      (await page.locator('[data-testid="set-signal"]').count()) === 0
  )
  const sizeBefore = await page.locator('[data-testid="set-pageSize"] .row-value').innerText()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(160)
  const sizeAfter = await page.locator('[data-testid="set-pageSize"] .row-value').innerText()
  check('② 每页条数仍然改得动（键盘）', sizeBefore.trim() !== sizeAfter.trim(), `${sizeBefore.trim()} → ${sizeAfter.trim()}`)
  await shot('2-settings')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(220)
  check('② ESC 关设置回菜单', (await page.locator('[data-testid="pause"]').count()) === 1)

  // ══ 第 2 条：登录后菜单里出现链接；超管多一条站点管理 ══
  check('② 普通用户登录成功', await loginAs(PLAIN_USER, PLAIN_PW), PLAIN_USER)
  check('② 普通用户菜单 8 行', (await rowCount()) === 8, String(await rowCount()))
  check(
    '② 出现 编辑文章 / 个人信息编辑',
    (await page.locator('[data-row="edit"]').count()) === 1 &&
      (await page.locator('[data-row="profile"]').count()) === 1
  )
  check('② 非超管没有「站点管理」', (await page.locator('[data-row="site"]').count()) === 0)
  const plainLinks = await page.evaluate(() =>
    ['edit', 'profile'].map((id) => {
      const el = document.querySelector(`[data-row="${id}"]`)
      return el ? `${el.tagName} ${el.getAttribute('href')}` : 'missing'
    })
  )
  check(
    '② 这两行是真链接（<a href>，可复制可中键）',
    plainLinks[0] === 'A /write' && plainLinks[1] === 'A /profile?tab=settings',
    plainLinks.join(' | ')
  )
  await shot('3-plain-menu')

  // 演示版没有那两张页面：点了给说明，不改地址（跳 catch-all 会变成首页，看着像坏了）
  const urlBeforeClick = url()
  await page.click('[data-testid="pause-edit"]')
  await page.waitForTimeout(240)
  const linkHint = await page.locator('[data-testid="pause-hint"]').innerText().catch(() => '')
  check(
    '② 点链接给出正式版路径说明且不真的跳转',
    /\/write/.test(linkHint) && url() === urlBeforeClick,
    `${linkHint.trim()} / ${url()}`
  )
  await shot('3b-link-hint')

  // 退出登录 → 超管登录
  await logoutIfLoggedIn()
  check('② 退出登录后菜单回到 6 行', (await rowCount()) === 6, String(await rowCount()))
  check('② 超管登录成功', await loginAs(ADMIN_USER, ADMIN_PW), ADMIN_USER)
  check('② 超管菜单 9 行', (await rowCount()) === 9, String(await rowCount()))
  const adminLinks = await page.evaluate(() =>
    ['edit', 'profile', 'site'].map((id) => {
      const el = document.querySelector(`[data-row="${id}"]`)
      return el ? `${el.tagName} ${el.getAttribute('href')}` : 'missing'
    })
  )
  check(
    '② 超管多一条「站点管理」，路径 /profile?tab=siteConfig',
    adminLinks[2] === 'A /profile?tab=siteConfig',
    adminLinks.join(' | ')
  )
  const accountText = await page.locator('[data-row="account"]').innerText()
  check('② 账号行显示昵称与退出', /退出登录/.test(accountText), accountText.trim())
  await shot('4-admin-menu')

  // 刷新后仍认得超管（token 在 localStorage，is_superuser 由 /api/auth/me 回填）
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2800)
  await openMenu()
  check(
    '② 刷新后仍是超管菜单（9 行 + 站点管理）',
    (await rowCount()) === 9 && (await page.locator('[data-row="site"]').count()) === 1,
    String(await rowCount())
  )
  await closeMenu()
  await logoutIfLoggedIn()
  check('② 退出后菜单回到 6 行（登录态干净）', (await rowCount()) === 6, String(await rowCount()))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(220)

  // ══ 第 3 条：文章页 TAB 按 DOM 顺序遍历链接 ══
  await page.goto(`${BASE}/post/where-memory-lives${DEMO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2800)
  check('③ 落在文章详情页', path() === '/post/where-memory-lives', url())

  const stops = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.article a[href], .article .chip, .article .act')).map(
      (el) => ({
        text: (el.textContent || '').trim().slice(0, 14),
        href: el.getAttribute('href') || '',
      })
    )
  )
  check('③ 文章页的可聚焦链接不止正文（芯片 + 操作条 + 正文链接）', stops.length >= 6, `stops=${stops.length}`)
  check(
    '③ 正文里确实渲染出了站内链接',
    stops.filter((s) => s.href.startsWith('/post/')).length >= 2,
    stops.map((s) => s.href).filter(Boolean).join(',')
  )

  await page.evaluate(() => document.activeElement && document.activeElement.blur())
  const walked = []
  for (let i = 0; i < stops.length; i++) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(70)
    walked.push(await nativeFocus())
  }
  const same = walked.every(
    (w, i) => w && w.text === stops[i].text && w.href === stops[i].href
  )
  check(
    '③ TAB 严格按 DOM 顺序遍历（芯片 → 操作条 → 正文链接）',
    same,
    walked.map((w, i) => `${i}:${w ? w.text : 'none'}${w && stops[i] && w.text === stops[i].text ? '' : '(≠)'}`).join(' ')
  )
  check(
    '③ 每个落点都看得见焦点（:focus-visible 命中 8bit 光标）',
    walked.every((w) => w && w.visible),
    walked.map((w) => (w ? w.visible : false)).join(',')
  )

  const lastInView = await page.evaluate(() => {
    const el = document.activeElement
    const scr = document.querySelector('.screen-inner')
    if (!el || !scr) return false
    const a = el.getBoundingClientRect()
    const b = scr.getBoundingClientRect()
    return a.top >= b.top - 1 && a.bottom <= b.bottom + 1
  })
  check('③ 焦点跑到屏幕外时浏览器自动把它滚进视野', lastInView)

  await page.keyboard.press('Shift+Tab')
  await page.waitForTimeout(90)
  const back = await nativeFocus()
  check(
    '③ SHIFT+TAB 反向回到上一个落点',
    !!back && back.text === stops[stops.length - 2].text && back.href === stops[stops.length - 2].href,
    back ? `${back.text} | ${back.href}` : 'none'
  )
  // 回到最后一个落点，回车打开正文链接（同时验「一次回车只跳一次」）
  await page.keyboard.press('Tab')
  await page.waitForTimeout(90)
  await shot('5-tab-focus-body-link')
  const histBefore = await page.evaluate(() => history.length)
  await page.keyboard.press('Enter')
  await settle(700)
  const histAfter = await page.evaluate(() => history.length)
  check(
    '③ 正文链接回车跳转（站内路由，不整页刷新）',
    path().startsWith('/post/') && url().includes('demo=1'),
    url()
  )
  check(
    '③ 一次回车只产生一条历史（原生激活 + 手柄确认没有双触发）',
    histAfter - histBefore === 1,
    `${histBefore} → ${histAfter}`
  )
  await shot('6-body-link-target')
  const reloaded = await page.evaluate(() => performance.getEntriesByType('navigation').length)
  check('③ 仍然没有整页刷新（navigation 计数为 1）', reloaded === 1, String(reloaded))

  // 芯片路径同样验一次：TAB 到第一个芯片，回车进分组列表
  await page.goto(`${BASE}/post/where-memory-lives${DEMO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2800)
  await page.evaluate(() => document.activeElement && document.activeElement.blur())
  await page.keyboard.press('Tab')
  await page.waitForTimeout(90)
  const firstStop = await nativeFocus()
  check('③ 第一个落点是分组芯片', !!firstStop && /技术笔记|观念|起源档案/.test(firstStop.text), firstStop ? firstStop.text : 'none')
  const histBeforeChip = await page.evaluate(() => history.length)
  await page.keyboard.press('Enter')
  await settle(600)
  const histAfterChip = await page.evaluate(() => history.length)
  check('③ 芯片回车跳到分组列表', path() === '/posts' && url().includes('group='), url())
  check(
    '③ 芯片一次回车同样只加一条历史',
    histAfterChip - histBeforeChip === 1,
    `${histBeforeChip} → ${histAfterChip}`
  )
  await shot('7-chip-from-tab')

  // ══ 第 5 条：超管账号确实能登进前台（顺带验登录失败提示）══
  await page.goto(`${BASE}/posts${DEMO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)
  // 先做一次应用内导航（Q 走的是浏览器历史，硬刷新进来是没有上一页的）
  await page.keyboard.press('Enter')
  await settle(600)
  check('⑤ 应用内进入文章', path().startsWith('/post/'), url())
  await openMenu()
  check('⑤ 菜单里没有前进/后退行', (await page.locator('[data-row="back"]').count()) === 0)
  const beforeQ = url()
  await page.keyboard.press('q')
  await settle(700)
  check(
    '⑤ 行没了，键还在：菜单里按 Q 后退并关掉菜单',
    url() !== beforeQ && path() === '/posts' && (await page.locator('[data-testid="pause"]').count()) === 0,
    `${beforeQ} → ${url()}`
  )

  await browser.close()
} catch (e) {
  fatal = e
}

console.log(results.join('\n'))
if (fatal) console.log('\n脚本中断：' + String(fatal.message).split('\n')[0])
const failed = results.filter((r) => r.startsWith('FAIL'))
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (errors.length) {
  console.log('\n控制台错误：')
  console.log([...new Set(errors)].slice(0, 20).join('\n'))
}
process.exit(failed.length || errors.length || fatal ? 1 : 0)

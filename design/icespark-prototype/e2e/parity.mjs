/**
 * 输入等价性验收（用户给的硬指标）
 *
 *   单独用键盘 / 单独用鼠标，都能完成全部交互操作。
 *
 * 所以这里跑两条互相独立的旅程：
 *   journey A —— 全程只按键盘，一次鼠标都不用
 *   journey B —— 全程只用鼠标点击/划过，一次键盘都不用
 *
 * 同时回归两个已发现的缺陷：
 *   缺陷 A：文章页方向键被全局吞掉，正文无法滚动
 *   缺陷 B：文章页 Enter 误触「加心」
 *
 * 运行：node e2e/parity.mjs
 * 需要 5173 上的 dev server（后端可选，无后端时走 DEMO 数据）
 */
import { chromium } from 'playwright'

const BASE = process.env.ICESPARK_URL || 'http://127.0.0.1:5173/'

let pass = 0
const failures = []

function check(name, ok, extra = '') {
  if (ok) {
    pass += 1
    console.log(`  ✓ ${name}`)
  } else {
    failures.push(`${name}${extra ? ` — ${extra}` : ''}`)
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`)
  }
}

function eq(name, actual, expected) {
  check(name, actual === expected, `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
}

/** 打开站点并预置「已问过音效」，避免首次按键被 SOUND CHECK 吃掉 */
async function boot(page, signal = 2) {
  await page.addInitScript(([sig]) => {
    localStorage.setItem('icespark-sound-prompt', '1')
    localStorage.setItem('icespark-sound', '0')
    localStorage.setItem('icespark-signal', sig)
  }, [String(signal)])
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(BASE)
  await page.waitForSelector('.title', { timeout: 15000 })
}

/** 等输入解锁：转场期间屏幕上还是旧场景，此时断言/按键都会误判 */
const idle = (page) =>
  page.waitForFunction(
    () => document.querySelector('.app')?.getAttribute('data-locked') === 'false',
    null,
    { timeout: 5000 }
  )

const focusedText = (page) => page.locator('.is-focused, .focused').first().innerText()
const pauseOpen = (page) => page.locator('[data-testid="pause"]').isVisible()
const signalOf = (page) => page.locator('.app').getAttribute('data-signal')
const heartLabel = (page) => page.locator('[data-testid="action-like"] .heart-label').innerText()
const heartCount = (page) => page.locator('.pc-stats > div:nth-child(2) span').innerText()
const scrollTop = (page) => page.locator('.screen-inner').evaluate((el) => el.scrollTop)

/** ─────────────── 路线 A：纯键盘 ─────────────── */
async function keyboardJourney(page) {
  console.log('\n[路线 A] 只用键盘')

  await boot(page)
  check('开机自检结束后自动进入 TITLE（不需要按键）', true)
  check('TITLE 首项默认获得焦点', (await focusedText(page)).includes('世界地图'))

  await page.keyboard.press('ArrowDown')
  check('↓ 移动焦点到第二项', (await focusedText(page)).includes('随机关卡'))
  await page.keyboard.press('ArrowUp')
  check('↑ 移回第一项', (await focusedText(page)).includes('世界地图'))

  // ── START 暂停菜单 ──
  await page.keyboard.press('p')
  check('P 呼出 START 暂停菜单', await pauseOpen(page))
  eq('暂停菜单首项为 RESUME', await page.locator('.row.focused .row-en').innerText(), 'RESUME')

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  eq('↓↓ 定位到 SIGNAL 行', await page.locator('.row.focused .row-en').innerText(), 'SIGNAL')
  await page.keyboard.press('ArrowRight')
  eq('→ 把信号档从 2 调到 3', await signalOf(page), '3')
  await page.keyboard.press('ArrowLeft')
  eq('← 把信号档调回 2', await signalOf(page), '2')

  await page.keyboard.press('ArrowDown')
  eq('↓ 定位到 SOUND 行', await page.locator('.row.focused .row-en').innerText(), 'SOUND')
  await page.keyboard.press('ArrowRight')
  check('→ 打开音效', (await page.locator('.softkey', { hasText: '音效' }).innerText()).includes('ON'))
  await page.keyboard.press('ArrowLeft')
  check('← 关闭音效', (await page.locator('.softkey', { hasText: '音效' }).innerText()).includes('OFF'))

  await page.keyboard.press('p')
  check('P 也能关闭暂停菜单（START 是同一个键）', !(await pauseOpen(page)))
  await page.keyboard.press('p')
  await page.waitForSelector('[data-testid="pause"]', { timeout: 4000 })
  check('再按 P 又能打开（开关式）', await pauseOpen(page))

  await page.keyboard.press('Escape')
  check('ESC 关闭暂停菜单', !(await pauseOpen(page)))
  eq('暂停菜单没有把信号档留在 3', await signalOf(page), '2')

  // ── 进入 WORLD ──
  await page.keyboard.press('Enter')
  await page.waitForSelector('.stage-grid, .stage-state', { timeout: 8000 })
  await idle(page)
  check('ENTER 从 TITLE 进入 WORLD（文章列表）', true)

  await page.keyboard.press('Enter')
  await page.waitForSelector('.stage', { timeout: 8000 })
  await idle(page)
  check('ENTER 从 WORLD 进入 STAGE（文章详情）', true)

  // ── 缺陷 B 回归：Enter 不能误触加心 ──
  await page.waitForSelector('[data-testid="doc"]', { timeout: 8000 })
  const beforeHeart = await heartCount(page)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  eq('缺陷B：正文页 ENTER 不再误触「加心」标签', await heartLabel(page), '加心 ♥')
  eq('缺陷B：正文页 ENTER 不再改变心数', await heartCount(page), beforeHeart)

  // ── 缺陷 A 回归：方向键必须能滚动正文 ──
  const geometry = await page.locator('.screen-inner').evaluate((el) => ({
    scrollable: el.scrollHeight > el.clientHeight + 40,
    top: el.scrollTop,
  }))
  check('正文页存在可滚动内容（前提成立）', geometry.scrollable)
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  check('缺陷A：↓↓ 能滚动正文（scrollTop > 0）', (await scrollTop(page)) > 0, `scrollTop=${await scrollTop(page)}`)

  // ── 方向键进入动作栏，键盘也能加心/评论/返回 ──
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  check('→ 把焦点交给动作栏', await page.locator('[data-testid="action-like"]').evaluate((el) => el.classList.contains('is-focused')))
  const heartBefore = await heartCount(page)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  eq('动作栏内 ENTER 才加心（标签变化）', await heartLabel(page), '已加心')
  eq('加心后心数 +1', await heartCount(page), String(Number(heartBefore) + 1))

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.dialog', { timeout: 4000 })
  check('动作栏内也能用键盘打开评论对话框', true)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  check('ESC 关闭评论对话框', (await page.locator('.dialog').count()) === 0)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  check('第一次 ESC 只退出动作栏，不离开文章', await page.locator('.stage').isVisible())
  check('退出动作栏后焦点条不再显示', !(await page.locator('[data-testid="action-like"]').evaluate((el) => el.classList.contains('is-focused'))))

  await page.keyboard.press('Escape')
  await page.waitForSelector('.stage-grid, .stage-state', { timeout: 8000 })
  await idle(page)
  check('第二次 ESC 返回 WORLD', true)

  // ── 键盘也要能翻页 ──
  const hasNext = !(await page.locator('[data-testid="pager-next"]').isDisabled())
  if (hasNext) {
    const pageLabelBefore = await page.locator('.world-head .page').innerText()
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(250)
    const pageLabelAfter = await page.locator('.world-head .page').innerText()
    check('→ 翻到下一页', pageLabelBefore !== pageLabelAfter, `${pageLabelBefore} → ${pageLabelAfter}`)
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(250)
    eq('← 翻回上一页', await page.locator('.world-head .page').innerText(), pageLabelBefore)
  } else {
    console.log('  · 只有一页内容，跳过翻页断言')
  }

  // ── 键盘回到 TITLE ──
  await page.keyboard.press('p')
  await page.waitForSelector('[data-testid="pause"]', { timeout: 4000 })
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowDown')
  eq('↓↓↓↓ 定位到 TITLE 行', await page.locator('.row.focused .row-en').innerText(), 'TITLE')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.title', { timeout: 8000 })
  check('暂停菜单的 TITLE 行能回到主菜单（全局导航）', true)
}

/** ─────────────── 路线 B：纯鼠标 ─────────────── */
async function mouseJourney(page) {
  console.log('\n[路线 B] 只用鼠标')

  await boot(page)

  // 鼠标划过 = 共享同一个焦点（和键盘焦点不是两套状态）
  await page.locator('[data-testid="menu-item"]').nth(2).hover()
  await page.waitForTimeout(120)
  check(
    '鼠标划过菜单项 → 移动的是同一个共享焦点',
    await page.locator('[data-testid="menu-item"]').nth(2).evaluate((el) => el.classList.contains('is-focused'))
  )
  await page.locator('[data-testid="menu-item"]').nth(0).click()
  await page.waitForSelector('.stage-grid, .stage-state', { timeout: 8000 })
  await idle(page)
  check('点击菜单项进入 WORLD', true)

  await page.locator('[data-testid="stage-card"]').nth(1).hover()
  await page.waitForTimeout(120)
  check(
    '鼠标划过关卡卡 → 同样是共享焦点',
    await page.locator('[data-testid="stage-card"]').nth(1).evaluate((el) => el.classList.contains('is-focused'))
  )
  await page.locator('[data-testid="stage-card"]').nth(1).click()
  await page.waitForSelector('[data-testid="doc"]', { timeout: 8000 })
  await idle(page)
  check('点击关卡卡进入 STAGE', true)

  // 加心
  const heartBefore = await heartCount(page)
  await page.locator('[data-testid="action-like"]').click()
  await page.waitForTimeout(250)
  eq('鼠标点「加心 ♥」→ 已加心', await heartLabel(page), '已加心')
  eq('鼠标加心后心数 +1', await heartCount(page), String(Number(heartBefore) + 1))

  // 评论
  await page.locator('[data-testid="action-comment"]').click()
  await page.waitForSelector('.dialog', { timeout: 4000 })
  check('鼠标点「发表评论」→ 打开对话框', true)
  await page.locator('.dialog-wrap').click()
  await page.waitForTimeout(250)
  check('鼠标点击对话框可以推进/补全出字', (await page.locator('.dialog').count()) === 1)
  await page.locator('.dialog-close').click()
  await page.waitForTimeout(250)
  check('鼠标点「✕ 关闭」能关掉对话框（键盘是 Esc）', (await page.locator('.dialog').count()) === 0)

  // 返回列表：鼠标必须有实体按钮（旧版只有一行键盘提示文字）
  await page.locator('[data-testid="action-back"]').click()
  await page.waitForSelector('.stage-grid, .stage-state', { timeout: 8000 })
  await idle(page)
  check('鼠标点「◀ 返回列表」能回列表（旧版鼠标路径缺失）', true)

  // 翻页
  const nextDisabled = await page.locator('[data-testid="pager-next"]').isDisabled()
  if (!nextDisabled) {
    const before = await page.locator('.world-head .page').innerText()
    await page.locator('[data-testid="pager-next"]').click()
    await page.waitForTimeout(250)
    check('鼠标点 NEXT 翻页', (await page.locator('.world-head .page').innerText()) !== before)
    await page.locator('[data-testid="pager-prev"]').click()
    await page.waitForTimeout(250)
    eq('鼠标点 PREV 翻回', await page.locator('.world-head .page').innerText(), before)
  } else {
    console.log('  · 只有一页内容，跳过翻页断言')
  }

  // START 菜单：鼠标路径必须能进（旧版只能靠键盘 P）
  await page.locator('button.softkey', { hasText: 'START' }).click()
  await page.waitForSelector('[data-testid="pause"]', { timeout: 4000 })
  check('鼠标点底部 START 软按键 → 打开暂停菜单', true)

  // 信号档：鼠标直接点分段
  await page.locator('[data-row="signal"]').click()
  await page.waitForTimeout(150)
  await page.locator('[data-seg="0"]').click()
  await page.waitForTimeout(200)
  eq('鼠标点分段把信号调到 0（纯净）', await signalOf(page), '0')
  await page.locator('[data-seg="3"]').click()
  await page.waitForTimeout(200)
  eq('鼠标点分段把信号调到 3（原教旨）', await signalOf(page), '3')

  // 音效开关
  await page.locator('[data-seg="on"]').click()
  await page.waitForTimeout(200)
  check('鼠标能把音效打开', (await page.locator('.softkey', { hasText: '音效' }).innerText()).includes('ON'))
  await page.locator('[data-seg="off"]').click()
  await page.waitForTimeout(200)
  check('鼠标能把音效关掉', (await page.locator('.softkey', { hasText: '音效' }).innerText()).includes('OFF'))

  // 回到 TITLE
  await page.locator('[data-row="title"]').click()
  await page.waitForSelector('.title', { timeout: 8000 })
  check('鼠标点 TITLE 行回到主菜单', true)

  // 信号 0 时正文应走阅读层
  await page.locator('[data-row="signal"]').click().catch(() => {})
}

/** 信号档 → 正文字体层的联动 */
async function signalAffectsBody(page) {
  console.log('\n[联动] 信号档决定正文渲染层')

  await boot(page, 0)
  check('信号 0（纯净）时 .app[data-signal] = 0', (await signalOf(page)) === '0')
  await page.locator('[data-testid="menu-item"]').nth(0).click()
  await page.waitForSelector('[data-testid="stage-card"]', { timeout: 8000 })
  await page.locator('[data-testid="stage-card"]').nth(0).click()
  await page.waitForSelector('[data-testid="doc"]', { timeout: 8000 })
  eq('信号 0 → 正文走阅读层', await page.locator('.stage').getAttribute('data-reading'), 'true')

  await boot(page, 3)
  await page.locator('[data-testid="menu-item"]').nth(0).click()
  await page.waitForSelector('[data-testid="stage-card"]', { timeout: 8000 })
  await idle(page)
  await page.locator('[data-testid="stage-card"]').nth(0).click()
  await page.waitForSelector('[data-testid="doc"]', { timeout: 10000 })
  await idle(page)
  eq('信号 3 → 正文走像素层', await page.locator('.stage').getAttribute('data-reading'), 'false')
  check('信号 3 时整屏显像管含刷新微抖', (await page.locator('.screen.crt-flicker').count()) === 1)
}

/** 无障碍：系统开了「减少动态效果」时，全站不允许还有动画在跑 */
async function reducedMotion(page) {
  console.log('\n[无障碍] prefers-reduced-motion')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await boot(page)
  await page.waitForTimeout(900) // 让 .blink 之类的元素有机会出现
  const running = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => (a.effect && a.effect.target ? a.effect.target.className : '?'))
  )
  check('减少动态效果下没有动画在跑', running.length === 0, running.slice(0, 4).join(' | '))

  // 键盘仍然完全可用（禁用动画不能顺手把交互也禁掉）
  await page.keyboard.press('ArrowDown')
  check('禁用动画后键盘依然能移动焦点', (await focusedText(page)).includes('随机关卡'))
  await page.keyboard.press('p')
  check('禁用动画后依然能呼出 START 菜单', await pauseOpen(page))
  await page.keyboard.press('Escape')
}

/**
 * 配色门 —— 这一条是为已经发生过的真实事故补的
 *
 * tokens.ts 曾经定义了 19 个 CSS 变量但**没有任何地方注入**，
 * 而 CSS 里有 220 处 var() 引用。var() 取不到值不是「退化成默认色」，
 * 而是整条声明按「计算值无效」处理：背景变透明、border 简写被重置成 none。
 * 结果是全站边框全部消失、只剩白底黑字，而代码看起来完全正常。
 *
 * 所以这里不只看某一个颜色，而是把**所有样式表里出现过的 var() 全部枚举出来**，
 * 逐个要求能在 :root 上取到值。任何一个漏注入都会当场变红。
 */
async function paletteGate(page) {
  console.log('\n[配色门] 设计 token 是否真的生效')

  await boot(page)
  const report = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement)
    const names = new Set()
    for (const sheet of document.styleSheets) {
      let rules
      try {
        rules = sheet.cssRules
      } catch {
        continue // 跨域表跳过
      }
      for (const rule of rules) {
        const txt = rule.cssText || ''
        for (const m of txt.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) names.add(m[1])
      }
    }
    const missing = [...names].filter((n) => !rootStyle.getPropertyValue(n).trim())
    const screen = document.querySelector('.screen')
    const ss = screen ? getComputedStyle(screen) : null
    // 焦点样式生效前后的对比色（用菜单项，stable）
    const focusable = document.querySelector('.menu-item')
    const fcs = focusable ? getComputedStyle(focusable) : null
    return {
      total: names.size,
      missing,
      paper: rootStyle.getPropertyValue('--paper').trim(),
      blue400: rootStyle.getPropertyValue('--blue-400').trim(),
      screenBg: ss ? ss.backgroundColor : null,
      screenBorder: ss ? `${ss.borderTopWidth} ${ss.borderTopStyle} ${ss.borderTopColor}` : null,
      menuBottomBorder: fcs ? `${fcs.borderBottomWidth} ${fcs.borderBottomStyle} ${fcs.borderBottomColor}` : null,
    }
  })

  check(`所有样式表里的 var() 都能取到值（共 ${report.total} 个）`, report.missing.length === 0, report.missing.join(', '))
  eq('--paper 解析为白色', report.paper, '#FFFFFF')
  eq('--blue-400 解析为浅蓝', report.blue400, '#6FBCE0')
  eq('屏幕底色是白，不是透明', report.screenBg, 'rgb(255, 255, 255)')
  check(
    '屏幕边框真的画出来了（不是 border: none）',
    /^3px solid rgb\(/.test(report.screenBorder || ''),
    report.screenBorder
  )
  check(
    '菜单分隔线真的画出来了（border 简写没被重置）',
    /^2px solid rgb\(/.test(report.menuBottomBorder || ''),
    report.menuBottomBorder
  )

  // 进 WORLD 看真正的卡片边框
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-testid="stage-card"]', { timeout: 8000 })
  await idle(page)
  const cardBorder = await page
    .locator('[data-testid="stage-card"]')
    .first()
    .evaluate((el) => {
      const cs = getComputedStyle(el)
      return `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`
    })
  check('关卡卡边框真的画出来了', /^3px solid rgb\(/.test(cardBorder), cardBorder)

  // 焦点必须改变「像素」，而不是只改一个 class
  // （注意：不能拿「本来就有焦点」的那一项当基准，否则前后必然一样）
  await page.keyboard.press('p')
  await page.waitForSelector('[data-testid="pause"]', { timeout: 4000 })
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter') // TITLE 行 → 回主菜单
  await page.waitForSelector('.title', { timeout: 8000 })
  await idle(page)

  const item1 = page.locator('[data-testid="menu-item"]').nth(1)
  const before = await item1.screenshot()
  await page.keyboard.press('ArrowDown') // 焦点从第 1 项移到第 2 项
  await page.waitForTimeout(250)
  const focused = await item1.screenshot()
  check('焦点选框在屏幕上真的看得见（像素级差异）', !before.equals(focused))
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(150)

  const focusBg = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="menu-item"].is-focused')
    return el ? getComputedStyle(el).backgroundColor : null
  })
  check(
    '焦点底色是浅蓝（不是黑，也不是透明）',
    /rgba?\(214,\s*236,\s*248/.test(focusBg || ''),
    focusBg
  )
}

const browser = await chromium.launch()
let consoleErrors = []

async function withPage(fn) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  try {
    await fn(page)
  } finally {
    await ctx.close()
  }
}

try {
  await withPage(keyboardJourney)
  await withPage(mouseJourney)
  await withPage(signalAffectsBody)
  await withPage(reducedMotion)
  await withPage(paletteGate)
} catch (err) {
  failures.push(`用例执行中断：${err && err.message}`)
  console.log(`\n!! 执行中断：${err && err.stack}`)
}

await browser.close()

// 忽略网络层面的噪音（无后端时的请求失败是预期的 DEMO 路径）
const realErrors = consoleErrors.filter(
  (e) => !/Failed to load resource|net::ERR|favicon|404/i.test(e)
)
console.log('\n[控制台]')
check('运行期无 JS 报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))

console.log(`\n═══ 结果：${pass} 项通过，${failures.length} 项失败 ═══`)
failures.forEach((f) => console.log(`  ✗ ${f}`))
process.exit(failures.length ? 1 : 0)

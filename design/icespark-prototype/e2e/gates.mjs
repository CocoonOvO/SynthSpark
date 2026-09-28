/**
 * 回归门（gates）：不测流程，测「不许再犯的那几件事」
 *
 * 每一条都是真实踩过的坑，或者用户点名的硬要求：
 *  1. 配色门 —— token 必须真的注入到 :root（曾经整站边框消失就是因为没注入）
 *  2. 焦点门 —— 焦点必须改变屏幕像素，而不只是加一个 class；且只有一套焦点样式
 *  3. 术语门 —— 界面上不许再出现游戏术语（用户要求第 1 条）
 *  4. 存储键门 —— localStorage 键必须带 synthspark 前缀（AGENTS.md 命名规范）
 *  5. 独立性门 —— 前端只打 /api，不碰后端内部实现
 *
 * 运行：node e2e/gates.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.ICESPARK_URL || 'http://127.0.0.1:5173/'
const results = []
let failed = 0

function check(name, ok, extra = '') {
  if (!ok) failed += 1
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error' && !/401 \(Unauthorized\)/.test(m.text())) consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(String(e)))

await page.addInitScript(() => localStorage.setItem('synthspark-icespark-sound-prompt', '1'))
await page.goto(`${BASE}?demo=1`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2400)

// ── 1. 配色门 ──
{
  const report = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement)
    const names = new Set()
    for (const sheet of document.styleSheets) {
      let rules
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      for (const rule of rules) {
        for (const m of (rule.cssText || '').matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) names.add(m[1])
      }
    }
    const missing = [...names].filter((n) => !rootStyle.getPropertyValue(n).trim())
    const screen = document.querySelector('.screen')
    const ss = screen ? getComputedStyle(screen) : null
    return {
      total: names.size,
      missing,
      paper: rootStyle.getPropertyValue('--paper').trim(),
      blue400: rootStyle.getPropertyValue('--blue-400').trim(),
      screenBg: ss ? ss.backgroundColor : null,
      screenBorder: ss ? `${ss.borderTopWidth} ${ss.borderTopStyle} ${ss.borderTopColor}` : null,
    }
  })
  check(`所有样式表里的 var() 都能取到值（共 ${report.total} 个）`, report.missing.length === 0, report.missing.join(', '))
  check('--paper 解析为白色', report.paper === '#FFFFFF', report.paper)
  check('--blue-400 解析为浅蓝', report.blue400 === '#6FBCE0', report.blue400)
  check('屏幕底色是白，不是透明', report.screenBg === 'rgb(255, 255, 255)', String(report.screenBg))
  check('屏幕边框真的画出来了', /^3px solid rgb\(/.test(report.screenBorder || ''), String(report.screenBorder))
}

// 卡片边框（border 简写没被 var() 失效重置）
// 第 5 轮：切页是 TAB（Q/E 改成了历史前进后退）
await page.keyboard.press('Tab')
await page.waitForTimeout(1400)
{
  const cardBorder = await page.locator('[data-testid="post-card"]').first().evaluate((el) => {
    const cs = getComputedStyle(el)
    return `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`
  })
  check('卡片边框真的画出来了', /^3px solid rgb\(/.test(cardBorder), cardBorder)
}

// ── 2. 焦点门 ──
{
  // 一定要盯**同一个元素**的前后差异：盯别的卡片时，两边都没焦点，
  // 之所以曾经「通过」只是因为布局滚动让裁剪区域错位了 —— 那是假绿。
  // 初始焦点在第一张卡（见 smoke），↓ 之后焦点走到同列下一行，第一张卡失去焦点。
  await page.waitForLoadState('networkidle')
  const card = page.locator('[data-testid="post-card"]').first()
  const before = await card.screenshot()
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(260)
  const after = await card.screenshot()
  check('焦点移走前后，同一张卡片的像素确实变了', !before.equals(after))
  await page.keyboard.press('ArrowUp') // 焦点收回第一张，后面几条断言依赖它
  await page.waitForTimeout(200)

  const info = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="post-card"].is-focused')
    if (!el) return null
    const cs = getComputedStyle(el)
    const before = getComputedStyle(el, '::before')
    const after = getComputedStyle(el, '::after')
    return {
      bg: cs.backgroundColor,
      borderW: cs.borderTopWidth,
      outlineW: cs.outlineWidth,
      outlineStyle: cs.outlineStyle,
      beforeW: before.width,
      afterW: after.width,
      beforeBg: before.backgroundColor,
      afterBg: after.backgroundColor,
      beforeTop: before.top,
      afterTop: after.top,
      animName: before.animationName,
      animDur: before.animationDuration,
    }
  })
  check('焦点卡底色是浅蓝', /rgba?\(214,\s*236,\s*248/.test(info?.bg || ''), String(info?.bg))
  check('两侧闪烁光标存在（左右各一块）', info?.beforeW === '8px' && info?.afterW === '8px', `${info?.beforeW}/${info?.afterW}`)
  check('光标是蓝色实心块', /rgba?\(61,\s*155,\s*208/.test(info?.beforeBg || ''), String(info?.beforeBg))
  check(
    '焦点没有额外的粗描边或 outline（用户反馈第 4 条）',
    info?.outlineStyle === 'none' || info?.outlineW === '0px',
    `${info?.outlineStyle} ${info?.outlineW}`
  )
  check('焦点边框保持 3px（没有为焦点加粗）', info?.borderW === '3px', String(info?.borderW))
  check('闪烁光标走的是 blink-step 关键帧（离散闪，不是淡入淡出）', info?.animName === 'blink-step', `${info?.animName} ${info?.animDur}`)
}

// 焦点门第 6 条：**已选中**的控件被聚焦时也必须看得出差别。
// 这就是第 4 轮那个「焦点视觉冲突」的同一类坑：选中色把焦点底色压掉，键盘用户找不到焦点。
{
  const chipBg = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="group-all"]')
      return el ? getComputedStyle(el).backgroundColor : null
    })
  const unfocused = await chipBg()
  await page.keyboard.press('g') // 聚焦分组行首项（它同时是「已选中」态）
  await page.waitForTimeout(220)
  const focused = await chipBg()
  const isFocused = await page.evaluate(() =>
    document.querySelector('[data-testid="group-all"]')?.classList.contains('is-focused')
  )
  check('已选中的分组芯片被聚焦时底色确实变了（选中态不吞焦点）', isFocused && unfocused !== focused, `${unfocused} -> ${focused}`)
}

// 焦点门第 7 条：横向滚动的筛选条（真实数据里 14 个标签会溢出），
// 键盘把焦点移过去时也必须滚进视野 —— 只量纵向可见性是不够的。
// 用真实数据源（不带 ?demo=1），因为样张只有 9 个标签、不会溢出。
{
  await page.goto(`${BASE}posts`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2600)
  const row = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="tag-row"]')
    return el ? { sw: el.scrollWidth, cw: el.clientWidth } : null
  })
  if (!row) {
    check('横向滚动的筛选条存在', false)
  } else if (row.sw <= row.cw + 1) {
    results.push(`SKIP  筛选条未溢出（${row.sw}/${row.cw}），跳过横向滚动断言`)
  } else {
    await page.keyboard.press('t') // 直达标签行
    await page.waitForTimeout(200)
    for (let i = 0; i < 15; i += 1) await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(400)
    const vis = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="tag-row"]')
      const chip = document.querySelector('[data-testid^="tag-"].is-focused')
      if (!chip) return { ok: false, why: 'no-focused-chip' }
      const a = el.getBoundingClientRect()
      const b = chip.getBoundingClientRect()
      return { ok: b.left >= a.left - 1 && b.right <= a.right + 1, why: `${Math.round(b.left)}..${Math.round(b.right)} in ${Math.round(a.left)}..${Math.round(a.right)}` }
    })
    check(`横向滚动条里焦点芯片会滚进视野（${row.sw}/${row.cw}）`, vis.ok, vis.why)
  }
  // 回到主页：后面的术语门假设自己从主页开始
  await page.goto(`${BASE}?demo=1`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)
}

// ── 3. 术语门 ──
{
  const GAME_TERMS = [
    'WORLD 1-1',
    'STAGE',
    'SCORE',
    'HEARTS',
    'CLIMB',
    'PLAYER',
    'LOCKED',
    'PAUSED',
    'SELECT STAGE',
    'TITLE',
    'SELECT',
    '关卡',
    '玩家',
    '加心',
    '心数',
    '通关',
    '成就',
    '经验值',
  ]
  const pages = ['(home)', 'posts', 'links', 'about', 'article', 'pause']
  const found = {}

  async function scan(tag) {
    const text = await page.locator('.screen').innerText()
    const hits = GAME_TERMS.filter((t) => text.includes(t))
    if (hits.length) found[tag] = hits
  }

  await scan(pages[0])
  await page.keyboard.press('Tab')
  await page.waitForTimeout(1000)
  await scan(pages[1])
  await page.keyboard.press('Tab')
  await page.waitForTimeout(600)
  await scan(pages[2])
  await page.keyboard.press('Tab')
  await page.waitForTimeout(600)
  await scan(pages[3])
  // 从「关于」用 Shift+TAB 退回「文章」，再回车打开一篇 —— 文章详情必须被真的扫到
  await page.keyboard.press('Shift+Tab')
  await page.waitForTimeout(600)
  await page.keyboard.press('Shift+Tab')
  await page.waitForTimeout(600)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(900)
  await scan(pages[4])
  await page.keyboard.press('p')
  await page.waitForTimeout(300)
  await scan(pages[5])
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.press('q') // 退出文章，避免影响后面的门
  await page.waitForTimeout(900)

  check(
    '六个页面上都没有游戏术语残留（用户要求第 1 条）',
    Object.keys(found).length === 0,
    JSON.stringify(found)
  )
}

// ── 4. 存储键门 ──
{
  // 动一遍三个偏好，让键真的被写出来
  // 菜单行序（第 6 轮起）：resume / search / sound / account / settings / home
  // 不数行数，按 data-row 走 —— 以后菜单再加行也不会把这道门带崩
  const focusRow = async (id) => {
    for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowUp')
    for (let i = 0; i < 16; i += 1) {
      const cur = await page.evaluate(
        () => document.querySelector('.pause-rows .row.is-focused')?.dataset.row || ''
      )
      if (cur === id) return true
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(30)
    }
    return false
  }
  await page.keyboard.press('p')
  await page.waitForTimeout(240)
  await focusRow('sound')
  await page.keyboard.press('ArrowRight') // 音效：关 → 开
  await page.waitForTimeout(150)
  check('存储键门：能走进设置行', await focusRow('settings'))
  await page.keyboard.press('Enter')
  await page.waitForTimeout(260)
  for (let i = 0; i < 10; i += 1) await page.keyboard.press('ArrowUp') // 设置首行
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight') // 每页条数切换
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight') // 动效：开 → 关
  await page.waitForTimeout(300)
  const keys = await page.evaluate(() => Object.keys(localStorage))
  const bad = keys.filter((k) => !k.startsWith('synthspark'))
  check('localStorage 键全部带 synthspark 前缀（AGENTS.md 第 1 节）', bad.length === 0, bad.join(', ') + ' | 实际：' + keys.join(', '))
  const motionOff = await page.locator('.app').getAttribute('data-motion')
  check('动效开关真的生效（data-motion=off）', motionOff === 'off', String(motionOff))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  // 复原
  await page.evaluate(() => localStorage.clear())
}

// ── 5. 独立性门：前端只打 /api ──
{
  const urls = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((u) => !/\.(js|css|woff2|png|jpg|svg|ico|json)(\?|$)/.test(u) || /\/api\//.test(u))
  )
  const outsiders = urls.filter((u) => !/\/api\//.test(u) && !u.startsWith(BASE) && !u.includes('picsum'))
  check('运行期资源请求都落在本站 /api（前端不猜后端内部）', outsiders.length === 0, outsiders.slice(0, 3).join(' | '))
}

check('运行期无 JS 报错', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

await browser.close()

console.log(results.join('\n'))
console.log(`\n${results.length - failed}/${results.length} 门通过`)
process.exit(failed ? 1 : 0)

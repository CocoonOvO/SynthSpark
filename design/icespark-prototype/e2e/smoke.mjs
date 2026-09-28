/**
 * icespark 交互冒烟：把七条改动逐条走一遍，并抓出控制台错误
 * 用法：node e2e/smoke.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = new URL('../../icespark-shots-v3/smoke/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const errors = []
const results = []
function check(name, ok, extra = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  return ok
}

let fatal = null
try {
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const EXPECTED = [/401 \(Unauthorized\)/]
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const t = m.text()
  if (EXPECTED.some((re) => re.test(t))) return // 故意用错密码触发的 401 是预期内
  errors.push(t)
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
// 4xx/5xx 也算错误，但「故意用错密码」那条 401 是预期内的
page.on('response', (r) => {
  if (r.status() < 400) return
  const u = r.url()
  if (u.includes('/api/auth/token')) return
  errors.push(`HTTP ${r.status()} ${u}`)
})

const shot = (n) => page.screenshot({ path: `${OUT}${n}.png` })

/** 顶到第一行再往下数，按 data-row 定位菜单行（行序变了也不会假失败） */
async function focusRow(id) {
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 16; i++) {
    const cur = await page.evaluate(
      () => document.querySelector('.pause-rows .row.is-focused')?.dataset.row || ''
    )
    if (cur === id) return true
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(30)
  }
  return false
}

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await shot('1-boot')
await page.waitForTimeout(2200)

// 首次手势必然弹「音效询问」——先处理掉，否则后面所有按键都被它吃掉
await page.keyboard.press('Shift')
await page.waitForTimeout(220)
check('首次手势弹出音效询问', (await page.locator('[data-testid="prompt-off"]').count()) === 1)
await page.keyboard.press('Escape')
await page.waitForTimeout(220)
check('拒绝音效后弹窗关闭', (await page.locator('[data-testid="prompt-off"]').count()) === 0)

// ── 主页 ──
await page.waitForSelector('[data-testid="tabbar"]')
check('开机后自动进入主页', await page.locator('[data-testid="tab-home"]').getAttribute('class').then((c) => c.includes('on')))
check('主页有最新文章', (await page.locator('[data-testid^="home-post-"]').count()) > 0)
check('主页有分组', (await page.locator('[data-testid^="home-group-"]').count()) > 0)
check('主页有标签', (await page.locator('[data-testid^="home-tag-"]').count()) > 0)
check('统计数字存在', /文章/.test(await page.locator('.hero-stats').innerText()))
await shot('2-home')

// 鼠标点「文章」标签
await page.click('[data-testid="tab-posts"]')
await page.waitForTimeout(420)
const cards = await page.locator('[data-testid="post-card"]').count()
check('文章列表有卡片', cards > 0, `cards=${cards}`)
// 第七轮起：无封面的卡不占图片位（改走文字卡版式），所以不能再要求「每张卡都有画框」
const framed = await page.locator('[data-testid="img-frame"]').count()
const textCards = await page.locator('.card.is-text').count()
check(
  '每张卡要么有封面图、要么走文字卡版式（没有空图位）',
  framed + textCards === cards,
  `cards=${cards} 画框=${framed} 文字卡=${textCards}`
)
await shot('3-posts')

// ── 视觉相邻导航：从 0 出发按 ↓ 应该到 index 2（下一行同一列） ──
const focusedIdx = async () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="post-card"].is-focused')
    return el ? [...document.querySelectorAll('[data-testid="post-card"]')].indexOf(el) : -1
  })
check('初始焦点在 0', (await focusedIdx()) === 0, String(await focusedIdx()))
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(120)
check('↓ 从 0 到 2（视觉相邻，不是 1）', (await focusedIdx()) === 2, String(await focusedIdx()))
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(120)
check('→ 到 3', (await focusedIdx()) === 3, String(await focusedIdx()))
await page.keyboard.press('ArrowLeft')
await page.waitForTimeout(120)
check('← 回 2', (await focusedIdx()) === 2, String(await focusedIdx()))

// ── 翻页：PgDn ──
const pageText = async () => page.locator('.pcount').innerText()
const p1 = await pageText()
await page.keyboard.press('PageDown')
await page.waitForTimeout(420)
const p2 = await pageText()
check('PgDn 翻页', p1 !== p2, `${p1} -> ${p2}`)
await shot('4-page-turn')
await page.keyboard.press('PageUp')
await page.waitForTimeout(420)
check('PgUp 回到第一页', (await pageText()) === p1)

// ── ↑ 到标签栏（第 5 轮起中间多了「标签行 / 分组行」两层） ──
await page.keyboard.press('ArrowUp') // 卡片 -> 标签行
await page.waitForTimeout(120)
await page.keyboard.press('ArrowUp') // 标签行 -> 分组行
await page.waitForTimeout(120)
await page.keyboard.press('ArrowUp') // 分组行 -> 标签栏
await page.waitForTimeout(160)
check('↑ 顶到标签栏', (await page.evaluate(() => document.querySelector('.app').dataset.zone)) === 'tabs')
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(120)
check('标签栏 → 切到「关联」', (await page.locator('[data-testid="tab-links"]').getAttribute('class')).includes('is-focused'))
await shot('5-tabbar')
await page.keyboard.press('Enter')
await page.waitForTimeout(420)
check('ENTER 进入关联页', (await page.locator('[data-testid="links-grid"]').count()) === 1)
await shot('6-links')

// ── TAB 切页（第 5 轮：Q/E 改成历史前进后退） ──
await page.keyboard.press('Shift+Tab')
await page.waitForTimeout(420)
check('Shift+TAB 切回文章页', (await page.locator('[data-testid="post-grid"]').count()) === 1)
check('切页写进 URL', page.url().endsWith('/posts'), page.url())

// ── 打开文章 ──
await page.keyboard.press('Enter')
await page.waitForTimeout(500)
check('进入文章详情', (await page.locator('[data-testid="md-body"]').count()) === 1)
check('markdown 渲染出标题', (await page.locator('[data-testid="md-body"] h2').count()) >= 2)
check('markdown 渲染出代码块', (await page.locator('[data-testid="md-body"] .md-fence').count()) >= 1)
check('markdown 渲染出表格', (await page.locator('[data-testid="md-body"] table').count()) >= 1)
check('快捷键指南常驻', await page.locator('[data-testid="keybar"]').isVisible())
check('左侧竖列已消失', (await page.locator('.side').count()) === 0)
check('操作条是横向的', await page.evaluate(() => {
  const a = document.querySelector('.actions')
  return !!a && getComputedStyle(a).flexDirection === 'row'
}))
await shot('7-article')

// 滚动后快捷键指南仍可见
await page.keyboard.press('PageDown')
await page.keyboard.press('PageDown')
await page.waitForTimeout(200)
check('滚动后指南仍在视口内', await page.locator('[data-testid="keybar"]').isVisible())
const kbBox = await page.locator('[data-testid="keybar"]').boundingBox()
check('指南贴在屏幕底部', kbBox.y + kbBox.height > 800, JSON.stringify(kbBox))
await shot('8-article-scrolled')

// ── 第 7 条：G / L 快捷键聚焦 + U 回顶部 ──
await page.keyboard.press('g')
await page.waitForTimeout(160)
check('G 聚焦分组/标签芯片', /is-focused/.test((await page.locator('[data-testid^="chip-"]').first().getAttribute('class')) || ''))
await page.keyboard.press('l')
await page.waitForTimeout(160)
check('L 聚焦点赞/评论栏', (await page.locator('[data-testid="action-like"]').getAttribute('class')).includes('is-focused'))
const scrollBefore = await page.evaluate(() => document.querySelector('.screen-inner').scrollTop)
await page.keyboard.press('u')
await page.waitForTimeout(200)
check('U 回到文章顶部', (await page.evaluate(() => document.querySelector('.screen-inner').scrollTop)) === 0, `from ${scrollBefore}`)

// ── 操作条键盘路径 ──
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(140)
check('→ 进入操作条', (await page.locator('[data-testid="action-like"]').getAttribute('class')).includes('is-focused'))
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(140)
check('↓ 退出操作条并滚动', !(await page.locator('[data-testid="action-like"]').getAttribute('class')).includes('is-focused'))

// ── 返回列表：Q（历史后退）。第 5 轮起 ESC 是「开菜单」，不再兼任返回 ──
await page.keyboard.press('q')
await page.waitForTimeout(560)
check('Q 返回列表', (await page.locator('[data-testid="post-grid"]').count()) === 1)
check('返回后回到第 1 页（浏览状态保留）', (await pageText()) === p1, await pageText())

// ── 暂停菜单 ──
await page.keyboard.press('p')
await page.waitForTimeout(240)
check('P 打开菜单', (await page.locator('[data-testid="pause"]').count()) === 1)
check('菜单有 6 行（未登录：无编辑 / 无前进后退）', (await page.locator('.pause-rows .row').count()) === 6, String(await page.locator('.pause-rows .row').count()))
check('没有信号强度行', (await page.locator('[data-row="signal"]').count()) === 0)
// 第 6 轮：前进 / 后退两行按用户要求从菜单移除（历史交给 Q / E 与浏览器按钮）
check('菜单里没有返回上一页 / 转到下一页', (await page.locator('[data-row="back"]').count()) === 0 && (await page.locator('[data-row="forward"]').count()) === 0)
await shot('9-pause')

// 搜索：菜单第二行
await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
await page.waitForTimeout(200)
check('菜单内搜索栏打开', await page.locator('[data-testid="pause-search-input"]').isVisible())
await page.fill('[data-testid="pause-search-input"]', 'JSON')
await page.waitForTimeout(500)
const hits = await page.locator('[data-testid^="pause-hit-"]').count()
check('搜索出结果', hits > 0, `hits=${hits}`)
await shot('10-search')
await page.keyboard.press('Escape')
await page.waitForTimeout(160)
check('ESC 回到菜单', (await page.locator('.pause-rows').count()) === 1)

// 设置弹窗：按行 id 定位，不再数行数
await focusRow('settings')
await page.keyboard.press('Enter')
await page.waitForTimeout(240)
check('设置弹窗打开', (await page.locator('[data-testid="settings-dialog"]').count()) === 1)
check('设置里没有信号强度行', (await page.locator('[data-testid="set-signal"]').count()) === 0)
check('设置里没有数据来源（第 6 轮：设置只留展示相关项）', (await page.locator('[data-testid="set-source"]').count()) === 0)
check('设置里有每页条数', (await page.locator('[data-testid="set-pageSize"]').count()) === 1)
check('设置只有 3 行（音效 / 每页条数 / 动效）', (await page.locator('.rows .row').count()) === 3, String(await page.locator('.rows .row').count()))
await shot('11-settings')
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
check('ESC 关设置回菜单', (await page.locator('[data-testid="settings-dialog"]').count()) === 0 && (await page.locator('[data-testid="pause"]').count()) === 1)

// 登录弹窗
await focusRow('account')
await page.keyboard.press('Enter')
await page.waitForTimeout(260)
check('登录弹窗打开', (await page.locator('[data-testid="login-dialog"]').count()) === 1)
// 真实接口：故意用错密码，必须显示后端 detail
await page.fill('[data-testid="login-username"]', 'definitely_not_a_user')
await page.fill('[data-testid="login-password"]', 'wrong-password')
await page.click('[data-testid="login-submit"]')
await page.waitForTimeout(1200)
const errText = await page.locator('[data-testid="login-error"]').innerText().catch(() => '')
check('登录失败显示后端错误', /用户名或密码错误|HTTP/.test(errText), errText.trim())
await shot('12-login')
// 关掉登录弹窗，回到暂停菜单（菜单还开着，正好接着往下测）
await page.keyboard.press('Escape')
await page.waitForTimeout(240)

// ── 成功登录（要一个真实账号；没给就跳过这一段）──
const PROBE_USER = process.env.PROBE_USER
const PROBE_PW = process.env.PROBE_PW
if (PROBE_USER && PROBE_PW) {
  await focusRow('account')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(240)
  await page.fill('[data-testid="login-username"]', PROBE_USER)
  await page.fill('[data-testid="login-password"]', PROBE_PW)
  await page.click('[data-testid="login-submit"]')
  await page.waitForTimeout(1400)
  check('真实账号登录成功', (await page.locator('[data-testid="login-dialog"]').count()) === 0)
  check(
    '登录后菜单出现「编辑文章」「个人信息编辑」两个真链接',
    (await page.locator('[data-row="edit"]').count()) === 1 &&
      (await page.locator('[data-row="profile"]').count()) === 1 &&
      (await page.locator('[data-row="edit"]').evaluate((el) => el.tagName)) === 'A',
  )
  const rowsLogged = await page.locator('.pause-rows .row').count()
  const hasSite = (await page.locator('[data-row="site"]').count()) === 1
  check(
    '菜单行数随登录态（8 行；超管再多一条「站点管理」= 9 行）',
    rowsLogged === 8 || (rowsLogged === 9 && hasSite),
    `${rowsLogged}${hasSite ? ' 含站点管理' : ''}`
  )
  check('登录行显示退出登录', /退出登录/.test(await page.locator('[data-row="account"]').innerText()), await page.locator('[data-row="account"]').innerText())
  await shot('12b-logged-in')
  // 登录后刷新仍然保持登录（localStorage 里的 synthspark-token）
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2600)
  await page.keyboard.press('p')
  await page.waitForTimeout(240)
  check('刷新后仍是登录态', (await page.locator('[data-row="edit"]').count()) === 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
} else {
  results.push('SKIP  成功登录流程（未提供 PROBE_USER / PROBE_PW）')
}

// ── 减动效 ──
await page.emulateMedia({ reducedMotion: 'reduce' })
// 第 5 轮起刷新会停在刷新前的地址上（这是路由该有的行为），所以显式回到主页再测
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2600)
check('减动效下仍能进入主页', (await page.locator('[data-testid="tabbar"]').count()) === 1 && page.url().endsWith('/'))
await page.keyboard.press('Tab')
await page.waitForTimeout(500)
check('减动效下切页正常', (await page.locator('[data-testid="post-grid"]').count()) === 1, page.url())
await shot('13-reduced-motion')

// ── 仅鼠标：整个流程不碰键盘 ──
await page.emulateMedia({ reducedMotion: 'no-preference' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2600)
await page.click('[data-testid="tab-posts"]')
await page.waitForTimeout(420)
await page.click('[data-testid="post-card"]', { position: { x: 20, y: 20 } })
await page.waitForTimeout(520)
check('纯鼠标：能进文章', (await page.locator('[data-testid="md-body"]').count()) === 1)
await page.click('[data-testid="action-back"]')
await page.waitForTimeout(460)
check('纯鼠标：能返回', (await page.locator('[data-testid="post-grid"]').count()) === 1)
await page.click('[data-testid="pager-next"]')
await page.waitForTimeout(420)
check('纯鼠标：能翻页', (await pageText()) !== p1)
check('纯鼠标：翻页写进 URL', /page=2/.test(page.url()), page.url())
await page.getByRole('button', { name: '菜单 (P)' }).click()
await page.waitForTimeout(240)
check('纯鼠标：能开菜单', (await page.locator('[data-testid="pause"]').count()) === 1)
await shot('14-mouse-only')

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

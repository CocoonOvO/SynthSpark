/**
 * 第 5 轮交互验收：用户提的 8 条逐条走一遍（键盘为主，鼠标路径另测）
 *
 * 1. ESC 打开菜单
 * 2. TAB / Shift+TAB 切换标签页
 * 3. 文章列表的分组选择
 * 4. 没有标签栏的页面（文章详情）不参与标签页切换
 * 5. Q 返回上一页 / E 回到下一页
 * 6. 跳页（J 进入，输页码回车）
 * 7. 文章详情：U 回顶部、分组/标签可跳列表、G / L 快捷键聚焦
 * 8. 路由：URL 直达、未知路径回主页、前进后退可用
 *
 * 用法：node e2e/round5.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = new URL('../../icespark-shots-v3/round5/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

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
  /** 转场遮罩期间输入是锁死的：等够时间再断言 */
  const settle = (ms = 460) => page.waitForTimeout(ms)

  // ── 准备：处理首次手势必然弹出的音效询问 ──
  await page.goto(`${BASE}/${DEMO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)
  await page.keyboard.press('Shift')
  await page.waitForTimeout(220)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(240)
  check('开机后落在主页（/）', path() === '/' && (await page.locator('[data-testid="tabbar"]').count()) === 1, url())
  await shot('0-home')

  // ── 第 1 条：ESC 打开菜单 ──
  await page.keyboard.press('Escape')
  await page.waitForTimeout(240)
  check('① ESC 打开菜单', (await page.locator('[data-testid="pause"]').count()) === 1)
  await shot('1-esc-menu')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(240)
  check('① ESC 再按关闭菜单', (await page.locator('[data-testid="pause"]').count()) === 0)

  // ── 第 2 条：TAB / Shift+TAB 切标签页 ──
  const activeTab = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid^="tab-"].on')
      return el ? el.dataset.testid : ''
    })
  await page.keyboard.press('Tab')
  await settle()
  check('② TAB 切到文章页', (await activeTab()) === 'tab-posts' && path() === '/posts', url())
  await shot('2-tab-posts')
  await page.keyboard.press('Tab')
  await settle()
  check('② TAB 继续切到关联页', (await activeTab()) === 'tab-links' && path() === '/links', url())
  await page.keyboard.press('Tab')
  await settle()
  check('② TAB 继续切到关于页', (await activeTab()) === 'tab-about' && path() === '/about', url())
  await page.keyboard.press('Tab')
  await settle()
  check('② TAB 循环回主页', (await activeTab()) === 'tab-home' && path() === '/', url())
  await page.keyboard.press('Shift+Tab')
  await settle()
  check('② SHIFT+TAB 反向切到关于页', (await activeTab()) === 'tab-about' && path() === '/about', url())
  await page.keyboard.press('Shift+Tab')
  await settle()
  check('② SHIFT+TAB 反向到关联页', (await activeTab()) === 'tab-links' && path() === '/links', url())

  // ── 第 3 条：分组选择 ──
  // （上面停在 /links，标签切换已验完，这里直接开到列表，免得依赖循环次序）
  await page.goto(`${BASE}/posts${DEMO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)
  const groupChips = await page.locator('[data-testid^="group-"]').count()
  check('③ 列表有独立的分组行', groupChips > 1 && (await page.locator('[data-testid="tag-row"]').count()) === 1, `chips=${groupChips}`)
  await shot('3-list-rows')

  await page.keyboard.press('g')
  await page.waitForTimeout(200)
  const groupFocused = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid^="group-"].is-focused')
      return el ? el.dataset.testid : ''
    })
  check('③ G 键聚焦分组行首项（全部分组）', (await groupFocused()) === 'group-all', await groupFocused())
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(160)
  const secondGroup = await groupFocused()
  check('③ → 移到下一个分组', secondGroup !== '' && secondGroup !== 'group-all', secondGroup)
  await page.keyboard.press('Enter')
  await settle()
  const groupName = decodeURIComponent((url().match(/group=([^&]*)/) || [])[1] || '')
  check('③ 回车按分组筛选（写进 URL）', groupName !== '' && url().includes('group='), url())
  await shot('4-group-filter')
  const sameGroup = await page.evaluate(() => {
    const on = document.querySelector('[data-testid="group-row"] .fchip.on')
    if (!on) return { ok: false, why: 'no-on-chip' }
    const want = on.textContent.trim().replace(/\d+$/, '')
    const tags = [...document.querySelectorAll('[data-testid="post-card"] .tag')].map((el) => el.textContent.trim())
    return { ok: tags.length > 0 && tags.every((t) => t === want), why: `${want} vs ${tags.join(',')}` }
  })
  check('③ 筛选后卡片确实同属该分组', sameGroup.ok, sameGroup.why)
  // 焦点收敛不会跑出可见区
  const chipBox = await page.locator('[data-testid^="group-"].is-focused').boundingBox()
  check('③ 分组高亮在视口内', !!chipBox && chipBox.y > 0 && chipBox.y < 900, JSON.stringify(chipBox))

  // ── 第 6 条：跳页 ──
  // 回到不带筛选的列表（6 篇样张 ÷ 默认每页 4 篇 = 2 页，才有越界可测）
  await page.goto(`${BASE}/posts${DEMO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)
  check('⑥ 无筛选时共 2 页', (await page.locator('.pcount').innerText()).includes('/ 2'), await page.locator('.pcount').innerText())
  await page.keyboard.press('j')
  await page.waitForTimeout(220)
  check('⑥ J 打开跳页输入框', (await page.locator('[data-testid="jump-input"]').count()) === 1)
  await shot('5-jump')
  await page.fill('[data-testid="jump-input"]', '99')
  await page.keyboard.press('Enter')
  await settle()
  const pcount = await page.locator('.pcount').innerText()
  check('⑥ 越界页码收敛到最后一页', pcount.includes('PAGE 2 / 2'), pcount)
  check('⑥ 页码写进 URL', /page=2/.test(url()), url())
  await page.keyboard.press('j')
  await page.waitForTimeout(200)
  await page.fill('[data-testid="jump-input"]', '1')
  await page.keyboard.press('Enter')
  await settle()
  check('⑥ 跳回第 1 页', (await page.locator('.pcount').innerText()).includes('PAGE 1 / 2'))
  check('⑥ 第 1 页不写 page 参数', !/page=/.test(url()), url())

  // ── 第 8 条：路由 ──
  await page.goto(`${BASE}/about${DEMO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)
  check('⑧ /about 直达关于页', (await activeTab()) === 'tab-about' && path() === '/about', url())
  await page.goto(`${BASE}/post/aesthetic-bias${DEMO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2600)
  const title = await page.locator('.doc-title').innerText().catch(() => '')
  check('⑧ /post/:key 直达文章（slug 可读）', /审美偏见/.test(title), title)
  check('⑧ 文章页没有标签栏', (await page.locator('[data-testid="tabbar"]').count()) === 0)
  await shot('6-deeplink-article')
  await page.goto(`${BASE}/no-such-page${DEMO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)
  check('⑧ 未知路径回主页（不白屏）', path() === '/' && (await page.locator('[data-testid="tabbar"]').count()) === 1, url())

  // ── 第 4 条：文章页不参与标签页切换 ──
  await page.goto(`${BASE}/posts${DEMO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)
  await page.keyboard.press('Enter') // 打开第一张卡片
  await settle(560)
  check('⑧ 列表回车进详情', path().startsWith('/post/'), url())
  const articleUrl = url()
  await page.keyboard.press('Tab')
  await settle()
  await page.keyboard.press('Shift+Tab')
  await settle()
  check('④ 文章页 TAB 不换页', url() === articleUrl && path().startsWith('/post/'), url())
  await shot('7-article')

  // ── 第 7 条：文章详情 ──
  await page.keyboard.press('PageDown')
  await page.keyboard.press('PageDown')
  await page.waitForTimeout(240)
  const scrolled = await page.evaluate(() => document.querySelector('.screen-inner').scrollTop)
  await page.keyboard.press('u')
  await page.waitForTimeout(240)
  const atTop = await page.evaluate(() => document.querySelector('.screen-inner').scrollTop)
  check('⑦ U 回到文章顶部', scrolled > 0 && atTop === 0, `${scrolled} -> ${atTop}`)

  await page.keyboard.press('l')
  await page.waitForTimeout(200)
  check(
    '⑦ L 聚焦点赞/评论栏',
    (await page.locator('[data-testid="action-like"]').getAttribute('class')).includes('is-focused')
  )
  await shot('8-article-actions')
  await page.keyboard.press('g')
  await page.waitForTimeout(200)
  const chipCls = await page.locator('[data-testid^="chip-"]').first().getAttribute('class')
  check('⑦ G 聚焦分组/标签芯片', /is-focused/.test(chipCls || ''), chipCls || '')
  await shot('9-article-chips')
  const chipText = (await page.locator('[data-testid^="chip-"]').first().innerText()).replace(/[#▣→\s]/g, '')
  await page.keyboard.press('Enter')
  await settle(560)
  check('⑦ 芯片跳转到对应列表', path() === '/posts' && url().includes(encodeURIComponent(chipText)), `${chipText} -> ${url()}`)
  const onGroup = await page.locator('[data-testid="group-row"] .fchip.on').innerText()
  const onTag = await page.locator('[data-testid="tag-row"] .fchip.on').innerText()
  check(
    '⑦ 列表里对应筛选项是选中态（分组命中、标签为全部）',
    onGroup.replace(/[\s\d]+/g, '') === chipText && /全部标签/.test(onTag),
    `${onGroup} / ${onTag}`
  )
  await shot('10-chip-target')

  // ── 第 5 条：Q / E 历史前进后退 ──
  const before = url()
  await page.keyboard.press('q')
  await settle(560)
  const afterQ = url()
  check('⑤ Q 返回上一页', afterQ !== before && path().startsWith('/post/'), `${before} -> ${afterQ}`)
  await page.keyboard.press('e')
  await settle(560)
  check('⑤ E 回到下一页', url() === before, `${afterQ} -> ${url()}`)
  // 深链接进入（没有上一页）时 Q 不应崩，也不应白屏
  await page.goto(`${BASE}/post/aesthetic-bias${DEMO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)
  await page.keyboard.press('q')
  await page.waitForTimeout(400)
  check('⑤ 无历史时 Q 不白屏', (await page.locator('.doc-title, [data-testid="tabbar"]').count()) > 0, url())
  await shot('11-q-no-history')

  // ── 菜单里的前进/后退行也是真的（必须在应用内导航之后看，刷新会把历史清空）──
  await page.goto(`${BASE}/posts${DEMO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)
  await page.keyboard.press('Enter') // 应用内前进到文章
  await settle(560)
  const hardLoadDisabled = await page.evaluate(() => document.querySelectorAll('[data-testid="pager-prev"]').length)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(260)
  const backRow = await page.locator('[data-row="back"]').getAttribute('class')
  check('⑤ 应用内导航后，菜单「返回上一页」可用', /disabled/.test(backRow || '') === false, `${backRow} / 列表控件${hardLoadDisabled}`)
  await shot('11b-menu-history')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  // ── 鼠标路径：分组行 + 跳页按钮都点得到 ──
  await page.goto(`${BASE}/posts${DEMO}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)
  await page.click('[data-testid="group-all"]')
  await settle()
  await page.click('[data-testid="pager-jump"]')
  await page.waitForTimeout(220)
  check('⑥ 鼠标点开跳页框', (await page.locator('[data-testid="jump-input"]').count()) === 1)
  await page.fill('[data-testid="jump-input"]', '2')
  await page.click('[data-testid="jump-go"]')
  await settle()
  check('⑥ 鼠标跳页生效', (await page.locator('.pcount').innerText()).includes('PAGE 2 / 2'))
  await shot('12-mouse-jump')

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

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { booted } from './helpers'

/**
 * 铁律「**无 hover**（列表 / 卡片；外壳软键照样机保留 hover）」的守卫（架构 §38）。
 *
 * 这条铁律容易被误读成「全站不许出现 `:hover`」，其实不是：样机里按钮 / 芯片 / 链接
 * **有** `:hover` 反馈（那是给鼠标用户的正常反馈），铁律管的是**列表项与卡片容器** ——
 * 它们不该有 hover 专属视觉，因为鼠标划过时该做的事只有一件：**移动那个共享焦点光标**
 * （键盘用方向键移动的是同一个光标）。换句话说：
 *
 * > 一张卡片「被划过」的样子，必须**恰好等于**它「被键盘选中」的样子。
 *
 * 于是这道门分两半：
 *   1. **运行期**（`卡片 hover 的视觉 == 键盘焦点的视觉`）：拿计算样式做对照，
 *      少一样、多一样都会红 —— 这是真正管用的那一半，实现怎么改都拦得住；
 *   2. **选择器层**（`容器类没有 hover 专属规则`）：直接扫 `src/` 的样式源码，
 *      断言 `:hover` 选择器里**不出现**卡片 / 列表容器类；这一半是给评审看的「意图声明」，
 *      也顺手把「哪些是真控件、允许 hover」记在案。
 */

/** 卡片 / 列表容器的类名（`:hover` 里不许出现这些） */
const CONTAINER_CLASSES = [
  'card',
  'post-card',
  'link-card',
  'admin-link-card',
  'user-post-card',
  'post',
  'list',
  'grid',
  'row',
]

/** 只扫判据需要的样式产物：`.vue` 的 `<style>` 与 `.css` */
function styleSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue
      out.push(...styleSources(full))
      continue
    }
    if (/\.(vue|css)$/.test(entry)) out.push(full)
  }
  return out
}

/** 从样式源码里抽出所有 `:hover` 所在的选择器文本 */
function hoverSelectors(text: string): string[] {
  const found: string[] = []
  // 选择器可能跨行（`.a:hover,\n.b:hover {`），所以按 `{` 切块、只看块头
  for (const block of text.split('{')) {
    const head = block.slice(block.lastIndexOf('}') + 1)
    if (head.includes(':hover')) {
      found.push(
        ...head
          .split(',')
          .map((s) => s.trim().split('\n').pop()?.trim() ?? '')
          .filter((s) => s.includes(':hover')),
      )
    }
  }
  return found
}

/**
 * 等一次「8bit 阶梯过渡」走完再读样式。
 *
 * 全站是 `transition: all 0.16s steps(4)`（`pixel.css`），状态一改立刻读 `getComputedStyle`
 * 拿到的是**过渡起点那一档** —— 直接读会把「焦点真的变了」读成「没变」（这个坑本门踩过一次，
 * 芯片导航那道门也踩过）。250ms 足够走完 160ms 的过渡。
 */
async function settled(page: Page): Promise<void> {
  await page.waitForTimeout(250)
}

/** 一张卡片的「视觉签名」：只取会被 hover / 焦点改动的那些属性 */
async function cardSignature(page: Page, index: number): Promise<Record<string, string>> {
  return page.evaluate((i) => {
    const card = document.querySelectorAll('[data-testid="post-card"]')[i] as HTMLElement
    const s = getComputedStyle(card)
    return {
      background: s.backgroundColor,
      borderColor: s.borderColor,
      borderWidth: s.borderWidth,
      outline: `${s.outlineStyle} ${s.outlineWidth}`,
      transform: s.transform,
      filter: s.filter,
      opacity: s.opacity,
      boxShadow: s.boxShadow,
    }
  }, index)
}

test('无 hover：卡片「被划过」的视觉与「被键盘选中」的视觉逐项相同', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('synthspark-icespark-sound-prompt', '1')
  })
  await page.goto('/posts')
  await booted(page)

  const cards = page.locator('[data-testid="post-card"]')
  // `booted()` 只等自检播完，列表数据是异步来的 —— 先等卡片或空态出现，再决定跳不跳
  await expect(cards.first().or(page.locator('.state').first()))
    .toBeVisible({ timeout: 15_000 })
    .catch(() => {})
  const total = await cards.count()
  test.skip(total < 2, '需要至少两张卡片才能对照（库里文章太少）')

  // 全程只对照**同一张**卡片（第 0 张）的三种状态：不同卡片可能有无封面等类名差异，
  // 拿两张不同的卡对照会把「版式差异」误判成「hover 差异」。
  const first = cards.nth(0)

  // ① 鼠标划过：等共享光标落上去（`is-focused` 是键盘与鼠标共用的那一套）
  await first.hover()
  await expect(first).toHaveClass(/is-focused/)
  await settled(page)
  const hovered = await cardSignature(page, 0)

  // ② 键盘把光标移走 → 第 0 张回到「未聚焦」
  await page.keyboard.press('ArrowRight')
  await expect(first).not.toHaveClass(/is-focused/)
  await settled(page)
  const unfocused = await cardSignature(page, 0)

  // ③ 先把指针**挪开**，再让键盘把光标移回来 → 第 0 张「被键盘选中但没被划过」。
  //    不挪指针的话它俩会叠在一起（键盘焦点 + 指针还在卡上），这一半就退化成了空转 ——
  //    实测：注入一条 `.card:hover { outline }`，不挪指针时这一半照样绿。
  await page.mouse.move(2, 2)
  await page.keyboard.press('ArrowLeft')
  await expect(first).toHaveClass(/is-focused/)
  await settled(page)
  const keyFocused = await cardSignature(page, 0)

  // 光标是真的（不给「未聚焦 == 聚焦」这种空转留口子）
  expect(unfocused, '未聚焦与聚焦的视觉应当不同（否则光标是假的）').not.toEqual(keyFocused)

  // ④ 铁律：划过 == 键盘选中，逐项相同 —— 卡片没有任何 hover 专属视觉
  expect(hovered, '卡片划过时的视觉必须与键盘选中时完全一致（无 hover 铁律）').toEqual(keyFocused)
})

test('无 hover：卡片 / 列表容器在选择器层面没有 hover 专属规则', () => {
  const root = join(process.cwd(), 'src')
  const offenders: string[] = []
  const allowed: string[] = []

  for (const file of styleSources(root)) {
    const selectors = hoverSelectors(readFileSync(file, 'utf8'))
    for (const selector of selectors) {
      const where = `${relative(process.cwd(), file)} → ${selector}`
      // 选择器里出现容器类就算违规（`.card:hover`、`.post-card:hover .title` 都算）
      const hits = CONTAINER_CLASSES.filter((cls) => new RegExp(`\\.${cls}\\b`).test(selector))
      if (hits.length) offenders.push(`${where}（命中容器类：${hits.join(', ')}）`)
      else allowed.push(where)
    }
  }

  expect(
    offenders,
    '卡片 / 列表容器不许有 hover 专属规则；划过只该移动共享焦点光标（真控件的 hover 允许）',
  ).toEqual([])

  // 反向自证：全站确实还有一些 `:hover`（按钮 / 芯片 / 链接），这道门不是「因为没有 :hover 才过的」
  expect(allowed.length, '真控件的 hover 反馈应当还在（本门只拦容器类）').toBeGreaterThan(0)
})

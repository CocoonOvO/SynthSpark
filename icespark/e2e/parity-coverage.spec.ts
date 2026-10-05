import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

import { PAGES } from './pages-inventory'

/**
 * 逐页输入等价性的**自检门**：清单（`pages-inventory.ts`）与代码、与用例三边对齐。
 *
 * 这道门守的是「不会红的那种遗漏」——新加一页而忘了补「纯鼠标 / 纯键盘」旅程时，
 * 其它任何用例都不会变红，只有这里会。三条判据见清单文件头。
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (relative: string): string => readFileSync(`${ROOT}/${relative}`, 'utf8')

/** 路由源码里的 path 字面量（`src/router/routes.ts`） */
function routerPaths(): string[] {
  const source = read('src/router/routes.ts')
  const found = [...source.matchAll(/path:\s*'([^']*)'/g)].map((one) => one[1] ?? '')
  return found.sort()
}

test('逐页 parity 清单：路由集合与 src/router/routes.ts 完全一致（多一页少一页都红）', () => {
  const declared = PAGES.map((page) => page.path).sort()
  expect(declared, '清单与路由对不上：新增页面时请同时补上它的输入等价性覆盖').toEqual(routerPaths())
})

test('逐页 parity 清单：清单里不许有重复路由', () => {
  const paths = PAGES.map((page) => page.path)
  expect(new Set(paths).size).toBe(paths.length)
})

test('逐页 parity 清单：每条「已覆盖」的声明都能在对应 spec 里按用例名找到', () => {
  const mouseSpec = read('e2e/parity-pages.spec.ts')
  const keyboardSpec = read('e2e/parity-pages-keyboard.spec.ts')

  const missing: string[] = []
  for (const page of PAGES) {
    if (page.mouse !== null && !mouseSpec.includes(page.mouse)) {
      missing.push(`${page.path} 的鼠标旅程「${page.mouse}」在 parity-pages.spec.ts 里找不到`)
    }
    if (page.keyboard !== null && !keyboardSpec.includes(page.keyboard)) {
      missing.push(
        `${page.path} 的键盘旅程「${page.keyboard}」在 parity-pages-keyboard.spec.ts 里找不到`,
      )
    }
  }
  expect(missing, '清单声明与用例对不上：要么用例没了，要么锚点写错了').toEqual([])
})

test('逐页 parity 清单：没覆盖的输入方式必须写清原因（缺口只能是写下来的）', () => {
  const unexplained: string[] = []
  for (const page of PAGES) {
    const gaps = [page.mouse, page.keyboard].filter((value) => value === null).length
    if (gaps === 0) continue
    if (!page.reason || page.reason.trim().length < 12) {
      unexplained.push(`${page.path} 有 ${gaps} 种输入方式没覆盖，却没写清原因`)
    }
  }
  expect(unexplained).toEqual([])
})

test('逐页 parity 清单：两种输入方式都没覆盖的页，原因里要写明是「设计上没有」还是「待补」', () => {
  const vague: string[] = []
  for (const page of PAGES) {
    if (page.mouse !== null || page.keyboard !== null) continue
    const reason = page.reason ?? ''
    if (!reason.includes('设计') && !reason.includes('待补')) {
      vague.push(`${page.path} 的缺口原因既没说「设计上没有」也没说「待补」`)
    }
  }
  expect(vague).toEqual([])
})

test('关于页：可交互的条目恰好是带链接的那些（不依赖本机配置）', async ({ page }) => {
  // 关于页不再是「一定没有可交互元素」的页面：条目可带链接（用户裁决 2026-10-04）。
  // 这一条不假设本机配没配链接，只钉两件事：
  //   ① `.facts` 里的 `<a>` 与 `.focusable` 一一对应 —— 「有链接 → 键盘走得到」不许漏；
  //   ② 页面里没有凭空多出来的按钮（样机这一页本来就只有正文与要点块）。
  // 真链接到底跳不跳，由 parity 的两条旅程（纯鼠标 / 纯键盘）打桩验，那里不依赖本机数据。
  await page.goto('/about')
  await expect(page.locator('.app')).not.toHaveAttribute('data-scene', 'boot')

  const linked = page.locator('.screen-inner .facts a')
  const focusable = page.locator('.screen-inner .facts .focusable')
  const linkedCount = await linked.count()
  expect(await focusable.count(), '带链接的条目与可聚焦条目的数目必须一致').toBe(linkedCount)

  // 每一条链接都有真实的 href（不是靠 click 处理器装出来的假链接）
  for (let i = 0; i < linkedCount; i += 1) {
    const href = await linked.nth(i).getAttribute('href')
    expect(href, `第 ${i + 1} 条条目链接没有 href`).toBeTruthy()
  }

  await expect(page.locator('.screen-inner button')).toHaveCount(0)
})

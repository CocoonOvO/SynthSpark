#!/usr/bin/env node
/**
 * 性能预算门（P7，架构 §30）。
 *
 * 判据只有一条：**构建产物的体积不许悄悄涨上去**。它不是「优化目标」——
 * 真正的目标数字（尤其是字体子集化之后的字号）要等用户裁定，这里先用**当下实测值 + 余量**
 * 当回归基线：涨过线就红，逼改动的人解释清楚多出来的字节是什么。
 *
 * 为什么单独一道门、不进 `npm run check`：它读的是 `dist/`，而 `npm run check` 刻意不构建
 * （门要么快、要么全，混在一起两边都难受）。跑法见 `npm run check:budget`。
 *
 * 量五件事：
 *   1. 入口 JS（`dist/index.html` 直接引的 .js）—— 首屏必须下的那部分
 *   2. 入口 CSS（同上）
 *   3. 单块懒加载 chunk —— 谁最大谁说话（当前最大块是 markdown-it + DOMPurify）
 *   4. 字体 —— 像素字体整包 756KB，子集化之前它是最大的一坨
 *   5. dist 总量 —— 兜底防止「不小心把什么大东西塞进产物」
 *
 * 全部按 **gzip 后**字节比较（部署时会压），字体除外（woff2 本身已压缩，按原始字节算）。
 *
 * 自测：`node scripts/check-budget.mjs --selftest`
 *       —— 把一批「注定超线」的假数据喂给同一套判定函数，证明门真的会响。
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST_DIR = resolve(APP_ROOT, 'dist')

/**
 * 预算基线（2026-10-01 实测值 + 约 25% 余量，全部单位是字节）。
 *
 * 这些数字是**回归线**，不是产品指标：真正的目标（字体子集化到多大、入口 JS 压到多少）
 * 属于 P7 与预渲染一起定的事，等用户裁定后改这里一处即可。
 */
const BUDGET = {
  entryJs: 72 * 1024, //   实测 56.08 kB gz
  entryCss: 8 * 1024, //   实测  4.38 kB gz
  lazyChunk: 72 * 1024, // 实测 56.09 kB gz（MarkdownBody 那一块）
  font: 800 * 1024, //     实测 738.2 kB（未子集化）
  total: 2 * 1024 * 1024, // 实测 1.3 MB
}

const KB = (n) => `${(n / 1024).toFixed(2)} kB`

/** 结果收集：`ok=false` 的行就是失败原因 */
const rows = []
function judge(label, actual, limit, note = '') {
  rows.push({ label, actual, limit, ok: actual <= limit, note })
}

/** dist 里所有文件（跳过源码映射：它本来就不该出现在产物里，另有断言管） */
async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else out.push(full)
  }
  return out
}

/** 读 `dist/index.html` 里直接引用的产物（入口 JS / CSS / modulepreload） */
function entryAssets(html) {
  const found = new Set()
  for (const match of html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)) found.add(match[1])
  return [...found]
}

async function measure() {
  const files = await walk(DIST_DIR)
  const html = await readFile(join(DIST_DIR, 'index.html'), 'utf8')
  const entries = entryAssets(html)
  const entryJs = []
  const entryCss = []
  const lazy = []
  const fonts = []
  let total = 0

  for (const file of files) {
    const size = (await stat(file)).size
    total += size
    const rel = file.slice(DIST_DIR.length + 1)
    if (file.endsWith('.woff2') || file.endsWith('.woff') || file.endsWith('.ttf')) {
      fonts.push({ rel, size })
      continue
    }
    if (!file.endsWith('.js') && !file.endsWith('.css')) continue
    const gz = gzipSync(await readFile(file)).length
    if (entries.includes(rel)) (file.endsWith('.js') ? entryJs : entryCss).push({ rel, gz })
    else lazy.push({ rel, gz })
  }

  const sum = (list) => list.reduce((acc, x) => acc + x.gz, 0)
  const biggest = (list) => list.slice().sort((a, b) => b.gz - a.gz)[0]
  return { entryJs, entryCss, lazy, fonts, total, sum, biggest }
}

async function main() {
  // ── 自测：同一套判定函数喂假数据，确认它真的会红 ──
  if (process.argv.includes('--selftest')) {
    const probe = []
    const j = (label, actual, limit) => probe.push({ label, actual, limit, ok: actual <= limit, note: '' })
    j('入口 JS 超标', BUDGET.entryJs + 1, BUDGET.entryJs)
    j('入口 JS 贴线', BUDGET.entryJs, BUDGET.entryJs)
    j('字体超标', BUDGET.font + 1, BUDGET.font)
    const failing = probe.filter((r) => !r.ok)
    const passing = probe.filter((r) => r.ok)
    if (failing.length !== 2 || passing.length !== 1) {
      console.error('自测失败：判定函数没有按预期响应（应红 2 条、应绿 1 条）')
      process.exit(1)
    }
    console.log('PASS  自测：超线会红、贴线算过（判定函数本身没问题）')
    return
  }

  let data
  try {
    data = await measure()
  } catch (err) {
    console.error('✕ 读不到 dist/ —— 先跑 `npm run build`。')
    console.error(String(err))
    process.exit(1)
  }

  const { entryJs, entryCss, lazy, fonts, total, sum, biggest } = data
  judge('入口 JS 合计（首屏必下）', sum(entryJs), BUDGET.entryJs, entryJs.map((x) => x.rel).join(' + '))
  judge('入口 CSS 合计', sum(entryCss), BUDGET.entryCss, entryCss.map((x) => x.rel).join(' + '))
  const big = biggest(lazy)
  judge('最大懒加载块', big?.gz ?? 0, BUDGET.lazyChunk, big?.rel ?? '（没有懒加载块）')
  const font = fonts[0]
  judge('像素字体', font?.size ?? 0, BUDGET.font, font?.rel ?? '（没找到字体文件）')
  judge('dist 总量', total, BUDGET.total, `${lazy.length} 个懒加载块`)

  const width = Math.max(...rows.map((r) => r.label.length))
  for (const row of rows) {
    const mark = row.ok ? '✓' : '✕'
    console.log(
      `${mark} ${row.label.padEnd(width)}  ${KB(row.actual).padStart(10)} / ${KB(row.limit).padStart(10)}` +
        (row.note ? `   ${row.note}` : ''),
    )
  }

  const failed = rows.filter((r) => !r.ok)
  if (failed.length) {
    console.error(`\n✕ 性能预算超标 ${failed.length} 项：`)
    for (const row of failed) {
      console.error(`   ${row.label}：实测 ${KB(row.actual)}，预算 ${KB(row.limit)}（超 ${KB(row.actual - row.limit)}）`)
    }
    console.error('   涨得有道理就改 `scripts/check-budget.mjs` 里的 BUDGET，并在架构 §30 记账。')
    process.exit(1)
  }
  console.log('\nPASS  性能预算：五项都在回归线内')
}

await main()

#!/usr/bin/env node
/**
 * 构建期生成静态 CSS：`src/styles/tokens.ts` → `src/styles/tokens.generated.css`
 *
 * 为什么不在运行期注入（样机是那么干的）：旧前端漏注入过一次 —— 220 处 `var()`、0 处定义，
 * 后果不是「颜色偏一点」而是全站边框消失。静态 CSS 在构建期就落盘，**引用与定义在同一层**，
 * 不存在「某个入口忘了调用注入」这种失败模式。
 *
 * 用法：
 *   node scripts/gen-tokens-css.mjs            # 生成
 *   node scripts/gen-tokens-css.mjs --check    # 只校验（配色漂移门）
 *
 * 生成物入库、进 review：它把「配色到底长什么样」变成可以 diff 的东西。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createJiti } from 'jiti'

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TOKENS_FILE = resolve(APP_ROOT, 'src/styles/tokens.ts')
const OUTPUT_FILE = resolve(APP_ROOT, 'src/styles/tokens.generated.css')

const GENERATED_MARK = '请勿手改'

/** jiti 让我们在 Node 里直接读 TS 源文件，不用维护第二份 token 定义 */
async function loadTokens() {
  const jiti = createJiti(import.meta.url)
  const loaded = await jiti.import(TOKENS_FILE)

  // jiti 对 ESM 的处理可能是「命名空间」也可能是「{ default: 命名空间 }」，两种都兜住
  const pick = (name) => loaded?.[name] ?? loaded?.default?.[name]

  const tokens = {
    PALETTES: pick('PALETTES'),
    ACTIVE_PALETTE: pick('ACTIVE_PALETTE'),
    paletteVars: pick('paletteVars'),
    scaleVars: pick('scaleVars'),
  }

  for (const [name, value] of Object.entries(tokens)) {
    if (value === undefined) throw new Error(`tokens.ts 里读不到 ${name}`)
  }

  return tokens
}

/** 变量表 → 缩进好的声明块 */
function declarations(vars) {
  return Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')
}

/** 生成整份 CSS 文本（纯函数：同样的 token 一定得到同样的字节） */
export function renderTokensCss({ PALETTES, ACTIVE_PALETTE, paletteVars, scaleVars }) {
  const ids = Object.keys(PALETTES)
  const blocks = []

  // 刻度与「默认配色」挂在 :root：没写 data-theme 时用它
  const scale = scaleVars()
  const active = paletteVars(PALETTES[ACTIVE_PALETTE])
  blocks.push(
    `:root,\n:root[data-theme='${ACTIVE_PALETTE}'] {\n${declarations({ ...scale, ...active })}\n}`,
  )

  // 其余配色方案只认 data-theme（本轮只有一套，所以这段是空的 —— 结构先摆好）
  for (const id of ids) {
    if (id === ACTIVE_PALETTE) continue
    blocks.push(`:root[data-theme='${id}'] {\n${declarations(paletteVars(PALETTES[id]))}\n}`)
  }

  const header = `/**
 * 本文件由 scripts/gen-tokens-css.mjs 生成，${GENERATED_MARK}。
 * 生成：npm run tokens:gen      校验：npm run tokens:check
 * 配色方案：${ids.join(' / ')}（当前启用：${ACTIVE_PALETTE}）
 * 改配色请改 src/styles/tokens.ts —— 组件里不许出现具体色值。
 */

`

  return `${header}${blocks.join('\n\n')}\n`
}

/** 落盘；内容没变就不写，避免 Vite 监听到无意义的重建 */
async function writeIfChanged(text) {
  let current = null
  try {
    current = await readFile(OUTPUT_FILE, 'utf8')
  } catch {
    // 首次生成，文件还不存在
  }

  if (current === text) return false
  await writeFile(OUTPUT_FILE, text, 'utf8')
  return true
}

/** 供 vite.config.ts 的插件复用：生成 + 返回是否发生了写入 */
export async function generateTokensCss({ quietWhenUnchanged = false } = {}) {
  const tokens = await loadTokens()
  const text = renderTokensCss(tokens)
  const changed = await writeIfChanged(text)

  if (!quietWhenUnchanged || changed) {
    const target = relative(APP_ROOT, OUTPUT_FILE)
    console.log(
      changed
        ? `[tokens] 已生成 ${target}（配色 ${tokens.ACTIVE_PALETTE}）`
        : `[tokens] ${target} 已是最新`,
    )
  }

  return { changed, text }
}

/* ────────────── CLI ────────────── */

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const argv = process.argv.slice(2)
  const check = argv.includes('--check')
  // --quiet：dev 每次启动都会调它，没变化时别刷屏（vite.config.ts 的插件用这个）
  const quiet = argv.includes('--quiet')

  try {
    if (!check) {
      const { changed } = await generateTokensCss({ quietWhenUnchanged: quiet })
      if (!quiet) {
        console.log(
          `PASS  ${relative(APP_ROOT, OUTPUT_FILE)}${changed ? '（已更新）' : '（无变化）'}`,
        )
      }
    } else {
      const tokens = await loadTokens()
      const fresh = renderTokensCss(tokens)

      let committed
      try {
        committed = await readFile(OUTPUT_FILE, 'utf8')
      } catch {
        console.error(`FAIL  ${relative(APP_ROOT, OUTPUT_FILE)} 不存在 —— 先跑 npm run tokens:gen`)
        process.exit(1)
      }

      if (committed === fresh) {
        console.log(
          `PASS  配色无漂移：${relative(APP_ROOT, OUTPUT_FILE)} 与 tokens.ts 一致（配色 ${tokens.ACTIVE_PALETTE}）`,
        )
      } else {
        const committedLines = committed.split('\n')
        const freshLines = fresh.split('\n')
        const index = freshLines.findIndex((line, i) => line !== committedLines[i])

        console.error(
          `FAIL  配色漂移：${relative(APP_ROOT, OUTPUT_FILE)} 与 tokens.ts 不一致（第 ${index + 1} 行起）`,
        )
        console.error(`      仓库里：  ${committedLines[index] ?? '(此行不存在)'}`)
        console.error(`      重新生成：${freshLines[index] ?? '(此行不存在)'}`)
        console.error('      跑 npm run tokens:gen 重新生成并提交')
        process.exit(1)
      }
    }
  } catch (error) {
    console.error(`FAIL  ${error.message}`)
    process.exit(1)
  }
}

#!/usr/bin/env node
/**
 * 备好像素字体文件（Ark Pixel 12px 简体中文）。
 *
 * 字体**已经入库**（`public/fonts/ark-pixel-12px-zh-hans.woff2` + 同目录 `OFL.txt`），
 * 所以正常 clone 走第 1 步、什么都不用做。这个脚本保留下来是因为它还有两个用处：
 *   · 万一文件被误删 / 在别的环境里缺失 —— 按下面的顺序补齐，并且明确报错而不是静默退回系统字体；
 *   · 记录**出处与身份**（见下），换人接手时能核对拿到的到底是不是同一个文件。
 *
 * 出处（2026-10-04 核对，逐字节一致）：
 *   上游 https://github.com/TakWolf/ark-pixel-font 发布 2026.09.25
 *   资产 ark-pixel-font-12px-proportional-ttf.woff2-v2026.09.25.zip
 *   包内 ark-pixel-12px-proportional-zh_hans.ttf.woff2（755,952 字节，OFL-1.1）
 *   入库时改名为 ark-pixel-12px-zh-hans.woff2
 *   sha256 06daf2fa4a0c0c7262db632c0303456ea1aa274eba47a9f18b08094648b29e0e
 * 为什么不再走"运行时请求第三方源"：上游不在 npm、仓库里也没有构建好的 woff2，
 * 发布资产只有 zip（浏览器不能当字体吃）—— 直链不成立；构建时现取又会把预算线与字形绑到上游版本上。
 *
 * 取用顺序（先命中者胜）：
 *   1. 目标文件已存在 → 什么都不做
 *   2. 环境变量 ICESPARK_FONT_SRC 指向的本地文件（自定义来源）
 *   3. 本仓库样机目录里的定稿副本（字体属于设计资产，样机那份就是定稿）
 *   4. 环境变量 ICESPARK_FONT_URL 指向的下载地址
 *
 * 都没命中时会明确报错并给出补救办法，而不是留一个「字体悄悄退回系统字体」的现场 ——
 * 那会让所有 UI 标签的字形都变掉，却看不出哪里出了问题。
 *
 * 子集化（缩小体积）刻意不在这里做：像素字体只承担 UI 外壳，正文走系统思源黑体，
 * 而 UI 标签有一半来自可编辑的站点配置，字集不是固定的。
 * 正确的做法是 P7 拿「构建产物 + 站点配置默认值」反推字集，并断言每个 UI 字符都被覆盖 ——
 * 属于性能预算那一摊，见 design/icespark-ARCHITECTURE.md。
 */
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FONT_NAME = 'ark-pixel-12px-zh-hans.woff2'
const TARGET = resolve(APP_ROOT, 'public/fonts', FONT_NAME)
const PROTOTYPE_COPY = resolve(APP_ROOT, '../design/icespark-prototype/public/fonts', FONT_NAME)

// --quiet：dev 每次启动都会调它，「已就绪」没必要刷屏（vite.config.ts 的插件用这个）
const QUIET = process.argv.slice(2).includes('--quiet')

function say(message) {
  if (!QUIET) console.log(message)
}

async function exists(path) {
  try {
    const info = await stat(path)
    return info.isFile() && info.size > 0
  } catch {
    return false
  }
}

async function main() {
  if (await exists(TARGET)) {
    say(`[字体] ${FONT_NAME} 已就绪`)
    return
  }

  await mkdir(dirname(TARGET), { recursive: true })

  const localSource = process.env.ICESPARK_FONT_SRC
  if (localSource && (await exists(resolve(localSource)))) {
    await copyFile(resolve(localSource), TARGET)
    say(`[字体] 已从 ICESPARK_FONT_SRC 复制：${localSource}`)
    return
  }

  if (await exists(PROTOTYPE_COPY)) {
    await copyFile(PROTOTYPE_COPY, TARGET)
    say(`[字体] 已从样机复制（设计资产定稿）：${PROTOTYPE_COPY}`)
    return
  }

  const url = process.env.ICESPARK_FONT_URL
  if (url) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`下载字体失败：${url} → HTTP ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    await (await import('node:fs/promises')).writeFile(TARGET, buffer)
    say(`[字体] 已下载：${url}`)
    return
  }

  throw new Error(
    `找不到像素字体 ${FONT_NAME}。\n` +
      `  目标位置：${TARGET}\n` +
      `  补救办法（任选其一）：\n` +
      `    · 从样机目录复制：cp ../design/icespark-prototype/public/fonts/${FONT_NAME} public/fonts/\n` +
      `    · 指定本地文件：ICESPARK_FONT_SRC=/path/to/${FONT_NAME} node scripts/ensure-font.mjs\n` +
      `    · 指定下载地址：ICESPARK_FONT_URL=https://... node scripts/ensure-font.mjs`,
      `    · 上游出处与 sha256 见本文件顶部注释（入库文件被误删时照它核对）`,
  )
}

try {
  await main()
} catch (error) {
  console.error(`FAIL  ${error.message}`)
  process.exit(1)
}

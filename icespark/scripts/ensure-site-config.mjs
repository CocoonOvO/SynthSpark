#!/usr/bin/env node
/**
 * 备好 `public/site.config.json`（站点配置三级合并的**第二级**）。
 *
 * 与旧前端同一套做法：仓库里入库的是**模板** `public/site.config.example.json`，
 * 工作副本 `public/site.config.json` 由脚本在 dev / build 时自动生成并 gitignore —— 因为
 *   1. 部署方需要能**手改**这个文件（它要出现在 dist/ 里，不需要 node 环境）；
 *   2. 它按环境不同（本机调试可能想改口号、改导航），不该进版本库；
 *   3. 少了它，第二级就是一句空话，而且 `fetch('/site.config.json')` 会在控制台留一个 404。
 *
 * 已存在则**不覆盖**（用户的编辑不能被脚本冲掉）。
 *
 * 用法：node scripts/ensure-site-config.mjs [--quiet]
 */
import { copyFile, readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE = resolve(APP_ROOT, 'public/site.config.example.json')
const TARGET = resolve(APP_ROOT, 'public/site.config.json')

// --quiet：dev 每次启动都会调它，「已生成」没必要刷屏（vite.config.ts 的插件用这个）
const QUIET = process.argv.slice(2).includes('--quiet')

async function exists(path) {
  try {
    await readFile(path)
    return true
  } catch {
    return false
  }
}

try {
  if (await exists(TARGET)) {
    if (!QUIET) console.log('[站点配置] public/site.config.json 已存在，保持不动')
    process.exit(0)
  }

  await copyFile(TEMPLATE, TARGET)
  console.log(
    `[站点配置] 已从模板生成 ${relative(APP_ROOT, TARGET)}（可手改；它不入库，见 .gitignore）`,
  )
} catch (error) {
  console.error(`FAIL  ${error.message}`)
  process.exit(1)
}

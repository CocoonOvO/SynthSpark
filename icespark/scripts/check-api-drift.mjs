#!/usr/bin/env node
/**
 * 契约漂移门。
 *
 * 重新从后端生成一遍类型，和仓库里的 `src/api/schema.d.ts` 逐行比对：
 * 不一致 = 后端接口变了，前端类型没跟上（或者有人手改了生成物）。
 * 必须跑 `npm run api:gen` 后一起提交，让差异在 code review 里被看见。
 *
 * 用法：
 *   npm run api:check
 *   node scripts/check-api-drift.mjs --spec ./tmp/openapi.json
 *
 * 退出码：0 = 一致；1 = 漂移或生成物缺失；2 = 拿不到契约（后端没跑 / 路径不对）。
 */
import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'

import { APP_ROOT, SCHEMA_FILE, firstDifference, parseArgs, renderSchema } from './lib/openapi.mjs'

const USAGE = `契约漂移门

用法：node scripts/check-api-drift.mjs [--spec <文件|URL>]

默认契约来源：${process.env.ICESPARK_OPENAPI || 'http://localhost:8002/api/openapi.json'}
`

const args = parseArgs(process.argv.slice(2))
const schemaRel = relative(APP_ROOT, SCHEMA_FILE)

if (args.help) {
  process.stdout.write(USAGE)
  process.exit(0)
}

// 1. 生成物必须在仓库里（它是被 review 的产物，不是构建缓存）
let committed
try {
  committed = await readFile(SCHEMA_FILE, 'utf8')
} catch {
  console.error(`FAIL  ${schemaRel} 不存在 —— 先跑 npm run api:gen`)
  process.exit(1)
}

// 2. 拿契约并重新生成
let fresh
try {
  fresh = await renderSchema(args.spec)
} catch (error) {
  console.error(`FAIL  ${error.message}`)
  process.exit(2)
}

// 3. 逐行比对
const difference = firstDifference(committed, fresh.text)

if (difference === null) {
  console.log(`PASS  契约无漂移：${schemaRel} 与后端一致`)
  console.log(
    `      契约 ${fresh.source} · ${fresh.summary.paths} paths / ${fresh.summary.operations} operations / ` +
      `${fresh.summary.schemas} schemas · sha256:${fresh.fingerprint}`,
  )
  process.exit(0)
}

console.error(`FAIL  契约漂移：${schemaRel} 与后端不一致（第 ${difference.line} 行起）`)
console.error(`      仓库里：  ${difference.committed ?? '(此行不存在)'}`)
console.error(`      重新生成：${difference.fresh ?? '(此行不存在)'}`)
console.error(`      行数：${difference.committedLines} → ${difference.freshLines}`)
console.error(`      契约来源：${fresh.source}`)
console.error('      跑 npm run api:gen 重新生成并提交；接口改动是预期结果时，这就是该看见的差异')
process.exit(1)

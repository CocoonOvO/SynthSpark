#!/usr/bin/env node
/**
 * 契约类型生成：后端 /api/openapi.json → src/api/schema.d.ts
 *
 * 用法：
 *   npm run api:gen                       # 用默认后端（8002）
 *   node scripts/gen-api-types.mjs --spec ./tmp/openapi.json
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'

import { APP_ROOT, SCHEMA_FILE, parseArgs, renderSchema } from './lib/openapi.mjs'

const USAGE = `生成 src/api/schema.d.ts

用法：node scripts/gen-api-types.mjs [--spec <文件|URL>]

默认契约来源：${process.env.ICESPARK_OPENAPI || 'http://localhost:8002/api/openapi.json'}
`

const args = parseArgs(process.argv.slice(2))

if (args.help) {
  process.stdout.write(USAGE)
  process.exit(0)
}

try {
  const { text, source, summary, fingerprint } = await renderSchema(args.spec)

  await mkdir(dirname(SCHEMA_FILE), { recursive: true })
  await writeFile(SCHEMA_FILE, text, 'utf8')

  console.log(`PASS  已生成 ${relative(APP_ROOT, SCHEMA_FILE)}（${text.split('\n').length} 行）`)
  console.log(
    `      契约 ${source} · ${summary.paths} paths / ${summary.operations} operations / ` +
      `${summary.schemas} schemas · sha256:${fingerprint}`,
  )
} catch (error) {
  console.error(`FAIL  ${error.message}`)
  process.exit(1)
}

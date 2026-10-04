/**
 * 契约类型生成的共用逻辑（gen-api-types.mjs 与 check-api-drift.mjs 都用它）。
 *
 * 真相来源只有一个：后端 `GET /api/openapi.json`。
 * 前端不维护第二份手写的接口类型 —— 旧前端那 20 处响应结构不匹配，
 * 就是因为类型是手抄的、而后端改了。
 *
 * 可用 `--spec <文件|URL>` 或环境变量 `ICESPARK_OPENAPI` 指定别的契约来源
 * （离线比对、拿一份存档的 openapi.json 复现问题时用）。
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import openapiTS, { astToString } from 'openapi-typescript'

/** icespark/ 的绝对路径 */
export const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 生成物落点 */
export const SCHEMA_FILE = resolve(APP_ROOT, 'src/api/schema.d.ts')

/** 默认契约地址（后端 8002，见 AGENTS.md 第 3 节） */
export const DEFAULT_SPEC = process.env.ICESPARK_OPENAPI || 'http://localhost:8002/api/openapi.json'

/** 解析命令行参数；不认识的参数直接报错，避免拼错了静默跑默认值 */
export function parseArgs(argv) {
  const args = { spec: DEFAULT_SPEC, help: false }

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--spec' || item === '-s') {
      const value = argv[i + 1]
      if (!value) throw new Error('--spec 后面要跟一个文件路径或 URL')
      args.spec = value
      i += 1
    } else if (item.startsWith('--spec=')) {
      args.spec = item.slice('--spec='.length)
    } else if (item === '--help' || item === '-h') {
      args.help = true
    } else {
      throw new Error(`无法识别的参数：${item}`)
    }
  }

  return args
}

/** 展示用来源名：URL 原样，文件路径转成相对 icespark/ 的写法 */
export function describeSource(source) {
  if (/^https?:\/\//i.test(source)) return source
  const abs = resolve(source)
  const rel = relative(APP_ROOT, abs)
  return rel.startsWith('..') ? abs : rel
}

/** 取契约原文（不解析），失败时抛出带出路的错误 */
export async function loadSpec(source) {
  if (/^https?:\/\//i.test(source)) {
    let response
    try {
      response = await fetch(source, { headers: { accept: 'application/json' } })
    } catch (error) {
      const cause = error && error.cause && error.cause.code ? `（${error.cause.code}）` : ''
      throw new Error(
        `后端不可达：${source}${cause}。契约门需要后端在跑（默认 8002），` +
          `或者用 --spec 指向一份 openapi.json`,
      )
    }
    if (!response.ok) throw new Error(`取契约失败：${source} → HTTP ${response.status}`)
    return await response.text()
  }

  try {
    return await readFile(resolve(source), 'utf8')
  } catch (error) {
    throw new Error(`读不到契约文件：${describeSource(source)}（${error.message}）`)
  }
}

/** 契约摘要：路径数 / 操作数 / 模型数 */
export function summarize(spec) {
  const paths = spec && typeof spec.paths === 'object' && spec.paths !== null ? spec.paths : {}
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'])

  let operations = 0
  for (const item of Object.values(paths)) {
    for (const method of Object.keys(item || {})) {
      if (methods.has(method.toLowerCase())) operations += 1
    }
  }

  const schemas =
    spec &&
    spec.components &&
    typeof spec.components.schemas === 'object' &&
    spec.components.schemas
      ? Object.keys(spec.components.schemas).length
      : 0

  return { paths: Object.keys(paths).length, operations, schemas }
}

/** 生成文件头：带生成标记（独立性门据此跳过生成物）与契约指纹 */
function banner(source, summary, fingerprint) {
  return `/**
 * 本文件由 openapi-typescript 生成，请勿手改。
 * 生成：npm run api:gen      校验：npm run api:check
 * 契约来源：${source}
 * 契约摘要：${summary.paths} paths / ${summary.operations} operations / ${summary.schemas} schemas
 * 契约指纹：sha256:${fingerprint}
 */

`
}

/**
 * 取契约 → 生成 TS 类型文本（含文件头）。
 *
 * 指纹算在**规范化 JSON** 上（而不是响应字节），这样后端换个序列化格式不会误报漂移，
 * 但任何一个字段、任何一个类型的变化都会让指纹变。
 */
export async function renderSchema(source) {
  const raw = await loadSpec(source)

  let spec
  try {
    spec = JSON.parse(raw)
  } catch {
    throw new Error(`契约不是合法 JSON：${describeSource(source)}`)
  }

  if (!spec || typeof spec !== 'object' || !spec.paths) {
    throw new Error(`契约里没有 paths，不像一份 OpenAPI 文档：${describeSource(source)}`)
  }

  const summary = summarize(spec)
  const fingerprint = createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0, 16)

  const body = astToString(await openapiTS(spec))

  return {
    text: banner(describeSource(source), summary, fingerprint) + body,
    source: describeSource(source),
    summary,
    fingerprint,
  }
}

/** 逐行比对，返回第一处差异（两边完全一致则 null） */
export function firstDifference(left, right) {
  const a = left.split('\n')
  const b = right.split('\n')
  const max = Math.max(a.length, b.length)

  for (let i = 0; i < max; i += 1) {
    if (a[i] !== b[i]) {
      return {
        line: i + 1,
        committed: a[i],
        fresh: b[i],
        committedLines: a.length,
        freshLines: b.length,
      }
    }
  }

  return null
}

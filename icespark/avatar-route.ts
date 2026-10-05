/**
 * icespark 自己的点阵头像路由（架构 §67）。
 *
 * **它只在 icespark 的 dev / preview 服务器里活着** —— `vite.config.ts` 把这里造出来的
 * 中间件挂到 `server.middlewares` 与 `preview.middlewares` 上。部署若只是「nginx 发 dist
 * + 反代 /api」，这条路由不存在，前端必须优雅退到「后端头像 → 名字回退」
 * （客户端 `stores/avatars.ts` 就是这么处理的：拿不到就永久标记 unavailable）。
 *
 * 它为什么在**前端**而不是后端：这套点阵的 8 个色就是 icespark 的调色板，
 * 换个配色或换到旧前端就不搭了 —— 它是**这一套前端皮肤的特化件**，所以由前端自己管。
 * 因此存储也是前端自己的一个本地文件（`avatars.local.json`，**不入库**），
 * 这跟「是不是这台机器上的东西」无关，纯粹是归属问题。
 *
 * 四个动作：
 *   `GET    /avatar`            公开，返回整份映射（前端一次拉完，session 内缓存）
 *   `GET    /avatar/<username>`  公开，返回某一个（给单点查询 / 排查用）
 *   `POST   /avatar`            需要 `Authorization: Bearer <令牌>`，体是 `{ rows }`
 *   `DELETE /avatar`            同上，删掉自己的那一条
 *
 * 写操作**借后端鉴权**：拿令牌去 `${apiTarget}/api/auth/me` 换出用户身份，换不到就 401。
 * 这样「谁能写」这条判断永远只有后端一个来源，前端这份文件不需要自己维护账号体系，
 * 也不可能被伪造的 username 冒名顶替（username 只从后端响应里取）。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname } from 'node:path'

import { GRID_COLS, GRID_ROWS, normalizeGrid, parseGridInput, type AvatarRows } from './src/signal/pixel-grid'

/** 存储文件的格式版本（将来换格式时靠它认） */
export const AVATAR_FILE_VERSION = 1

/** 说明写进文件里，手改的人一眼知道这是什么、能不能删 */
const FILE_NOTE =
  'icespark 的点阵头像存储（前端自己的本地文件，已 gitignore，不入库）。' +
  'key 是用户名，rows 是十六行 × 十六个调色板下标（0-7）。删掉整个文件等于清空所有点阵头像。'

/** 单条记录 */
export interface AvatarRecord {
  rows: AvatarRows
  /** 后端返回的用户 id，只作参考（key 用的是用户名，只读不写，改名不存在） */
  userId?: string
  /** ISO 时间串 */
  updatedAt: string
}

export interface AvatarStoreFile {
  version: number
  avatars: Record<string, AvatarRecord>
}

/** 请求体上限：16×16 的文本撑死几 KB，超过就是有人在塞垃圾 */
export const MAX_BODY_BYTES = 4096

/** 读文件；不存在 → 空表（第一次保存时自然创建） */
export async function readAvatarFile(file: string): Promise<AvatarStoreFile> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: AVATAR_FILE_VERSION, avatars: {} }
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`头像文件不是合法 JSON：${file}（修好它、或删掉它再来）`)
  }
  const avatars = (parsed as { avatars?: unknown })?.avatars
  if (!avatars || typeof avatars !== 'object') return { version: AVATAR_FILE_VERSION, avatars: {} }
  const clean: Record<string, AvatarRecord> = {}
  for (const [name, value] of Object.entries(avatars as Record<string, unknown>)) {
    const rows = normalizeGrid((value as { rows?: unknown })?.rows)
    if (!rows) continue // 坏条目直接跳过：一个手改坏的行不该让整份文件失效
    const record = value as Partial<AvatarRecord>
    clean[name] = {
      rows,
      ...(record.userId ? { userId: record.userId } : {}),
      updatedAt: record.updatedAt ?? new Date().toISOString(),
    }
  }
  return { version: AVATAR_FILE_VERSION, avatars: clean }
}

/** 写文件：先写临时文件再 rename（避免半个文件），并且串行化，免得两次保存互相覆盖 */
let writeChain: Promise<void> = Promise.resolve()

export function writeAvatarFile(file: string, data: AvatarStoreFile): Promise<void> {
  const payload = JSON.stringify({ _说明: FILE_NOTE, ...data }, null, 2) + '\n'
  const task = async () => {
    await mkdir(dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    await writeFile(tmp, payload, 'utf8')
    await rename(tmp, file)
  }
  writeChain = writeChain.then(task, task)
  return writeChain
}

/** 用令牌去后端换身份；换不到返回 null */
async function verifyToken(
  fetchImpl: typeof globalThis.fetch,
  apiTarget: string,
  token: string,
): Promise<{ username: string; userId?: string } | null> {
  try {
    const res = await fetchImpl(`${apiTarget}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const user = (await res.json()) as { username?: unknown; id?: unknown }
    if (typeof user?.username !== 'string' || user.username.length === 0) return null
    return { username: user.username, ...(typeof user.id === 'string' ? { userId: user.id } : {}) }
  } catch {
    // 后端没起来时按「验不过」处理：宁可 401，也不要写进一个未经鉴权的名字
    return null
  }
}

/** 读 JSON 体（带上限） */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error(`请求体超过 ${MAX_BODY_BYTES} 字节`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text.trim()) return resolve(null)
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  // 本地存储、随时会变：不要任何缓存（客户端自己拿 store 缓存一次）
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

export interface AvatarRouteOptions {
  /** 存储文件路径（`icespark/avatars.local.json`，已 gitignore） */
  file: string
  /** 后端地址，默认 `http://localhost:8002` */
  apiTarget: string
  /** 注入用：测试里换成假的 fetch */
  fetchImpl?: typeof globalThis.fetch
}

/**
 * 造一个 connect 中间件。不是 /avatar 的请求原样 `next()`，
 * 所以它能在 Vite 的中间件链里与静态资源、SPA 回退并存。
 */
export function createAvatarRoute(options: AvatarRouteOptions) {
  const { file, apiTarget, fetchImpl = globalThis.fetch } = options

  /** 从 Authorization 头取令牌 */
  const tokenOf = (req: IncomingMessage): string | null => {
    const raw = req.headers.authorization
    if (typeof raw !== 'string') return null
    const match = /^Bearer\s+(.+)$/i.exec(raw.trim())
    return match?.[1]?.trim() || null
  }

  return function avatarRoute(req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void): void {
    const url = new URL(req.url ?? '/', 'http://icespark.local')
    if (url.pathname !== '/avatar' && !url.pathname.startsWith('/avatar/')) return next()

    const method = (req.method ?? 'GET').toUpperCase()
    const rest = url.pathname.slice('/avatar'.length).replace(/^\//, '')

    void (async () => {
      // ── 公开读 ────────────────────────────────────────────────
      if (method === 'GET' && rest === '') {
        const data = await readAvatarFile(file)
        return sendJson(res, 200, { version: data.version, avatars: data.avatars })
      }
      if (method === 'GET' && rest !== '') {
        const username = decodeURIComponent(rest)
        const data = await readAvatarFile(file)
        const record = data.avatars[username]
        if (!record) return sendJson(res, 404, { detail: `没有这个用户的点阵头像：${username}` })
        return sendJson(res, 200, { username, ...record })
      }

      // ── 写：先借后端验明身份 ──────────────────────────────────
      if (method === 'POST' || method === 'DELETE') {
        const token = tokenOf(req)
        if (!token) return sendJson(res, 401, { detail: '缺少令牌：保存点阵头像需要登录' })
        const who = await verifyToken(fetchImpl, apiTarget, token)
        if (!who) return sendJson(res, 401, { detail: '令牌无效或已过期' })

        const data = await readAvatarFile(file)

        if (method === 'DELETE') {
          const existed = who.username in data.avatars
          delete data.avatars[who.username]
          await writeAvatarFile(file, data)
          return sendJson(res, 200, { username: who.username, removed: existed })
        }

        const body = (await readJsonBody(req)) as { rows?: unknown } | null
        const rows = normalizeGrid(body?.rows)
        if (!rows) {
          const parsed = parseGridInput(
            typeof body?.rows === 'string' ? body.rows : Array.isArray(body?.rows) ? body.rows.join('\n') : '',
          )
          return sendJson(res, 400, {
            detail: `点阵必须是 ${GRID_ROWS} 行 × ${GRID_COLS} 个 0-7 的字符：${
              parsed.ok ? '形状不对' : parsed.reason
            }`,
          })
        }

        const record: AvatarRecord = {
          rows,
          ...(who.userId ? { userId: who.userId } : {}),
          updatedAt: new Date().toISOString(),
        }
        data.avatars[who.username] = record
        await writeAvatarFile(file, data)
        return sendJson(res, 200, { username: who.username, ...record })
      }

      return sendJson(res, 405, { detail: `不支持的方法：${method}` })
    })().catch((err: unknown) => {
      // dev / preview 服务器：错误照实说清，别让人对着一个 500 猜
      sendJson(res, 500, { detail: err instanceof Error ? err.message : String(err) })
    })
  }
}

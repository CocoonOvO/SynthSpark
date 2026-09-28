/**
 * 登录态（接真实接口）
 *
 * 契约来自实测（design/icespark-ARCHITECTURE.md 第 7 节）：
 * - POST /api/auth/token：application/x-www-form-urlencoded（**不是 JSON**），
 *   字段 username + password；失败返回 401 {"detail":"用户名或密码错误"}
 * - GET  /api/auth/me：Authorization: Bearer <access_token>
 *
 * 存储键统一带 synthspark 前缀（AGENTS.md 命名规范）：
 *   synthspark-token        —— JWT
 *   synthspark-icespark-user —— 缓存的用户信息（仅用于刷新后立刻显示昵称）
 */
import { ref, computed } from 'vue'

const LS_TOKEN = 'synthspark-token'
const LS_USER = 'synthspark-icespark-user'

export interface AuthUser {
  id?: string
  username: string
  display_name?: string | null
  avatar_url?: string | null
  user_type?: string
  is_superuser?: boolean
}

function readLS(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLS(key: string, value: string | null) {
  try {
    if (value === null) localStorage?.removeItem(key)
    else localStorage?.setItem(key, value)
  } catch {
    /* 隐私模式下静默失败 */
  }
}

function readUser(): AuthUser | null {
  const raw = readLS(LS_USER)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export const token = ref<string | null>(readLS(LS_TOKEN))
export const authUser = ref<AuthUser | null>(readUser())

export const isLoggedIn = computed(() => !!token.value)
export const displayName = computed(
  () => authUser.value?.display_name || authUser.value?.username || '访客'
)
/** 超管判定：菜单里的「站点管理」入口靠它决定出不出现（后端 /api/auth/me 会给 is_superuser） */
export const isSuperuser = computed(() => authUser.value?.is_superuser === true)

export type LoginResult = { ok: true } | { ok: false; message: string }

/** 登录：真实 POST，失败时把后端的 detail 原样告诉用户 */
export async function login(username: string, password: string): Promise<LoginResult> {
  const u = username.trim()
  if (!u || !password) return { ok: false, message: '用户名与密码都要填写' }

  const body = new URLSearchParams()
  body.append('username', u)
  body.append('password', password)

  let res: Response
  try {
    res = await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
  } catch {
    return { ok: false, message: '连不上后端：/api/auth/token 不可达' }
  }

  if (!res.ok) {
    let detail = `登录失败（HTTP ${res.status}）`
    try {
      const j: unknown = await res.json()
      const d = (j as { detail?: unknown })?.detail
      if (typeof d === 'string' && d) detail = d
      else if (res.status === 401) detail = '用户名或密码错误'
    } catch {
      if (res.status === 401) detail = '用户名或密码错误'
    }
    return { ok: false, message: detail }
  }

  const data = (await res.json().catch(() => null)) as { access_token?: string } | null
  const t = data?.access_token
  if (!t) return { ok: false, message: '后端没有返回 access_token' }

  token.value = t
  writeLS(LS_TOKEN, t)
  await loadMe()
  return { ok: true }
}

/** 拉当前用户；失败不清 token（网络抖动不该把人踢下线） */
export async function loadMe(): Promise<void> {
  const t = token.value
  if (!t) return
  try {
    const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${t}` } })
    if (r.status === 401) {
      logout()
      return
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const u = (await r.json()) as AuthUser
    authUser.value = u
    writeLS(LS_USER, JSON.stringify(u))
  } catch {
    /* 保留缓存信息 */
  }
}

export function logout() {
  token.value = null
  authUser.value = null
  writeLS(LS_TOKEN, null)
  writeLS(LS_USER, null)
}

/** 启动时若有缓存 token，静默校验一次 */
export function bootstrapAuth() {
  if (token.value) void loadMe()
}

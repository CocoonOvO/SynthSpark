import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { API_BASE, readToken, writeToken } from '@/api/client'

/**
 * 账号 store（pinia setup store，id `auth`）—— 照搬样机 `ui/auth.ts` 的语义。
 *
 * 为什么用 store 而不是样机那样的模块级 ref：登录态是**跨场景共享**的第一号状态
 * （暂停菜单的账号行、登录弹窗，以后的评论框与写作页都读它），与 `stores/site.ts`
 * / `stores/content.ts` 统一在同一套机制里（架构 §2 已定 pinia）。
 * 唯一的机械改写：样机写 `authUser.value`，生产写 `user`（pinia 会解包 ref）。
 *
 * 接口契约来自实测（design/icespark-ARCHITECTURE.md 第 7 节）：
 * - POST /api/auth/token：application/x-www-form-urlencoded（**不是 JSON**），
 *   字段 username + password；失败返回 401 {"detail":"用户名或密码错误"}
 * - GET  /api/auth/me：Authorization: Bearer <access_token>
 *
 * 存储键（AGENTS.md 命名规范只允许 `synthspark` 这一种写法）：
 * - **令牌**走 `@/api/client` 的 `TOKEN_KEY` / `readToken()` / `writeToken()`
 *   （`synthspark-token`）：api 客户端的 `auth: true` 读的是同一个键 ——
 *   自己再拼一个键，就会出现「登录成功但带鉴权的接口依然 401」这种两边读不到对方状态的 bug。
 * - **用户信息**缓存在 `synthspark-icespark-user`（照样机原名），
 *   只用于刷新后**立刻**显示昵称，不是可信来源（真正的用户信息由 /api/auth/me 给）。
 */
export interface AuthUser {
  /** 契约 `components["schemas"]["User"]` 里 id 必有；这里照样机写成可选 —— 缓存里可能是旧值 */
  id?: string
  username: string
  display_name?: string | null
  avatar_url?: string | null
  user_type?: string
  is_superuser?: boolean
}

/** 用户信息缓存的存储键（照样机；命名规范见文件头） */
const LS_USER = 'synthspark-icespark-user'

/**
 * 读用户缓存。
 * localStorage 在隐私模式 / 禁用存储时会**直接抛异常**（不是返回 null），
 * 所以读写都要 try：这里失败一律当「没有缓存」，不要让它把整个 store 的初始化带崩。
 */
function readUser(): AuthUser | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(LS_USER)
    if (!raw) return null
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

/** 写用户缓存；失败静默 —— 缓存只是省一次请求的加速器，写不进去不影响本次登录 */
function writeUser(user: AuthUser | null): void {
  try {
    if (user === null) localStorage?.removeItem(LS_USER)
    else localStorage?.setItem(LS_USER, JSON.stringify(user))
  } catch {
    /* 隐私模式下静默失败 */
  }
}

export type LoginResult = { ok: true } | { ok: false; message: string }

export const useAuthStore = defineStore('auth', () => {
  /** 登录令牌；初始值就是上次登录留下的（刷新后免登录的前提） */
  const token = ref<string | null>(readToken())

  /** 当前用户信息；初始值读缓存，只为了让刷新后昵称立刻可见 */
  const user = ref<AuthUser | null>(readUser())

  const isLoggedIn = computed(() => !!token.value)

  /** 显示名：优先昵称，退回用户名，最后是「访客」（未登录时菜单里显示的就是它） */
  const displayName = computed(() => user.value?.display_name || user.value?.username || '访客')

  /** 超管判定：菜单里的「站点管理」入口靠它决定出不出现（后端 /api/auth/me 会给 is_superuser） */
  const isSuperuser = computed(() => user.value?.is_superuser === true)

  /** 登录：真实 POST，失败时把后端的 detail **原样**告诉用户（弹窗只负责显示，不改写文案） */
  async function login(username: string, password: string): Promise<LoginResult> {
    const u = username.trim()
    if (!u || !password) return { ok: false, message: '用户名与密码都要填写' }

    const body = new URLSearchParams()
    body.append('username', u)
    body.append('password', password)

    // 为什么不用 `@/api/client` 的 postJson：它会把 body 做 `JSON.stringify`，
    // 而这个端点（OAuth2 密码流）只收 application/x-www-form-urlencoded ——
    // 拿 JSON 去换回来的是一句 422，错在格式上很难一眼看出来。
    // 同理 URL 也得自己拼 `API_BASE`：拼前缀的能力长在客户端的 `request()` 里。
    let res: Response
    try {
      res = await fetch(`${API_BASE}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
    } catch {
      return { ok: false, message: '连不上后端：/api/auth/token 不可达' }
    }

    if (!res.ok) {
      // 后端原文优先（FastAPI 的 {"detail": "..."}）；没有可用的 detail 才按状态码兜底
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
    writeToken(t)
    // 拿到令牌后顺手拉一次用户信息（菜单要昵称与超管标记）。
    // 这一步失败也不算登录失败：loadMe 自己会保住 token（见下）。
    await loadMe()
    return { ok: true }
  }

  /**
   * 拉当前用户。
   *
   * **只有 401 才登出**：401 是后端明确说「这个令牌不认」（过期 / 被撤销），
   * 留着它只会每次请求都失败；而网络抖动、后端 502、响应体坏掉都不该把人踢下线 ——
   * 否则一次断网等于一次强制登出，连缓存里的昵称也白存了。
   * 失败时**不动 token**，界面继续按「已登录」显示缓存信息。
   */
  async function loadMe(): Promise<void> {
    const t = token.value
    if (!t) return
    try {
      const r = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${t}` } })
      if (r.status === 401) {
        logout()
        return
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const u = (await r.json()) as AuthUser
      user.value = u
      writeUser(u)
    } catch {
      /* 保留缓存信息：token 不动 */
    }
  }

  /** 登出：令牌与缓存一起清掉。后端没有需要显式调用的登出接口（令牌由后端到期策略管） */
  function logout(): void {
    token.value = null
    user.value = null
    writeToken(null)
    writeUser(null)
  }

  /** 启动时若有缓存 token，静默校验一次（失败不影响已经渲染出来的界面） */
  function bootstrapAuth(): void {
    if (token.value) void loadMe()
  }

  return { token, user, isLoggedIn, displayName, isSuperuser, login, loadMe, logout, bootstrapAuth }
})

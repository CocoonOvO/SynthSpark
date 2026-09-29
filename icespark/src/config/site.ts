import { DEFAULT_SITE_CONFIG } from './defaults'
import type { SiteConfig } from './types'

/**
 * 站点配置的三级合并（架构 §13 硬要求 2）。
 *
 * 优先级：内置默认 < `public/site.config.json` < 后台 `GET /api/site-config`。
 * 合并语义**照抄旧前端**（`frontend/src/config/siteConfig.ts`），不自行发明：
 *
 * - `null` / `undefined` 跳过，保持下层原值
 * - **数组整体替换**（不逐元素合并）—— 否则「删掉一个导航项」永远删不掉
 * - 普通对象递归深合并，基本类型直接覆盖（空字符串也算覆盖，管理员清空就是清空）
 *
 * 两层覆盖配置的拉取失败（404 / 不是 JSON / 超时）都**安静跳过**：
 * 站点配置取不到不该挡住首屏，回退到内置默认即可。
 */

/** 每层覆盖配置的拉取超时 */
const OVERLAY_TIMEOUT_MS = 3000

/** 是否是「可以递归合并」的普通对象 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 递归深合并：返回新对象，不改动任何入参。
 * 第二参非普通对象（含数组、null、基本类型）时视为「没有合并项」，原样返回 target。
 */
export function deepMerge<T extends object>(target: T, source: unknown): T {
  if (!isPlainObject(source)) return target

  const result: Record<string, unknown> = { ...(target as Record<string, unknown>) }

  for (const [key, value] of Object.entries(source)) {
    // null / undefined 跳过：保持下层原值
    if (value === null || value === undefined) continue

    // 数组整体替换
    if (Array.isArray(value)) {
      result[key] = value
      continue
    }

    // 普通对象：下层同键也是普通对象则递归，否则整体替换
    if (isPlainObject(value)) {
      const current = result[key]
      result[key] = isPlainObject(current) ? deepMerge(current, value) : value
      continue
    }

    // 基本类型直接覆盖
    result[key] = value
  }

  return result as T
}

/**
 * 拉取一层覆盖配置。任何失败都返回 null（安静跳过），不抛异常。
 *
 * 注意这里**必须**校验 content-type：dev 下 Vite 把未知路径回退成 index.html 并返回 200，
 * 只判断 `response.ok` 的话会把 HTML 当配置去 JSON.parse —— 好在有 try/catch 兜住，
 * 但显式判掉能少一条「看起来成功、其实是空配置」的路径。
 */
async function fetchOverlay(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(OVERLAY_TIMEOUT_MS),
    })
    if (!response.ok) return null

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('json')) return null

    return (await response.json()) as unknown
  } catch {
    return null
  }
}

export interface SiteConfigLoadResult {
  /** 合并后的生效配置 */
  config: SiteConfig
  /** 真正生效的覆盖层（给调试与「数据来源」提示用） */
  sources: string[]
  /**
   * 后台配置这一层是否命中 —— 底栏的数据源标记（`● LIVE` / `○ DEMO`）读它。
   *
   * 样机那个开关的语义是「真数据 vs 内置样张」；生产版没有样张，
   * 对应的就是「后台接口给了配置」还是「只有本地文件 / 内置默认」。
   */
  live: boolean
}

/** 两层覆盖配置的来源清单（顺序即优先级，后者覆盖前者） */
const OVERLAYS = [
  { id: 'file', url: '/site.config.json', label: '本地文件 site.config.json' },
  { id: 'api', url: '/api/site-config', label: '后台配置' },
] as const

/**
 * 拉取并合并三级配置。两层覆盖并行拉取，都拿到后按优先级统一深合并。
 */
export async function loadSiteConfig(): Promise<SiteConfigLoadResult> {
  const overlays = await Promise.all(OVERLAYS.map((item) => fetchOverlay(item.url)))

  let config = DEFAULT_SITE_CONFIG
  const sources: string[] = []
  let live = false

  overlays.forEach((overlay, index) => {
    if (overlay === null) return
    const item = OVERLAYS[index]
    if (!item) return
    config = deepMerge(config, overlay)
    sources.push(item.label)
    if (item.id === 'api') live = true
  })

  return { config, sources, live }
}

/** 页脚状态行的一段 */
export interface FooterSegment {
  /** 段类型：窄屏时优先丢掉 slogan（口号可以省，版权与备案不能） */
  kind: 'copyright' | 'slogan' | 'icp'
  text: string
}

/**
 * 把页脚配置拆成状态行的若干段（硬要求 3：不做传统页脚区块，只刻一行小字）。
 *
 * 拆段而不是拼成一根字符串，是为了让**窄屏**能优先丢掉口号、
 * 保留版权与备案 —— 拼在一起就只能整体省略号，把必要信息也省掉了。
 * 空字段自动跳过（不留下多余的 ` · `）。
 */
export function footerSegments(config: SiteConfig): FooterSegment[] {
  const segments: FooterSegment[] = []

  if (config.footer.copyright) {
    segments.push({ kind: 'copyright', text: `© ${config.footer.copyright}` })
  }
  if (config.footer.slogan) {
    segments.push({ kind: 'slogan', text: config.footer.slogan })
  }
  if (config.site.icp) {
    segments.push({ kind: 'icp', text: config.site.icp })
  }

  return segments
}

/** 状态行的完整文字（段之间用 ` · ` 连接），给断言与将来的 meta 用 */
export function footerLineText(config: SiteConfig): string {
  return footerSegments(config)
    .map((segment) => segment.text)
    .join(' · ')
}

/** 归一化站内路径：忽略结尾多余的 `/`（`/posts/` 与 `/posts` 视为同一项） */
function normalizePath(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/**
 * 标签栏的中文标签（硬要求 2 里「导航」那一项）。
 *
 * 口径（用户已确认，架构 §18.2）：
 * - icespark 的标签栏是**固定四项**（主页 / 文章 / 关联 / 关于），
 *   `navbar.navItems` 只提供这四项的**文字**，按 `path` 对齐；
 * - 管理员改 `label` 生效（这是导航可配置的意义）；
 * - 配置里**多出来**的项（icespark 没有对应页面）忽略 —— 不能凭空多出一个标签；
 * - **少了**哪一项就用兜底标签（内置默认的中文名），不留空标签。
 *
 * `tabs` 由调用方传入（`scene/tabs.ts` 的 TABS）：路径与路由的对应关系属于场景层，
 * 配置层不该再抄一份路由表。
 */
export function tabLabels(
  config: SiteConfig,
  tabs: readonly { path: string; label: string }[],
): string[] {
  const byPath = new Map<string, string>()
  for (const item of config.navbar.navItems) {
    if (item && typeof item.path === 'string' && typeof item.label === 'string') {
      byPath.set(normalizePath(item.path), item.label)
    }
  }

  return tabs.map((tab, index) => {
    const fromConfig = byPath.get(normalizePath(tab.path))
    // 配置里给了空串也算「没给」：标签栏上不能出现一个字都没有的页签
    return fromConfig && fromConfig.trim() !== '' ? fromConfig : (tabs[index]?.label ?? '')
  })
}

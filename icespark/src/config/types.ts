/**
 * 站点配置的类型 —— 字段与后端 `GET /api/site-config`、`public/site.config.json` 完全对齐。
 *
 * 这不是「前端自己的配置」，而是旧前端那套三级配置的搬运：
 * 内置默认（`defaults.ts`）→ `public/site.config.json` → 后台配置接口。
 * 页面里**不许写死可配置内容**（架构 §13 硬要求 2）：文案、导航、页脚、首页与关于内容都从这里取。
 *
 * 刻意不含旧前端的 `site.defaultTheme`：那套是旧前端的 11 套主题系统，
 * icespark 的配色走 `src/styles/tokens.ts` 的配色方案表，两回事（后端多返回这个字段会被忽略）。
 */

/** 站点基本信息 */
export interface SiteMeta {
  /** 站点名（用于标题栏、品牌位） */
  name: string
  /** 站点标题（浏览器标题用，为空回退 name） */
  title: string
  /** 站点描述（meta description 用） */
  description: string
  /** 备案号，为空则页脚状态行不显示这一段 */
  icp: string
  /** 站点 logo 图片地址，为空则用文字 logo */
  logo: string
}

/** 导航项 */
export interface NavItem {
  label: string
  /** 站内路径（`/posts`）或站外地址 */
  path: string
}

/** 顶部导航 */
export interface NavbarConfig {
  logo: string
  navItems: NavItem[]
}

/** 页脚链接项 */
export interface FooterLink {
  label: string
  href: string
}

/** 页脚链接分组 */
export interface FooterLinkGroup {
  group: string
  items: FooterLink[]
}

/**
 * 页脚。
 *
 * 注意它在 icespark 里的呈现方式与传统站点不同：不做多栏链接区块，
 * 而是把 copyright / slogan 与 site.icp 拼成**一行小字**，刻在外框下边框内侧（硬要求 3）。
 */
export interface FooterConfig {
  copyright: string
  slogan: string
  /** 保留完整结构（旧前端的页脚链接分组），将来若要「更多链接」入口直接可用 */
  links: FooterLinkGroup[]
}

/** 首页文案与统计标签 */
export interface HomeConfig {
  badge: string
  title: string
  desc: string
  primaryBtn: string
  secondaryBtn: string
  stats: {
    creators: string
    articles: string
    reads: string
  }
  articles: {
    title: string
    viewAll: string
  }
}

/** 关于页技术栈分组 */
export interface AboutTechCategory {
  title: string
  items: string[]
}

/** 关于页文案 */
export interface AboutConfig {
  badge: string
  title: string
  desc: string
  techStack: {
    subtitle: string
    categories: AboutTechCategory[]
  }
}

/** 站点配置全量结构 */
export interface SiteConfig {
  site: SiteMeta
  navbar: NavbarConfig
  footer: FooterConfig
  home: HomeConfig
  about: AboutConfig
}

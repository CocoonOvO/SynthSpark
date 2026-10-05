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

/**
 * 首页文案。
 *
 * 字段分两类（映射表见架构 §18.2，用户已确认口径）：
 * - icespark 首页**真的会渲染**的：`title`（英雄区大字）· `desc`（英雄区那句副文）·
 *   `stats.*`（统计条三个标签）· `articles.*` · `groups.title` · `tags.title` · `allCard.*`；
 * - 旧前端首页的结构（徽标 / 两个按钮）在 icespark 里**没有对应元素**，
 *   字段保留只是为了让两个前端共用同一份后台配置，icespark 渲染时忽略。
 */
export interface HomeConfig {
  /** 旧前端首页徽标（icespark 首页无此结构，保留字段，不渲染） */
  badge: string
  /** 英雄区大字（样机是 `SYNTHSPARK`） */
  title: string
  /** 英雄区副文（那两句话） */
  desc: string
  /** 旧前端首页主按钮（icespark 首页无此结构，保留字段，不渲染） */
  primaryBtn: string
  /** 旧前端首页次按钮（icespark 首页无此结构，保留字段，不渲染） */
  secondaryBtn: string
  stats: {
    /** 作者数标签（对应 `stats.agent_count`） */
    creators: string
    /** 文章数标签（对应 `stats.post_count`） */
    articles: string
    /** 总浏览标签（对应 `stats.total_views`） */
    reads: string
  }
  articles: {
    /** 「最新文章」段标题 */
    title: string
    /** 「查看全部」那个按钮 */
    viewAll: string
  }
  /** 「分组」段标题（新增：样机这一段有中文标题） */
  groups: {
    title: string
  }
  /** 「标签」段标题（新增） */
  tags: {
    title: string
  }
  /** 「全部文章」大卡片（新增：段内最后一张卡，进文章列表） */
  allCard: {
    title: string
    hint: string
  }
}

/** 关于页技术栈分组 */
export interface AboutTechCategory {
  title: string
  items: string[]
}

/** 关于页「要点」一行（`键 ─ 值`，样机的 facts 块） */
export interface AboutFact {
  key: string
  value: string
  /**
   * 可选图标：一个**短记号**（1–2 个字符/符号）。
   * 限制成短记号是因为像素字体按 12px 设计，放大后笔画会糊（见 ImageFrame 的踩坑记录）。
   */
  icon?: string
  /**
   * 可选链接：填了就整条变成可点、可聚焦的条目。
   * 站内路径（`/` 开头）在当前页里跳，绝对地址开新页 —— 与关联页同一套判断。
   */
  link?: string
}

/**
 * 关于页文案。
 *
 * 与首页同一套口径（架构 §18.2）：
 * - icespark 关于页渲染 `facts`（要点块）与 `body`（正文 markdown）；
 * - `badge` / `title` / `desc` / `techStack` 是旧前端关于页的结构，icespark 没有这些元素，
 *   字段保留以便共用同一份后台配置。
 */
export interface AboutConfig {
  /** 旧前端关于页徽标（icespark 无此结构，保留字段） */
  badge: string
  /** 旧前端关于页标题（icespark 无此结构，保留字段） */
  title: string
  /** 旧前端关于页描述（icespark 无此结构，保留字段） */
  desc: string
  /** 要点块：键 ─ 值 一行一条（新增） */
  facts: AboutFact[]
  /** 正文 markdown（新增：关于页正文同样走 markdown 渲染器） */
  body: string
  /** 旧前端关于页技术栈分组（icespark 无此结构，保留字段） */
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

import type { SiteConfig } from './types'

/**
 * 内置默认站点配置 —— 三级合并的**第一级**（架构 §13 硬要求 2）。
 *
 * 它跟「硬编码」不是一回事：这里的值只是**兜底**，部署方用 `public/site.config.json`
 * 或后台站点设置覆盖任意字段。旧前端也是这么做的（`copywriting.json` 派生出内置默认）。
 * 判定标准很干脆：任何**页面结构**里的文案都必须能在不碰代码的前提下被改掉。
 *
 * 取值与旧前端 `frontend/src/config/copywriting.json` 派生的内置默认**逐字一致**，
 * 这样两个前端在没有任何覆盖配置时显示同样的文案，便于对照验收。
 */
export const DEFAULT_SITE_CONFIG: SiteConfig = {
  site: {
    name: 'SynthSpark',
    title: 'SynthSpark',
    description:
      'SynthSpark 是一个支持多智能体参与的博客系统。每个智能体以独立身份编写文章，拥有专属主页、作品集和粉丝。',
    // 备案号默认为空：空则页脚状态行不显示这一段（本地开发不该出现假备案号）
    icp: '',
    logo: '',
  },

  navbar: {
    logo: 'SynthSpark',
    navItems: [
      { label: '首页', path: '/' },
      { label: '文章', path: '/posts' },
      { label: '关联', path: '/links' },
      { label: '关于', path: '/about' },
    ],
  },

  footer: {
    copyright: '2026 SynthSpark',
    slogan: '多智能体博客系统 · Agent 独立创作',
    // 链接分组保留完整结构；页脚状态行只取 copyright / slogan / icp（硬要求 3）
    links: [
      {
        group: '导航',
        items: [
          { label: '首页', href: '/' },
          { label: '文章', href: '/posts' },
          { label: '关联', href: '/links' },
          { label: '关于', href: '/about' },
        ],
      },
    ],
  },

  home: {
    badge: 'Multi-Agent Collective',
    title: 'Agent 的博客系统',
    desc: '多智能体参与的博客系统，每个 Agent 以独立身份编写文章',
    primaryBtn: '浏览文章',
    secondaryBtn: '了解更多',
    stats: {
      creators: '智能体创作者',
      articles: '文章',
      reads: '阅读',
    },
    articles: {
      title: '最新文章',
      viewAll: '查看全部 →',
    },
  },

  about: {
    badge: 'ABOUT',
    title: '多智能体博客系统',
    desc: 'SynthSpark 是一个支持多智能体参与的博客系统。每个智能体以独立身份编写文章，拥有专属主页、作品集和粉丝。',
    techStack: {
      subtitle: '现代技术栈，为Agent协作而生',
      categories: [
        { title: '后端', items: ['FastAPI', 'PostgreSQL', 'SQLite', 'SQLAlchemy', 'JWT Auth'] },
        {
          title: '前端',
          items: ['Vue 3', 'TypeScript', 'Pinia', 'Vue Router', 'Vite', 'Milkdown'],
        },
        { title: 'Agent集成', items: ['Agent Identity', 'Multi-Agent'] },
        { title: '功能模块', items: ['SEO优化', '主题系统', '全文搜索', '评论互动'] },
      ],
    },
  },
}

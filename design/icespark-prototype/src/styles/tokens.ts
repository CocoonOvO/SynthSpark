/**
 * icespark 像素设计 token
 *
 * 配色原则：
 * - 白色背景 + 浅蓝色主体色
 * - 深色只用于「文字与细描边」，绝不大面积铺底（避免画面发黑发蓝）
 * - 8bit 游戏机的显像管质感：靠扫描线、荧光点阵、辉光实现
 *
 * 设计铁律：
 * - 8px 基础网格
 * - 圆角恒为 0，禁模糊投影与渐变（用硬边与抖动图案代替）
 * - 动画只走 steps()
 */

// ── 唯一调色板：白底 + 浅蓝主体 ──

export const PALETTE = {
  // 背景层：白 → 极浅蓝
  paper: '#FFFFFF', // 主背景（白）
  paperAlt: '#EAF6FC', // 次背景（极浅蓝，用于分区）
  paperTint: '#D6ECF8', // 浅蓝块（卡片底、状态条）

  // 蓝色主体阶（浅 → 深，主体色集中在浅蓝段）
  blue100: '#F2FAFE',
  blue200: '#D6ECF8',
  blue300: '#A8D8EF',
  blue400: '#6FBCE0',
  blue500: '#3D9BD0', // 主强调色
  blue600: '#2A7BA8',
  blue700: '#1B5A7D', // 文字蓝 / 描边

  // 文字
  ink: '#123A52', // 正文与描边（深蓝，作字色而非底色）
  inkSoft: '#5B8CA6', // 次要文字
  inkFaint: '#9BC0D2', // 极次要 / 装饰

  // 强调事件（克制使用）
  spark: '#FF5C8A', // 点赞
  coin: '#FFC93C', // 成就

  // 8bit 显像管
  crtGlow: '#7FD4F5', // 荧光辉光
}

/** 语义角色映射：CSS 变量注入用 */
export const ROLES = {
  '--paper': PALETTE.paper,
  '--paper-alt': PALETTE.paperAlt,
  '--paper-tint': PALETTE.paperTint,
  '--blue-100': PALETTE.blue100,
  '--blue-200': PALETTE.blue200,
  '--blue-300': PALETTE.blue300,
  '--blue-400': PALETTE.blue400,
  '--blue-500': PALETTE.blue500,
  '--blue-600': PALETTE.blue600,
  '--blue-700': PALETTE.blue700,
  '--ink': PALETTE.ink,
  '--ink-soft': PALETTE.inkSoft,
  '--ink-faint': PALETTE.inkFaint,
  '--spark': PALETTE.spark,
  '--coin': PALETTE.coin,
  '--crt-glow': PALETTE.crtGlow,
  // 8bit 立体边框：用浅蓝系，不再用深色压边
  '--bevel-light': PALETTE.paper,
  '--bevel-dark': PALETTE.blue400,
  '--edge': PALETTE.blue600,
}

/** canvas 头像量化用的调色板序列 */
export const AVATAR_PALETTE = [
  PALETTE.paper,
  PALETTE.blue100,
  PALETTE.blue200,
  PALETTE.blue300,
  PALETTE.blue400,
  PALETTE.blue500,
  PALETTE.blue700,
  PALETTE.ink,
]

// ── 场景定义 ──

export interface SceneDef {
  id: string
  label: string
  hint: string
}

export const SCENES: SceneDef[] = [
  { id: 'boot', label: 'BOOT', hint: '开机' },
  { id: 'title', label: 'TITLE', hint: '主菜单' },
  { id: 'list', label: 'WORLD 1-1', hint: '文章列表' },
  { id: 'article', label: 'STAGE', hint: '文章详情' },
]

/**
 * icespark 像素设计 token
 *
 * 设计铁律：
 * - 8px 基础网格，所有尺寸为其整数倍
 * - 圆角恒为 0，禁用模糊投影与渐变（用硬边偏移与抖动图案代替）
 * - 动画只走 steps()，时长取 80/160/320ms
 * - 颜色只取自调色板，不允许出现调色板外的颜色
 */

// ── 两版候选调色板 ──

/** 方案 A：Game Boy 式纯单色纪律，4 阶冰蓝，没有强调色 */
export const PALETTE_A = {
  name: 'A',
  label: '冰蓝 4 阶 · 纯单色',
  desc: 'Game Boy 式纪律：只有 4 级明度，没有强调色，一切靠图案与位置区分',
  0: '#FFFFFF',
  1: '#C8E8F5',
  2: '#5FA8D0',
  3: '#123A52',
}

/** 方案 B：冰蓝 8 阶，带语义强调色（火花事件专用） */
export const PALETTE_B = {
  name: 'B',
  label: '冰蓝 8 阶 · 火花强调',
  desc: 'NES 式：主体仍是蓝阶，强调色只留给点赞/成就等「火花事件」',
  0: '#FFFFFF',
  1: '#E4F2FA',
  2: '#B8DCF0',
  3: '#7FC0E0',
  4: '#3E90BC',
  5: '#1E5A7A',
  6: '#0E2E42',
  7: '#000000',
  spark: '#FF4D6D',
  coin: '#FFCC33',
}

// ── 语义角色映射（两版共用同一套角色名，只有取值不同）──

export interface PaletteRoles {
  ink: string
  inkSoft: string
  paper: string
  paperAlt: string
  screen: string
  bevelLight: string
  bevelDark: string
  accent: string
  coin: string
  spark: string
}

export function rolesOf(palette: Record<string | number, string>, variant: 'A' | 'B'): PaletteRoles {
  const p = palette as Record<string, string>
  if (variant === 'A') {
    return {
      ink: p[3],
      inkSoft: p[2],
      paper: p[0],
      paperAlt: p[1],
      screen: p[1],
      bevelLight: p[0],
      bevelDark: p[3],
      accent: p[3],
      coin: p[3],
      spark: p[3],
    }
  }
  return {
    ink: p[6],
    inkSoft: p[4],
    paper: p[0],
    paperAlt: p[1],
    screen: p[1],
    bevelLight: p[0],
    bevelDark: p[5],
    accent: p[5],
    coin: p.coin,
    spark: p.spark,
  }
}

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

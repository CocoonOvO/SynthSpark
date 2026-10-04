/**
 * 设计 token —— 配色与刻度的唯一来源（架构 §2、§4）。
 *
 * 三条规矩：
 *
 * 1. **颜色只允许出现在这个文件里**。组件与样式表一律写 `var(--xxx)`，
 *    不写具体色值。旧前端漏注入过一次配色，后果不是「颜色偏一点」，而是整站边框消失 ——
 *    `var()` 取不到值时整条声明按「计算值无效」处理，`border` 简写会被整个重置成 none。
 *    所以配色门（e2e/palette.spec.ts）会枚举样式表里所有 `var()` 逐个断言能解析。
 *
 * 2. **配色按「方案」参数化**：`PALETTES` 是方案表，现在只有一套。
 *    将来加主题 = 再加一个同形状的键（生成物已经按 `[data-theme]` 分组输出），
 *    组件一行都不用改。本轮不做主题切换，但结构先摆好。
 *
 * 3. **刻度也进 token**：8px 网格、12 的倍数像素字号、边框宽度、动效时长。
 *    像素字在非整数倍字号下会发虚（点阵被重采样），所以字号只允许取这几档。
 */

// ──────────────────────────── 调色板 ────────────────────────────

/** 一套调色板的形状：加主题时照抄这个接口 */
export interface Palette {
  // 背景层：白 → 极浅蓝
  paper: string
  paperAlt: string
  paperTint: string

  // 蓝色主体阶（浅 → 深，主体色集中在浅蓝段）
  blue100: string
  blue200: string
  blue300: string
  blue400: string
  blue500: string
  blue600: string
  blue700: string

  // 文字
  ink: string
  inkSoft: string
  inkFaint: string

  // 强调事件（克制使用）
  spark: string

  // 8bit 显像管
  crtGlow: string

  // 半透明变体：CRT 质感与遮罩要用，但色值同样只许写在这里
  scanLine: string
  maskDot: string
  vignette: string
  glowSoft: string
  frameDot: string
  /** 遮罩：默认（音效询问） */
  veil: string
  /** 遮罩：更淡一档（暂停菜单，样机 0.28） */
  veilSoft: string
  /** 遮罩：更浓一档（登录 / 设置对话框，样机 0.34） */
  veilDeep: string
}

/**
 * 白底 + 浅蓝主体的唯一调色板，取自样机定稿（`design/icespark-prototype/src/styles/tokens.ts`）。
 *
 * 取舍写在样机里：深色只用于「文字与细描边」，绝不大面积铺底 —— 否则画面会发黑发蓝，
 * 8bit 掌机的屏幕感就没了。
 */
export const PALETTES = {
  icespark: {
    paper: '#FFFFFF',
    paperAlt: '#EAF6FC',
    paperTint: '#D6ECF8',

    blue100: '#F2FAFE',
    blue200: '#D6ECF8',
    blue300: '#A8D8EF',
    blue400: '#6FBCE0',
    blue500: '#3D9BD0',
    blue600: '#2A7BA8',
    blue700: '#1B5A7D',

    ink: '#123A52',
    inkSoft: '#5B8CA6',
    inkFaint: '#9BC0D2',

    spark: '#FF5C8A',
    crtGlow: '#7FD4F5',

    // rgba(18, 58, 82, α) —— ink 的透明度变体
    scanLine: 'rgba(18, 58, 82, 0.055)',
    vignette: 'rgba(18, 58, 82, 0.13)',
    frameDot: 'rgba(18, 58, 82, 0.14)',
    // 遮罩的三档透明度：样机里是三处不同的字面值（0.3 / 0.28 / 0.34），
    // 颜色只许写在这里，所以三档各建一个 token，而不是抹平成一档
    veil: 'rgba(18, 58, 82, 0.3)',
    veilSoft: 'rgba(18, 58, 82, 0.28)',
    veilDeep: 'rgba(18, 58, 82, 0.34)',
    // rgba(61, 155, 208, α) —— blue500 的透明度变体
    maskDot: 'rgba(61, 155, 208, 0.05)',
    // rgba(127, 212, 245, α) —— crtGlow 的透明度变体
    glowSoft: 'rgba(127, 212, 245, 0.45)',
  },
} satisfies Record<string, Palette>

export type PaletteId = keyof typeof PALETTES

/** 当前启用的配色方案。将来由站点配置 / 用户设置决定，本轮是常量。 */
export const ACTIVE_PALETTE: PaletteId = 'icespark'

/**
 * 调色板 → CSS 变量表。
 *
 * 变量名沿用样机（`--paper`、`--blue-500`、`--ink-soft`…），
 * 因为样机的组件 CSS 已经全部按这套名字写好了，改名等于白白制造差异。
 */
export function paletteVars(palette: Palette): Record<string, string> {
  return {
    '--paper': palette.paper,
    '--paper-alt': palette.paperAlt,
    '--paper-tint': palette.paperTint,

    '--blue-100': palette.blue100,
    '--blue-200': palette.blue200,
    '--blue-300': palette.blue300,
    '--blue-400': palette.blue400,
    '--blue-500': palette.blue500,
    '--blue-600': palette.blue600,
    '--blue-700': palette.blue700,

    '--ink': palette.ink,
    '--ink-soft': palette.inkSoft,
    '--ink-faint': palette.inkFaint,

    '--spark': palette.spark,
    '--crt-glow': palette.crtGlow,

    '--scan-line': palette.scanLine,
    '--mask-dot': palette.maskDot,
    '--vignette': palette.vignette,
    '--glow-soft': palette.glowSoft,
    '--frame-dot': palette.frameDot,
    '--veil': palette.veil,
    '--veil-soft': palette.veilSoft,
    '--veil-deep': palette.veilDeep,

    // 8bit 立体边框：用浅蓝系，不再用深色压边（样机的第四轮修正）
    '--bevel-light': palette.paper,
    '--bevel-dark': palette.blue400,
    '--edge': palette.blue600,
  }
}

/** canvas 头像量化用的调色板序列（P5 的 PixelAvatar 用） */
export function avatarPalette(palette: Palette): string[] {
  return [
    palette.paper,
    palette.blue100,
    palette.blue200,
    palette.blue300,
    palette.blue400,
    palette.blue500,
    palette.blue700,
    palette.ink,
  ]
}

// ──────────────────────────── 刻度 ────────────────────────────

/**
 * 8px 基础网格 + 像素字号档位。
 *
 * 字号只有这几档，是因为像素字体（Ark Pixel 12px）必须在 12 的整数倍上取字号，
 * 否则点阵被重采样、字会发虚。样机里 `.px-12/24/36/48/72` 就是这套锁。
 */
export const SCALE = {
  /** 基础网格（样机里所有间距都是它的整数倍） */
  grid: 8,

  /** 像素字号档位（12 的倍数） */
  px: { sm: 12, md: 24, lg: 36, xl: 48, display: 72 },

  /** 阅读层字号：正文用系统思源黑体，不受 12 倍数约束（可读性优先） */
  read: { body: 13.5, small: 12.5 },

  /** 边框宽度：发丝线 / 细线 / 画框与屏幕外框 */
  border: { hair: 1.5, thin: 2, frame: 3 },

  /** 动效时长（全部配 steps()，8bit 世界没有平滑缓动） */
  motion: { step: 160, turn: 280, boot: 640, blink: 640 },
} as const

/** 刻度 → CSS 变量表（与调色板一起构建期生成） */
export function scaleVars(): Record<string, string> {
  return {
    '--grid': `${SCALE.grid}px`,

    '--px-sm': `${SCALE.px.sm}px`,
    '--px-md': `${SCALE.px.md}px`,
    '--px-lg': `${SCALE.px.lg}px`,
    '--px-xl': `${SCALE.px.xl}px`,
    '--px-display': `${SCALE.px.display}px`,

    '--read-body': `${SCALE.read.body}px`,
    '--read-small': `${SCALE.read.small}px`,

    '--border-hair': `${SCALE.border.hair}px`,
    '--border-thin': `${SCALE.border.thin}px`,
    '--border-frame': `${SCALE.border.frame}px`,

    '--motion-step': `${SCALE.motion.step}ms`,
    '--motion-turn': `${SCALE.motion.turn}ms`,
    '--motion-boot': `${SCALE.motion.boot}ms`,
    '--motion-blink': `${SCALE.motion.blink}ms`,
  }
}

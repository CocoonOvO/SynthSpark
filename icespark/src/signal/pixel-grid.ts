/**
 * 16×16 点阵头像的数据模型 —— **前端自己管的那一份**（架构 §67）。
 *
 * 为什么存「格子」而不是图片：`PixelAvatar` 对**任何**头像都做同一件事 ——
 * 降到 16×16、把每个像素就近量化到 `avatarPalette()` 的 8 个色。所以一张头像的
 * 真身从来就是 256 个格子的下标，图片只是它的中间产物。这里存的就是真身：
 * 十六行、每行十六个字符，字符是调色板下标。
 *
 * 字符表 = `avatarPalette()` 的顺序（`src/styles/tokens.ts`），**不另发明映射**：
 *
 *   0 paper · 1 blue100 · 2 blue200 · 3 blue300 · 4 blue400 · 5 blue500 · 6 blue700 · 7 ink
 *
 * 「边长² = 字符数」这条性质让格式自带未来兼容（256 → 16×16、1024 → 32×32）；
 * 现在只放 16×16。不留透明：所有头像都是一整块不透明方块，`0` 就是白底。
 */

/** 行数（= 边长） */
export const GRID_ROWS = 16
/** 每行字符数（= 边长） */
export const GRID_COLS = 16
/** 合法字符表：调色板下标 */
export const GRID_CHARS = '01234567'
/** 总格子数（= 边长²） */
export const GRID_TOTAL = GRID_ROWS * GRID_COLS
/** 单行合法形状 */
export const ROW_PATTERN = /^[0-7]{16}$/

/** 十六行，每行十六个调色板下标 */
export type AvatarRows = string[]

/** 解析结果：失败时给出**能直接显示给用户**的中文原因 */
export type GridParseResult = { ok: true; rows: AvatarRows } | { ok: false; reason: string }

/** 空白画布（全 0 = 纸白） */
export function emptyGrid(): AvatarRows {
  return Array.from({ length: GRID_ROWS }, () => '0'.repeat(GRID_COLS))
}

/** 行数组 → 可编辑文本（十六行，`\n` 分隔） */
export function gridToText(rows: AvatarRows): string {
  return rows.join('\n')
}

/** 严格判定：形状必须是 16 行 × 16 字符 × `[0-7]` */
export function isValidGrid(input: unknown): input is AvatarRows {
  return (
    Array.isArray(input) &&
    input.length === GRID_ROWS &&
    input.every((row) => typeof row === 'string' && ROW_PATTERN.test(row))
  )
}

/** 把连写的 256 个字符切成十六行 */
function chunk(flat: string): AvatarRows {
  const rows: AvatarRows = []
  for (let i = 0; i < GRID_ROWS; i++) rows.push(flat.slice(i * GRID_COLS, (i + 1) * GRID_COLS))
  return rows
}

/**
 * 把用户粘进来的文本解析成行数组。
 *
 * 两种写法都认：
 *   · **连写**（页面上那个输入框就是这种）：256 个字排成一行；
 *   · **分行**：十六行各十六个字（行内外的空格、制表符、逗号都会被忽略）。
 *
 * 不宽容的地方：**绝不悄悄吞掉非法字符**（`8`、字母、少一个格子都要报出来），
 * 否则用户以为自己存了 16×16，实际存了别的形状。
 * 报错文案跟着输入的形态走 —— 一行输入就说"现在是 N 个字符（刚好 M 行）"，
 * 多行输入才说"第几行"。
 */
export function parseGridInput(text: string): GridParseResult {
  const raw = String(text ?? '')
  const flat = raw.replace(/[\s,]+/g, '')
  const total = GRID_ROWS * GRID_COLS

  // 先看常见的那一种：形状正好、字符也全合法
  if (flat.length === total && /^[0-7]+$/.test(flat)) return { ok: true, rows: chunk(flat) }

  // 没有换行 = 用户在用"一行 256 个字"这种写法（页面上的输入框就是）
  if (!/[\r\n]/.test(raw)) {
    if (flat.length !== total) {
      const whole = flat.length > 0 && flat.length % GRID_COLS === 0
      return {
        ok: false,
        reason:
          `需要 ${total} 个字符（${GRID_ROWS} 行 × ${GRID_COLS} 个），现在是 ${flat.length} 个` +
          (whole ? `（刚好 ${flat.length / GRID_COLS} 行）` : ''),
      }
    }
    const bad = flat.search(/[^0-7]/)
    return {
      ok: false,
      reason: `第 ${bad + 1} 个字符是「${flat[bad]}」，只允许 0-7（调色板下标）`,
    }
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/[\s,]+/g, ''))
    .filter((line) => line.length > 0)

  if (lines.length !== GRID_ROWS) {
    return {
      ok: false,
      reason: `需要 ${GRID_ROWS} 行（每行 ${GRID_COLS} 个 0-7 的字符），现在是 ${lines.length} 行`,
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.length !== GRID_COLS) {
      return { ok: false, reason: `第 ${i + 1} 行有 ${line.length} 个字符，应该是 ${GRID_COLS} 个` }
    }
    const bad = line.search(/[^0-7]/)
    if (bad >= 0) {
      return {
        ok: false,
        reason: `第 ${i + 1} 行第 ${bad + 1} 个字符是「${line[bad]}」，只允许 0-7（调色板下标）`,
      }
    }
  }
  return { ok: true, rows: lines }
}

/** 任意输入（行数组 或 文本）→ 规范行数组；非法返回 null（给服务端校验用） */
export function normalizeGrid(input: unknown): AvatarRows | null {
  if (typeof input === 'string') {
    const parsed = parseGridInput(input)
    return parsed.ok ? parsed.rows : null
  }
  if (isValidGrid(input)) return input.map((row) => row)
  // 逐行宽容一点：允许带空格的行数组
  if (Array.isArray(input)) {
    const parsed = parseGridInput(input.join('\n'))
    return parsed.ok ? parsed.rows : null
  }
  return null
}

/** 一行 → 调色板下标；非法字符按 0（白底）处理 —— 渲染路径不许抛异常 */
export function rowToIndexes(row: string | undefined): number[] {
  const out: number[] = []
  const text = typeof row === 'string' ? row : ''
  for (let x = 0; x < GRID_COLS; x++) {
    const ch = text[x]
    out.push(ch && ch >= '0' && ch <= '7' ? ch.charCodeAt(0) - 48 : 0)
  }
  return out
}

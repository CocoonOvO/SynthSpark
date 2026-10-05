import { describe, expect, it } from 'vitest'

import {
  GRID_COLS,
  GRID_ROWS,
  GRID_TOTAL,
  emptyGrid,
  gridToText,
  isValidGrid,
  normalizeGrid,
  parseGridInput,
  rowToIndexes,
} from '@/signal/pixel-grid'

/** 造一块第 i 行全 i%8 的画布，用来验形状与顺序 */
const banded = (): string[] => Array.from({ length: GRID_ROWS }, (_, i) => String(i % 8).repeat(GRID_COLS))

describe('pixel-grid 形状与校验', () => {
  it('空白画布是 16 行 × 16 个 0', () => {
    const grid = emptyGrid()
    expect(grid).toHaveLength(GRID_ROWS)
    expect(new Set(grid.map((r) => r.length))).toEqual(new Set([GRID_COLS]))
    expect(new Set(grid)).toEqual(new Set(['0'.repeat(GRID_COLS)]))
  })

  it('合法形状只有一种：16×16 且字符 ∈ 0-7', () => {
    expect(isValidGrid(banded())).toBe(true)
    expect(isValidGrid(banded().slice(0, 15))).toBe(false) // 少一行
    expect(isValidGrid([...banded().slice(0, 15), '0'.repeat(15)])).toBe(false) // 少一格
    expect(isValidGrid([...banded().slice(0, 15), '0'.repeat(15) + '8'])).toBe(false) // 越界下标
    expect(isValidGrid([...banded().slice(0, 15), '0'.repeat(15) + 'a'])).toBe(false) // 字母
    expect(isValidGrid('一行十六个字符'.padEnd(16, '0'))).toBe(false) // 不是数组
    expect(isValidGrid(null)).toBe(false)
  })

  it('gridToText / parseGridInput 往返一致', () => {
    const grid = banded()
    const parsed = parseGridInput(gridToText(grid))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.rows).toEqual(grid)
  })
})

describe('pixel-grid 解析的宽容与不宽容', () => {
  it('容忍行内空格、逗号、整块连写', () => {
    const flat = banded().join('')
    const withSpaces = banded()
      .map((row) => row.split('').join(' '))
      .join('\n')
    for (const text of [flat, withSpaces, banded().join(','), `${banded().join('\n')}\n`]) {
      const parsed = parseGridInput(text)
      expect(parsed.ok, text.slice(0, 20)).toBe(true)
      if (parsed.ok) expect(parsed.rows).toEqual(banded())
    }
  })

  it('非法输入报出可读原因，而不是悄悄吞掉', () => {
    const short = parseGridInput(banded().slice(0, 15).join('\n'))
    expect(short.ok).toBe(false)
    if (!short.ok) expect(short.reason).toContain('15 行')

    const badRow = banded()
    badRow[2] = '0'.repeat(17)
    const long = parseGridInput(badRow.join('\n'))
    expect(long.ok).toBe(false)
    if (!long.ok) expect(long.reason).toContain('第 3 行有 17 个字符')

    const shortRow = banded()
    shortRow[4] = '0'.repeat(15)
    const shortLine = parseGridInput(shortRow.join('\n'))
    expect(shortLine.ok).toBe(false)
    if (!shortLine.ok) expect(shortLine.reason).toContain('第 5 行有 15 个字符')

    const badChar = banded()
    badChar[1] = `0${'0'.repeat(14)}8`
    const char = parseGridInput(badChar.join('\n'))
    expect(char.ok).toBe(false)
    if (!char.ok) expect(char.reason).toContain('第 2 行第 16 个字符是「8」')
  })

  it('空输入：一行那种说「几个字符」，多行那种说「几行」', () => {
    // 页面上的输入框就是一行那种写法，所以这里先按"字符数"报
    const flat = parseGridInput('')
    expect(flat.ok).toBe(false)
    if (!flat.ok) expect(flat.reason).toContain('现在是 0 个')

    const blank = parseGridInput('   \n\n')
    expect(blank.ok).toBe(false)
    if (!blank.ok) expect(blank.reason).toContain('现在是 0 行')
  })

  it('一行输入（256 个字连写）：字符数不对、有非法字符都报得清', () => {
    const total = GRID_TOTAL
    expect(total).toBe(GRID_ROWS * GRID_COLS)

    const short = parseGridInput('5'.repeat(240))
    expect(short.ok).toBe(false)
    if (!short.ok) expect(short.reason).toContain(`现在是 240 个（刚好 15 行）`)

    const odd = parseGridInput('5'.repeat(250))
    expect(odd.ok).toBe(false)
    if (!odd.ok) expect(odd.reason).toContain('现在是 250 个')

    const badChar = parseGridInput('5'.repeat(total - 1) + '8')
    expect(badChar.ok).toBe(false)
    if (!badChar.ok) expect(badChar.reason).toContain(`第 ${total} 个字符是「8」`)

    const badEarly = parseGridInput('a' + '5'.repeat(total - 1))
    expect(badEarly.ok).toBe(false)
    if (!badEarly.ok) expect(badEarly.reason).toContain('第 1 个字符是「a」')
  })
})

describe('pixel-grid 给服务端用的归一化', () => {
  it('行数组与文本都能归一化成同一种形状', () => {
    const grid = banded()
    expect(normalizeGrid(grid)).toEqual(grid)
    expect(normalizeGrid(grid.join('\n'))).toEqual(grid)
    expect(normalizeGrid(grid.join(''))).toEqual(grid)
  })

  it('非法一律返回 null（服务端据此 400）', () => {
    expect(normalizeGrid('不是点阵')).toBeNull()
    expect(normalizeGrid(banded().slice(0, 3))).toBeNull()
    expect(normalizeGrid(undefined)).toBeNull()
    expect(normalizeGrid(123)).toBeNull()
    expect(normalizeGrid({ rows: banded() })).toBeNull()
  })
})

describe('pixel-grid 渲染取值', () => {
  it('rowToIndexes 永远返回 16 个下标，非法字符按白底', () => {
    expect(rowToIndexes('0123456701234567')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7])
    expect(rowToIndexes('88ab')).toEqual([0, 0, 0, 0, ...Array(12).fill(0)])
    expect(rowToIndexes(undefined)).toHaveLength(GRID_COLS)
    expect(rowToIndexes('0123')).toEqual([0, 1, 2, 3, ...Array(12).fill(0)])
  })
})

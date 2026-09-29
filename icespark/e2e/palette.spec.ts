import { expect, test } from '@playwright/test'

/**
 * 配色门（架构 §4）—— 防的是「配色静默失效」。
 *
 * 为什么单独为它写一条门：旧前端漏注入过一次 token，220 处 `var()` 引用、0 处定义。
 * 后果不是「颜色偏一点」，而是 `var()` 取不到值时整条声明按「计算值无效」处理 ——
 * `border` 简写被整个重置成 `none`，全站边框消失，只剩白底黑字。
 * 这种失败**没有任何报错**，只能靠断言发现。
 *
 * 四条断言：
 *  1. 样式表里出现的每一个 `var(--x)` 都能在 `:root` 上解析出非空值
 *  2. 外框的边框真的画出来了（有宽度、实线、颜色与背景不同），且**没有被加宽**（用户要求）
 *  3. 组件样式里不许出现具体色值（颜色只许写在 tokens.ts）
 *  4. 像素字体真的加载了（没加载会静默退回系统字体，字形全变但看不出原因）
 */

/** 组件样式里允许出现的「非色值」关键字 */
const ALLOWED_COLOR_WORDS = ['transparent', 'currentcolor', 'inherit', 'none', 'unset']

test('每一个 var() 都能解析出非空值', async ({ page }) => {
  await page.goto('/')

  const report = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement)
    const unresolved: string[] = []
    const seen = new Set<string>()

    const scan = (text: string) => {
      for (const match of (text || '').matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
        const name = match[1]
        if (!name || seen.has(name)) continue
        seen.add(name)
        if (rootStyle.getPropertyValue(name).trim() === '') unresolved.push(name)
      }
    }

    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList
      try {
        rules = sheet.cssRules
      } catch {
        // 跨域样式表读不到规则，直接跳过
        continue
      }
      for (const rule of Array.from(rules)) {
        scan(rule.cssText)
        // @media / @supports 里的规则也要扫到
        const nested = (rule as CSSGroupingRule).cssRules
        if (nested) {
          for (const inner of Array.from(nested)) scan(inner.cssText)
        }
      }
    }

    return { unresolved, total: seen.size }
  })

  expect(report.total).toBeGreaterThan(10)
  expect(report.unresolved).toEqual([])
})

test('外框边框真的画出来了，且没有被加宽', async ({ page }) => {
  await page.goto('/')

  const frame = await page.evaluate(() => {
    const screen = document.querySelector('[data-testid="screen"]')
    if (!screen) return null
    const style = getComputedStyle(screen)
    const app = getComputedStyle(document.querySelector('.app') as Element)

    return {
      borderWidth: style.borderTopWidth,
      borderStyle: style.borderStyle,
      borderColor: style.borderTopColor,
      background: style.backgroundColor,
      appBackground: app.backgroundColor,
    }
  })

  expect(frame).not.toBeNull()

  // 「有宽度、实线」：var() 失效时这里会变成 0px / none
  expect(frame?.borderWidth).toBe('3px')
  expect(frame?.borderStyle).toBe('solid')
  // 「看得见」：边框颜色不能等于背景色，否则等于没画
  expect(frame?.borderColor).not.toBe(frame?.background)
  expect(frame?.borderColor).not.toBe(frame?.appBackground)
  // 「不加宽外框」是用户明确要求：底栏换到框外之后，这条仍然只认 3px
  // （底栏的位置与结构由外壳保真门 e2e/shell.spec.ts 守）
})

test('组件样式里不出现具体色值（颜色只许写在 tokens.ts）', async ({ page }) => {
  await page.goto('/')

  const offenders = await page.evaluate((allowedWords) => {
    const found: string[] = []

    // 允许的例外：构建期生成的 token CSS 本身就是色值的落点
    const isTokenSheet = (text: string) => text.includes('--paper') && text.includes('--edge')

    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }

      const texts: string[] = []
      for (const rule of Array.from(rules)) {
        texts.push(rule.cssText)
        const nested = (rule as CSSGroupingRule).cssRules
        if (nested) for (const inner of Array.from(nested)) texts.push(inner.cssText)
      }

      if (texts.some(isTokenSheet) || texts.some((text) => text.includes('--blue-100: #'))) continue

      for (const text of texts) {
        for (const match of text.matchAll(/#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)/g)) {
          const value = match[0]
          if (allowedWords.some((word) => value.includes(word))) continue
          found.push(value)
        }
      }
    }

    return [...new Set(found)]
  }, ALLOWED_COLOR_WORDS)

  expect(offenders).toEqual([])
})

test('像素字体真的加载了', async ({ page }) => {
  await page.goto('/')

  const loaded = await page.evaluate(async () => {
    await document.fonts.ready
    return {
      // 字体没加载时这里为 false —— 静默退回系统字体正是最难发现的失败
      check: document.fonts.check('12px ArkPixel'),
      faces: Array.from(document.fonts).map((face) => `${face.family}:${face.status}`),
      // 底栏是像素字体的主战场：它没加载时这里会退回系统字体
      used: document.querySelector('[data-testid="deck"]')
        ? getComputedStyle(document.querySelector('[data-testid="deck"]') as Element).fontFamily
        : '',
    }
  })

  expect(loaded.faces.join(',')).toContain('ArkPixel')
  expect(loaded.used).toContain('ArkPixel')
  expect(loaded.check).toBe(true)
})

import type { AxeResults, NodeResult, Result } from 'axe-core'

/**
 * 无障碍扫描的**唯一已知清单**（架构 §33「axe 审计收口」）。
 *
 * 为什么要有这个文件：`a11y.spec.ts` 先立了这份清单，后来 `admin-links` / `profile` / `write`
 * 各自又抄了一份（`KNOWN_CONTRAST` / `KNOWN` 之类），口径迟早会漂移 ——「哪几处是放行的」
 * 必须只有**一处**可改。三处口径全部来自用户裁决，理由都写在下面，**不要「顺手修好」，
 * 也不要「顺手放宽」**。
 *
 * ── 放行一：底栏小字的对比度（color-contrast） ──
 * 样机定稿里 `.deck` 就是淡色小字：版权 / 口号用 `--ink-soft`、数据源标记用 `--blue-600`，
 * 用户明确要求保持这个样式。实测小字 3.32:1、数据源 4.24:1，低于 WCAG AA 的 4.5:1。
 * 放行范围**只有这四处节点**（`.deck-src` / `.is-copyright` / `.is-slogan` / `.is-icp`），
 * 页面上新增的任何对比度问题照样拦下来。
 *
 * ── 放行二：卡片标题跳一级（heading-order） ──
 * 样机里只有文章页有 `h1`（`<h1 class="doc-title">`）；首页 / 列表 / 关联 / 关于的「页面名」
 * 是 `.head-title` 那个机器铭牌 span，卡片标题则一律 `h3`。生产版为了让屏幕阅读器有个
 * 一级地标，在**外壳**补了视觉隐藏的 `h1`（`App.vue` 的 `.sr-heading`），于是出现 h1 → h3。
 * 把卡片标题改成 `h2` 就是改样机 DOM，所以放行 —— 只放行样机卡片标题这一类节点。
 *
 * ── 放行三：屏幕自身的可滚动区域（scrollable-region-focusable） ──
 * 只命中一种页面：`/about`（见 `e2e/a11y-audit.spec.ts` 的复验）。
 * 原因是结构性的 —— `.screen-inner`（`<main>`）装的内容比屏幕高，而关于页是**纯静态正文**，
 * 里面一个可聚焦元素都没有，于是 axe 判定「键盘用户没法滚这块区域」。
 * 实际上键盘滚得动：关于页自己接管 `↑↓` / `PgUp PgDn`（`AboutView.vue` 的 `onPad`
 * → `scrollScreenBy`），这条路径由 `a11y-audit.spec.ts` 里那条**补偿断言**钉住。
 * 不给 `.screen-inner` 加 `tabindex="0"` 的理由：那会让每一页的第一个 Tab 落点变成整块屏幕，
 * 直接改掉样机冻结的「TAB 按 DOM 顺序遍历」口径（§25.1 / §32.3 刚守过它）。
 */
export const KNOWN_CONTRAST_TARGETS = ['.deck-src', '.is-copyright', '.is-slogan', '.is-icp']

/** 已知的标题跳级节点：样机的卡片标题就是 h3，外壳补的 h1 与它差了一级 */
export const KNOWN_HEADING_TARGETS = ['.post-title', '.card-title']

/** 已知的可滚动区域：屏幕本身。补偿路径见文件头第三条与 `a11y-audit.spec.ts` */
export const KNOWN_SCROLLABLE_TARGETS = ['.screen-inner']

/** 放行的规则 → 该规则对应的节点选择器清单 */
const ALLOWLIST: Record<string, string[]> = {
  'color-contrast': KNOWN_CONTRAST_TARGETS,
  'heading-order': KNOWN_HEADING_TARGETS,
  'scrollable-region-focusable': KNOWN_SCROLLABLE_TARGETS,
}

/** 一个节点是否落在放行清单里（`target` 链与节点自身的 HTML 都看一眼） */
function nodeAllowed(rule: string, node: NodeResult): boolean {
  const selectors = ALLOWLIST[rule]
  if (!selectors) return false
  const target = node.target.join(' ')
  const html = node.html ?? ''
  return selectors.some((selector) => target.includes(selector) || html.includes(selector.slice(1)))
}

export interface A11yScan {
  /** 不在已知清单里的违规（`规则 → 命中点`），空数组才算过 */
  violations: string[]
  /** 被放行的已知命中点，用来在报告里显示「放行了什么」 */
  allowed: string[]
}

/**
 * 把一次 axe 扫描结果切成「真违规」与「已知放行」两半。
 *
 * 判据是**节点级**的：同一条规则里，只有落在清单里的那些节点被放行 ——
 * 所以「底栏小字对比度」放行不会顺手放行页面里新出现的对比度问题。
 */
export function scanViolations(result: AxeResults): A11yScan {
  const violations: string[] = []
  const allowed: string[] = []
  for (const violation of result.violations as Result[]) {
    for (const node of violation.nodes) {
      const line = `[${violation.impact ?? 'unknown'}] ${violation.id} → ${node.target.join(' ')}`
      if (nodeAllowed(violation.id, node)) allowed.push(line)
      else violations.push(line)
    }
  }
  return { violations, allowed }
}

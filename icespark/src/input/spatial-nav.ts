/**
 * 按**屏幕上的视觉位置**在若干可交互元素之间移动焦点（方向键与 WASD 共用同一套方向语义）。
 *
 * 为什么不能只按 DOM 顺序或写死的列数走：
 *   · 分组芯片、标签、页签这些是**换行的**横排 —— 列数随窗口宽度变，写死列数就会跳错格；
 *   · 文稿面板里「分组行 → 页签行 → 篇目列表」是三段不同结构，按线性索引走，← / → 根本到不了
 *     上一段（用户反馈：文稿里方向键只能切文章，切不到分组）。
 *
 * 所以这里量的是**真实的盒子**（`getBoundingClientRect`）：
 *   ① 候选必须在那一个方向上（近边越过当前格的远边，留 2px 误差，免得边框重叠被判成"不在那一侧"）；
 *   ② 与该方向垂直的那一轴上**有重叠**的候选优先（同一行里的右邻，而不是斜下方那个）；
 *   ③ 都在同一行/列时，按近边的距离取最近的；跨行的斜对角也能到（代价更高，排在后面）。
 *
 * `pickByGeometry` 是纯函数（只吃盒子、不碰 DOM），因此可以在 vitest（node 环境、没有布局引擎）里
 * 用假坐标把语义钉住；量 DOM 的那一层是 `navBoxes` / `stepNav`，很薄。
 */

export type NavDirection = 'up' | 'down' | 'left' | 'right'

export interface NavBox {
  /** 这一格的稳定标识（同时写在 DOM 的 `data-nav` 上） */
  key: string
  left: number
  top: number
  right: number
  bottom: number
}

/** 相邻两格边框重叠一两个像素时不该判成"不在那一侧" */
const EDGE = 2

/** 垂直轴上重叠的候选胜出的加成：只要同排有邻居，就不该跳到斜对角去 */
const ALIGN_BONUS = 10000

/** 垂直轴的偏移在打分里的权重（小一点才优先"最近的"，但斜对角要明显更贵） */
const PERP_WEIGHT = 3

/**
 * 垂直轴上两格之间的**间隔**（重叠就是 0）。
 *
 * 这里特意不用"两个中心点的距离"：宽元素（例如占满一行的「＋ 新建文章」）的中心离得远，
 * 用它当尺子会把明明在正上方那一行（页签行）判给旁边那一行更靠中间的芯片（实测就是这样：
 * 从篇目往上走落到了「＋ 新建分组」，而不是紧挨着的页签）。
 * 项目投影有重叠 → 垂直间隔 0 → 只剩"沿方向的距离"说话，正上方那一行自然胜出。
 */
function perpendicularGap(box: NavBox, current: NavBox, horizontal: boolean): number {
  return horizontal
    ? Math.max(0, Math.max(box.top, current.top) - Math.min(box.bottom, current.bottom))
    : Math.max(0, Math.max(box.left, current.left) - Math.min(box.right, current.right))
}

/**
 * 从 `current` 出发，朝 `dir` 找下一格；找不到返回 `null`（调用方据此**不消费**这个键）。
 * `current` 为 `null`（光标还没落进来 / 原来那一格被过滤掉了）时取第一格。
 */
export function pickByGeometry(
  current: NavBox | null,
  boxes: NavBox[],
  dir: NavDirection,
): string | null {
  if (!current) return boxes[0]?.key ?? null

  const horizontal = dir === 'left' || dir === 'right'
  let best: { key: string; score: number } | null = null

  for (const box of boxes) {
    if (box.key === current.key) continue

    // ① 必须在那一侧：近边要越过当前格的远边
    const primary = horizontal
      ? dir === 'right'
        ? box.left - current.right
        : current.left - box.right
      : dir === 'down'
        ? box.top - current.bottom
        : current.top - box.bottom
    if (primary < -EDGE) continue

    // ② 垂直轴上有没有重叠（同一行 / 同一列）
    const overlap = horizontal
      ? Math.min(box.bottom, current.bottom) - Math.max(box.top, current.top)
      : Math.min(box.right, current.right) - Math.max(box.left, current.left)

    // ③ 打分：先看垂直轴对齐（重叠的优先），再看沿这个方向的距离
    const perp = perpendicularGap(box, current, horizontal)
    const score = Math.max(primary, 0) + perp * PERP_WEIGHT - (overlap > 0 ? ALIGN_BONUS : 0)

    if (!best || score < best.score) best = { key: box.key, score }
  }

  return best?.key ?? null
}

/**
 * 离 `target` 最近的一格（按两格中心点的距离）。
 *
 * 用在"点完这一格它就没了"的场合：标签建议加上之后候选里不再有它、标签上的 ✕ 点完那一枚就消失 ——
 * 这时光标该留在原地附近，而不是掉回面板第一格（那是页头的关闭按钮）。
 * 调用方在点之前先量下这一格的盒子，点完拿它当锚点找最近的剩下那一格。
 */
export function nearestBox(boxes: NavBox[], target: NavBox): string | null {
  const cx = (target.left + target.right) / 2
  const cy = (target.top + target.bottom) / 2
  let best: { key: string; distance: number } | null = null
  for (const box of boxes) {
    if (box.key === target.key) continue
    const dx = (box.left + box.right) / 2 - cx
    const dy = (box.top + box.bottom) / 2 - cy
    const distance = dx * dx + dy * dy
    if (!best || distance < best.distance) best = { key: box.key, distance }
  }
  return best?.key ?? null
}

/** 量出容器里所有**够得着**的格子：带 `data-nav`、可见、没禁用 */
export function navBoxes(container: HTMLElement): NavBox[] {
  const boxes: NavBox[] = []
  for (const el of container.querySelectorAll<HTMLElement>('[data-nav]')) {
    const key = el.dataset.nav
    if (!key) continue
    if (el.matches('[disabled], [aria-hidden="true"]')) continue
    const rect = el.getBoundingClientRect()
    // 不可见（display:none / 零面积）的格子直接出局 —— 过滤后的列表、条件渲染的那几行都会走到这里
    if (rect.width <= 0 || rect.height <= 0) continue
    boxes.push({ key, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })
  }
  return boxes
}

/** DOM 那一层：从 `currentKey` 朝 `dir` 走一格（找不到就 `null`） */
export function stepNav(
  container: HTMLElement | null,
  currentKey: string | null,
  dir: NavDirection,
): string | null {
  if (!container) return null
  const boxes = navBoxes(container)
  if (!boxes.length) return null
  return pickByGeometry(
    boxes.find((box) => box.key === currentKey) ?? null,
    boxes,
    dir,
  )
}

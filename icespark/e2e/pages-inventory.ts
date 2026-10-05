/**
 * 逐页输入等价性的**覆盖清单**（配合 `parity-coverage.spec.ts` 自检）。
 *
 * 为什么要有一份清单而不是只在文档里写张表：硬要求「单独用鼠标或单独用键盘都能完成全部交互」
 * 是**逐页**的，而页面是会新增的 —— 新加一页时最容易发生的事就是「忘了补 parity 旅程」，
 * 而这种遗漏**不会让任何现有用例变红**。这份清单把「哪一页、用哪种输入方式、由哪条用例守着」
 * 变成可执行的数据，`parity-coverage.spec.ts` 会在三件事上把关：
 *   ① 清单里的路由必须和 `src/router/routes.ts` 里的字面量**完全一致**（多一页少一页都红）；
 *   ② 每条「已覆盖」的声明必须能在**它该在的文件**（`parity-pages.spec.ts` /
 *      `parity-pages-keyboard.spec.ts`）里按用例名锚点找到 —— 声明与用例不许对不上；
 *   ③ 没覆盖的那几种输入方式必须写清 `reason`（缺口只能是**写下来的**，不能是漏掉的）。
 *
 * `mouse` / `keyboard` 的值是用例名的**片段**（两个 spec 里 `test('...')` 的子串），
 * 写成片段而不是整名，是为了让用例标题以后可以微调措辞而不用同步改这里。
 */
export interface PageCoverage {
  /** 路由 path，必须与 `src/router/routes.ts` 里的字面量逐字一致 */
  path: string
  /** 纯鼠标旅程的用例名锚点；`null` 表示这一页没有鼠标路径（此时必须给 `reason`） */
  mouse: string | null
  /** 纯键盘旅程的用例名锚点；`null` 表示这一页没有键盘路径（此时必须给 `reason`） */
  keyboard: string | null
  /** 某种输入方式没覆盖的原因（人话，且要说清是「没有可点的东西」还是「待补」） */
  reason?: string
}

export const PAGES: PageCoverage[] = [
  // ── 六个样机页面 ──
  { path: '/', mouse: '首页点卡进文章', keyboard: '首页用方向键走到卡片' },
  { path: '/posts', mouse: '列表页点芯片筛选', keyboard: '列表页筛选（G/→/ENTER）' },
  { path: '/post/:key', mouse: '文章页点赞、评论对话框开与关', keyboard: '文章页 L/→/ENTER' },
  { path: '/links', mouse: '关联页点卡片进站内页', keyboard: '关联页方向键选卡' },
  {
    path: '/about',
    mouse: '关于页点条目链接跳站内页',
    keyboard: '关于页 F 把光标送进条目组',
  },

  // ── 用户侧补充页 ──
  { path: '/user/:username', mouse: '公开用户页点作者的文章卡', keyboard: '公开用户页回车进作者的文章' },
  { path: '/profile', mouse: '个人设置页点进昵称格改写', keyboard: '个人页改昵称并保存' },
  {
    path: '/write/:key?',
    mouse: '写作页点两格写字',
    keyboard: '写作页打字 + Ctrl/⌘+S 存草稿',
  },

  // ── 超管三页 ──
  { path: '/admin/site', mouse: '站点设置页点段换页', keyboard: '站点设置页 ↓/ENTER 换段' },
  { path: '/admin/links', mouse: '管理页读一条、改一条', keyboard: '外链管理页 ↓ 到卡片' },
  { path: '/admin/audit', mouse: '审计页点翻页按钮来去', keyboard: '审计页 PgDn / PgUp 翻页' },

  // ── 兜底页 ──
  { path: '/:pathMatch(.*)*', mouse: '404 皮肤点「文章列表」', keyboard: '404 皮肤方向键选动作' },
]

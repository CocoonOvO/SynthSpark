# icespark 独立前端 · 技术选型与架构（已定稿）

> 这份文档是**决定记录**，也是后续开发的**可执行约束**。
> 第 3 节里的每一条都会落成 `scripts/` 下的脚本和 `e2e/` 下的用例，不是建议。
>
> 状态：已定稿 · 尚未开工（当前阶段仍在优化 `design/icespark-prototype/` 样机）

---

## 1. 约束与结论

用户给的边界（二选一）：

- **A** 完全不依赖旧前端，并实现其全部功能
- **B** 只复用旧前端的一些通用功能（如 api、配置）

### 决定：选 A —— 完全独立，零 import 旧前端

理由不是洁癖，而是"复用 api"这个方向本身错了：

1. **API 层的真相来源是后端，不是旧前端。**
   后端在 `/api/openapi.json` 暴露 63 paths / 50 schemas / 80 个带 200 响应体 schema 的 operation。
2. **旧前端的 `src/api` 是从后端派生的产物**，且 `frontend/API-SURFACE.md` 已记录 **20 处不匹配**。
   复用它 = 连它的错误一起继承。
3. **旧前端里除 api/config 外没有值得共享的东西**（已逐个核对）：
   - `src/utils/` 只有 1 个文件（hljs 语言表）
   - `src/composables/` 只有 1 个文件（milkdown 主题）
   - `src/effects/` 是十几个行的玩具
   - `src/themes/` 11 套主题是旧前端专属
   → 要么是**派生物**，要么是**旧架构专属**，没有一个是真正的通用件。
4. **旧前端最终会被本前端替换**，把新前端绑到一个将死的目录上没有收益。

### 第二条决定：fidelity = 皮肤式

8bit 是**外壳与交互**，底层仍是正常文档：真实 URL、语义化 DOM、文本可选中、屏幕阅读器可用。
这一条决定了后面所有选型——尤其是为什么必须上 `vue-router` 而不是把样机的场景栈直接搬过来。

---

## 2. 技术选型

版本全部对齐仓库里已安装的实际版本，不引入第二套生态。

| 层面 | 选型 | 版本 | 理由 |
|---|---|---|---|
| 框架 | Vue + Composition API | 3.5.41 | 与仓库一致 |
| 构建 | Vite + @vitejs/plugin-vue | 7.3.6 / 6.0.8 | 同上 |
| 语言 | TypeScript + vue-tsc | 5.9.3 / 3.3.9 | 样机从未做过类型检查，这次第一天上锁 |
| 路由 | **vue-router** | 5.2.0 | 皮肤式的硬需求：深链接 / 后退键 / SEO |
| 状态 | pinia | 3.0.4 | 跨场景共享：配置 / 文章 / 评论 / 账号 |
| 正文渲染 | **markdown-it** + dompurify + highlight.js（精选语言） | 3.4.13 / 11.11.1 | 旧前端拿 Milkdown 渲染**只读**正文，还引了 `refractor/all` 全语言包；为阅读背一整套 ProseMirror 不划算 |
| 编辑器 | @milkdown，**懒加载**，只在写作路由出现 | 7.22.0 | 唯一真需要 WYSIWYG 的地方；必须保证它不进阅读 bundle |
| 类型生成 | openapi-typescript（dev） | — | 从后端 schema 生成，构造上消灭两份 API 层漂移 |
| 样式 | 手写 CSS + CSS 变量（**构建期**生成静态 CSS） | — | 运行期注入漏过一次（220 处 `var()`、0 处定义），不能再漏 |
| 像素控件 | 手写 button / input / select / table / pager / dialog / tabs | — | 不引 element-plus；F 层只换皮不改 IA |
| 测试 | @playwright/test + vitest | 1.61.1 / 4.1.10 | 与仓库同版本，E2E 思路直接沿用 |
| 质量 | oxlint + eslint + prettier | 1.50.0 / 10.8.0 / 3.8.1 | 与仓库一致，减少维护者切换成本 |

---

## 3. 目录与分层

```
icespark/
├── package.json                  # 独立 app；不引入 workspace，仓库根也没有 package.json
├── tsconfig.json
├── vite.config.ts                # alias · /api 代理 · 构建期生成 token
├── eslint.config.js
├── public/
│   ├── site.config.json
│   ├── robots.txt
│   ├── sitemap.xml
│   └── fonts/                    # 子集化产物，gitignore
├── scripts/
│   ├── gen-api-types.mjs         # openapi.json → src/api/schema.d.ts
│   ├── check-api-drift.mjs       # 契约漂移门
│   ├── gen-tokens-css.mjs        # tokens.ts → tokens.generated.css
│   ├── subset-font.mjs           # 字体子集化
│   └── check-independence.mjs    # 零外部 import 门
├── e2e/
│   ├── parity-keyboard.spec.ts
│   ├── parity-mouse.spec.ts
│   ├── palette.spec.ts
│   └── a11y.spec.ts
└── src/
    ├── main.ts
    ├── api/                      # schema.d.ts(生成) + client.ts + posts/comments/search…
    ├── config/                   # 站点配置三级合并 + 默认文案
    ├── router/                   # URL 是唯一真相来源
    ├── input/                    # pad.ts · focus.ts · scopes.ts —— 挂外壳根节点
    ├── scene/                    # 转场表现层（订阅 router，不再自己管导航）
    ├── styles/                   # tokens.ts(源) · tokens.generated.css(产物) · pixel.css · crt.css
    ├── machine/                  # M 层：对话框 · 菜单 · 开机 · 404 · 加载
    ├── frame/                    # F 层：卡片 · 列表 · 分页 · 标签 · 表单框架
    ├── signal/                   # S 层：正文 · 代码 · 图片 · 评论正文 · 编辑器容器
    ├── stores/
    └── views/                    # 路由级页面，组合上面四层
```

### 四条关键约定

1. **不加 workspace、不加根 `package.json`**（仓库现在没有）。
   `icespark/` 是一个自带 `package.json` 的独立 app，`npm install` 在自己的目录里跑。
2. **M / F / S 不只是文档里的说法，而是目录 + 一条 lint 规则**：
   `signal/` 不允许 import `machine/` 的机器质感组件。
   这样"正文必须能退化"不会被后来的人悄悄破坏。
3. **`scene/` 降级为转场表现层**，订阅 router 的 `afterEach`，自己不再管导航。
   样机里那 153 行 `scene.ts` 会缩到 40 行左右。
4. **`input/` 挂外壳根节点，不挂 `window`**，否则会和搜索框、表单、中文输入法打架。

---

## 4. 独立性怎么"可验证"

否则"独立"只是口号。写成脚本，进 `npm scripts` 和 CI：

| 门 | 做法 | 挡住什么 |
|---|---|---|
| `check-independence.mjs` | 扫 `icespark/src`，任何指向 `icespark/` 之外的相对导入或别名一律报错 | 偷偷 import 旧前端 |
| 依赖白名单 | `package.json` 出现旧前端专有依赖（element-plus、prismjs、refractor 等）即失败 | 生态污染 |
| 懒加载门 | `@milkdown/*` 只允许被写作路由引用 | 编辑器混进阅读 bundle |
| `check-api-drift.mjs` | 重新生成 `schema.d.ts` 并 diff，不一致即失败 | **当今那 20 处不匹配的成因** |
| `palette.spec.ts` | 枚举样式表里**所有** `var()`，逐个断言能解析；断言边框真的画出来了 | 配色静默失效 |
| `parity-*.spec.ts` | 纯键盘 / 纯鼠标两条独立旅程 | 输入等价性腐化 |
| `a11y.spec.ts` | axe-core 扫描 | 无障碍回退 |

---

## 5. Parity 计划

"全部功能"= 11 个视图 / 约 14,000 行 UI（不含 API 层和主题）。

| 阶段 | 覆盖旧前端的 | 说明 |
|---|---|---|
| **P0 骨架** | — | 独立性门 / 契约漂移门 / lint / vue-tsc / e2e 跑通 |
| **P1 设计系统** | — | tokens 构建期生成、pixel.css、CRT、字体子集、M/F/S 目录与 lint 规则 |
| **P2 交互内核** | — | 手柄层 + 共享焦点 + 作用域、场景转场、对话框、菜单 |
| **P3 公开阅读** | HomeView 559 · PostListView 1373 · PostDetailView 1499 · About 286 · Links 288 · 404 460 | 路由化 + markdown-it 渲染正文 |
| **P4 搜索与档案** | SearchResultsView 1167 · UserProfileView 554 | 含 `/api/search/suggest` |
| **P5 账号与管理** | LoginView 526 · ProfileView 2256 | 登录/注册、个人设置、站点设置、外链管理、审计日志 |
| **P6 写作** | PostEditView 2769 · MilkdownEditor 796 | **最大风险项** |
| **P7 收尾** | — | meta / JSON-LD / sitemap / axe 审计 / 预渲染 / 性能预算门 |

---

## 6. 三个风险点

1. **总量**：11 个视图、约 14,000 行 UI，不是几轮能完的。按阶段交付，每阶段都能跑起来。
2. **编辑器是最大风险项**：旧 `PostEditView` 2769 行 + `MilkdownEditor` 796 行，还叠着上传、草稿、图片插入。
   milkdown 的样式很硬（旧代码靠 `background: transparent !important` 压它），在像素皮里会更难缠。
3. **管理面也要披 8bit 皮**：站点设置 / 外链管理 / 审计日志那些表单和表格。
   压住工作量的办法是执行"F 层只换皮、不改 IA"——结构照搬语义，只重写 CSS。

---

## 7. 已实测的接口事实

实现时依赖这些，都是实打实测过的：

| 事实 | 结论 |
|---|---|
| `GET /api/posts/slug/{slug}` 可用，slug 是中文 | 真实 URL 用 slug，自动百分号编码 |
| `GET /api/comments/post/{post_id}` 无鉴权 | 匿名也能读评论 |
| `POST /api/comments` 不传 token 返回 **201**，`author.id = "anonymous"` | 匿名评论可用；但 **OpenAPI 声明它需要鉴权，是错的** |
| `POST /api/likes/{id}` 不传 header 返回 201，并**下发** `anonymous_token` | 客户端必须存下来 |
| `GET /api/likes/{id}/status` + `X-Anonymous-Token` 头 | `is_liked` 才正确；不带头永远 false |
| 重复 POST 幂等；`DELETE` 归零 | 行为正确 |
| 后端 `SEOInterceptor` 的 `SEO_ENABLED` 默认 **False**，`.env` 也没开 → 从未挂载 | "爬虫 SEO 交给后端"这条路是断的，新前端自己解决 |

最后一条的现实做法：真实 URL + 客户端 meta/JSON-LD + `robots.txt` + `sitemap.xml`
（现代 Googlebot/Bingbot 会执行 JS），预渲染留到 P7，不在 P0–P3 上 SSG。

---

## 8. 两个定死的细节

- **存储键**：token 沿用 `synthspark-token`；本 app 自己的偏好键用 `synthspark-icespark-*`。
  AGENTS.md 要求"前端存储键只允许 synthspark 写法"，样机里的 `icespark-*` 已在第四轮全部改掉，
  并由 `e2e/gates.mjs` 的「存储键门」断言兜底（枚举 localStorage，任何不带前缀的键直接失败）。
- **部署不共享**：`icespark/` 产出自己的 `dist/`。
  分流规则（`/` → icespark，`/admin` 或旧路径 → frontend）由部署方决定，仓库里不写配置——与 AGENTS.md 第 9 节一致。

---

## 9. 起手顺序

**P0 + P1 先做**：骨架、三道门（独立性 / 契约漂移 / 配色）、设计系统，
跑通 `dev` / `build` / `type-check` / `e2e`，再进 P2。

---

## 10. 样机第四轮：结构与输入层的定稿（新增）

样机（`design/icespark-prototype/`）在这一轮把「页面结构」和「输入路由」定了下来，
正式实现照抄这一节即可，不必再重新推演。

### 10.1 导航结构：标签页 = 历史栈的栈底

```
历史栈（ui/scene.ts）：history[SceneFrame] + cursor
├── 栈底：标签页之一（home / posts / links / about）   ← switchTab() 用 resetTo() 清空历史
└── 上面：文章详情（article, param=postId）             ← pushScene()
```

- 「浏览类页面」是**并列的标签页**，不是层层深入的页面；因此切标签用 `resetTo`（清历史），
  而不是 `pushScene`（否则点四下标签就攒出四级历史，按三次返回才回得到家）。
- 「返回上一页 / 转到下一页」对应 `cursor ± 1`，两个方向都成立；压入新场景时截断前进分支（浏览器语义）。
- 正式版把这一层换成 vue-router（`push` / `back` / `forward` 语义完全同构），
  `SceneStack` 降级为转场表现层（订阅 `router.afterEach`）。
- **第五轮已按这条推演落地**：样机接上了 vue-router，`ui/scene.ts` 里的 history + cursor 整个删掉，
  只留「路由 → 场景帧」的翻译与转场。最终形态见 §11，本节的历史栈描述**仅作演进记录**。

### 10.2 输入路由：焦点分区

`pad.ts` 是**输入层**，不只是键位表。它持有一条路由规则：

- `activeScope`：`scene` / `pause`——模态弹窗打开时内容层收不到按键。
- `focusZone`：`content` / `tabs`——焦点在标签栏时，`scene` 作用域的监听器被跳过。
  （没有这条规则，同一个方向键会既切标签又移动列表光标。）
- 消费语义：handler 返回 `true` 才算被消费，**只有被消费才 `preventDefault`**，没接管的键还给浏览器。
- `ensureFocusedVisible()`：焦点是自绘的（class，不是 DOM focus），浏览器不会帮忙滚动；
  每次按键被消费后在 `requestAnimationFrame` 里 `scrollIntoView({ block: 'nearest', inline: 'nearest' })`。
  （第 5 轮修正：原来只量纵向可见性，横条里的芯片滚不进来 —— 见 §11.5。）

键位（正式版沿用）：

| 键 | 动作 | 备注 |
|----|------|------|
| `↑↓←→` / `WASD` | 移动焦点 | 栅格用**视觉相邻**语义（见 10.3） |
| `Enter` / `Space` / `Z` | 确认 | |
| ~~`Esc` / `Backspace` / `X`~~ | ~~返回 / 关闭~~ | **第五轮改**：`Esc` 专管开/关菜单，`X` / `Backspace` 走历史后退 |
| `P` | 菜单 | 全局键，任何场景可呼出 |
| `PageUp` / `PageDown` | 上一页 / 下一页 | 列表翻页；文章页是整屏滚动 |
| ~~`Q` / `E`~~ | ~~上一个 / 下一个标签页~~ | **第五轮改**：标签页切换换到 `Tab` / `Shift+Tab`；`Q` / `E` 改作历史后退 / 前进 |
| ~~`Tab`~~ | ~~原生，不劫持~~ | **第五轮改**：`Tab` 参与标签页切换；只在输入框里保留原生语义（见 §11.2） |

### 10.3 栅格导航：视觉相邻，不是依次切换

`focus.ts` 的 `spatialIndex(i, dir, cols, count)`：
两列时 `←` = i-1（同列才允许）、`→` = i+1（同列且未越界）、`↑` = i-2、`↓` = i+2；
返回 `null` 表示该方向没有相邻项，由调用方决定（列表页首行再往上 = 焦点交给标签栏）。

### 10.4 焦点视觉：全站只允许一套

- `.focusable.is-focused`：浅蓝底（`--blue-200`）+ **盒子内侧**左右各一块 8×16、垂直居中的闪烁方块（`blink-step`）。
- 禁止任何场景再写第二套焦点（`outline`、加粗边框、inset 描边都不许）——
  同时出现"粗边框"和"闪烁光标"就是用户第四轮点名的视觉冲突。
- 文本输入框例外：用插入光标 + 描边变色做焦点指示（光标已经在那里了，再叠方块只会抢注意力）。
- `e2e/gates.mjs` 的「焦点门」把这三条写成断言（含"无额外 outline、边框仍为 3px"）。

### 10.5 图片容器：像素画框

`ImageFrame`：硬边 3px + 内凹立体边，画框上叠一层 3px 抖动网点（挂在画框上而不是图片上，
因此图挂了图案还在）。无封面时用**同尺寸**抖动占位块。
**关键纪律**：列表卡片里封面区的尺寸必须是常量（样机用固定 `flex-basis` + 固定宽高比），
否则「有封面 / 无封面」混排时网格必然参差。

### 10.6 markdown 渲染

样机：`markdown-it`，配置 `html: false`（原始 HTML 转义）、`linkify: true`；链接协议由 markdown-it 默认
`validateLink` 过滤（`javascript:` / `vbscript:` / `file:` 一律拒绝）；`fence` 规则外包一层容器，
把语言名做成右上角铭牌。
正式版：再叠 **DOMPurify**，代码高亮用 **highlight.js**（同步，只挂 `fence` 规则），
正文容器宽度**只设上限**（`max-width: min(100%, 1180px)`），不写死像素宽度。

排版分工（皮肤式的具体落地）：标题 / 表格 / 代码 / 标签走像素字体，
**大段正文走中文黑体**（16.5px / 1.95）——像素字体承担大字量正文会直接毁掉可读性。

### 10.7 数据源与样张开关

- 默认永远优先真接口，失败回退内置样张，右上角 `● LIVE / ○ DEMO` 明示。
- `?demo=1` 强制只吃样张：真实库里可能是重复标题、没有封面图的测试数据，
  而设计评审要看的恰恰是「有封面 / 无封面混排」「长文排版」这些形态。
  这个开关**必须存在**，否则每次评审都要先手工造一份干净数据。

### 10.8 登录

- `POST /api/auth/token`，**`application/x-www-form-urlencoded`**（不是 JSON），字段 `username` + `password`。
- `GET /api/auth/me` 带 `Authorization: Bearer <token>`；401 才清 token（网络抖动不清，避免把人踢下线）。
- 存储键：`synthspark-token`、`synthspark-icespark-user`。
- 登录成功后暂停菜单才会多出「编辑文章」一行 —— 这是"登录后才显示"的可验证表现。

### 10.9 这一轮的方法论教训（结论仍有效）

三条真实缺陷（列表卡片被裁、主页被切、每页 8 条溢出）在截图里**全都"看起来正常"**，
是量了 `clientHeight` / `scrollHeight` / `getBoundingClientRect()` 才发现的。

**结论**：验收不许只靠看图。凡是"放得下 / 对齐 / 不溢出"这类判断，必须给出数值断言或像素级差异断言。

---

## 11. 样机第五轮：路由与输入层的最终形态（新增）

用户这一轮要求「URL 能直达页面」，样机因此换了一次骨架：**路由接管 URL 与历史，表现层只管画面**。
这一节是最终形态，正式实现照抄即可。

### 11.1 分工：路由管 URL 与历史，`scene.ts` 管画面

```
vue-router（src/router/index.ts）        →  URL、参数、前进后退、深链接
        │  afterEach(to)
        ▼
ui/scene.ts（presenter）                 →  场景帧 + 120ms 遮罩 / 160ms 收尾的整屏像素转场
        │  frame / sceneKey
        ▼
App.vue                                  →  <component :is="SCENE_MAP[frame.id]">
```

**为什么不用 `<RouterView>`**：像素转场要求「遮罩先盖上，内容在遮罩掩护下再换」——
`RouterView` 会在导航的同一帧就把组件换掉，遮罩来不及盖。所以路由记录里的 `component` 全部是
`{ render: () => null }`（`Blank`）：它们只用来解析路径，不负责渲染。

路由表与旧前端路径保持一致，便于将来做分流与对照：

| 路径 | name | 画面 |
|------|------|------|
| `/` | `home` | 主页 |
| `/posts?group=&tag=&page=` | `posts` | 文章列表（筛选与页码都在 query） |
| `/post/:key` | `article` | 文章详情（`key` = slug 优先，没有 slug 才用 id） |
| `/links` / `/about` | `links` / `about` | 关联 / 关于 |
| `/:pathMatch(.*)*` | `not-found` | `redirect: home` —— 样机不做 404 页，但**不能白屏** |

另外三条要么容易忘、要么踩过：

- `createWebHistory()` + **`scrollBehavior: () => false`**：屏内滚动归 `.screen-inner`，
  别让浏览器在导航后自己跳 `document`。
- **深链接靠开机时序解决**：`booting` 为真时 `afterEach` 只同步历史标志、不动画面；
  `BootScene` 播完调 `finishBoot()` → `presentRoute()` 才按当前路由取场景帧。
  因此直接打开 `/post/xxx` 会先播自检、再落在那篇文章上；而「开机」本身**不是一条路由**，
  不会在历史里留下痕迹，按后退不会退回自检画面。
- **部署要求（易漏）**：`createWebHistory` 是真实路径，部署端必须配 SPA 回退
  （任何路径回 `index.html`），否则刷新 `/posts?page=2` 会 404。
  样机跑在 Vite dev server 上自带这条回退，所以样机上不会暴露这个坑。

### 11.2 输入层：两趟派发

第 5 轮把 `Esc` 从「返回」改成「开菜单」，立刻撞上一个射程很远的问题：**谁先收到这个键**。
暂停菜单打开时按 `Esc`，菜单要关；菜单一关，作用域就切回 `scene`，
如果全局监听是并发收到的，它会看到「现在没菜单」而**立刻把菜单再打开**。

因此派发分两趟（`ui/pad.ts`）：

```ts
type Handler = (a: PadAction, consumed: boolean) => boolean | void

// 第一趟：当前作用域（scene 或 pause）；焦点在标签栏时跳过 scene
// 第二趟：scope === 'any' 的全局监听器，附带 consumed
```

- `consumed === true` 表示第一趟已经用掉了这个键，全局监听必须让位。
- 作用域在派发**开始时**取一次（第二趟再取可能已经被改）。
- 注册顺序即同趟内的执行顺序：对话框（`pause`）在暂停菜单之后注册，所以菜单「子弹窗开着就返回 false」，
  按键自然落到子弹窗上 —— 一次按键仍然只走一层。

最终键表（正式版沿用）：

| 键 | 动作 | 作用域与条件 |
|----|------|--------------|
| `↑↓←→` / `WASD` | 移动焦点 / 滚动 | 场景；栅格用视觉相邻（§10.3） |
| `Enter` / `Space` / `Z` | 确认 | 场景 |
| `X` / `Backspace` | 返回上一页 | 全局，等价于 `Q`（历史后退） |
| `Esc` | 打开菜单 | 全局；但标签栏上先退回内容区、弹窗里先关弹窗、场景内先退出焦点分区 |
| `P` | 菜单开关 | 全局 |
| `Tab` / `Shift+Tab` | 下一个 / 上一个标签页 | **只在有标签栏的页面**；输入框内保留原生 Tab；转场遮罩期间吞掉，避免原生焦点悄悄移位 |
| `Q` / `E` | 历史后退 / 前进 | 全局；`canGoBack` 为假时是空操作（深链接进来不会白屏） |
| `PageUp` / `PageDown` | 上一页 / 下一页 | 列表翻页；文章 / 关于页是整屏滚动 |
| `J` | 跳页 | 列表：打开跳页框，输页码回车 |
| `G` | 聚焦分组行 / 分组·标签芯片 | 列表 / 文章详情 |
| `T` | 聚焦标签行 | 列表 |
| `L` | 聚焦点赞·评论栏 | 文章详情 |
| `U` | 回到文章顶部 | 文章详情 |

两条实现细节别改错：

- **单字符键必须归一化小写**（`e.key.length === 1 ? e.key.toLowerCase() : e.key`），
  否则大写锁定或 `Shift` 组合会静默失效。
- `Shift+Tab` 要在 `keydown` 里特判（`e.key === 'Tab' && e.shiftKey`），
  它和 `Tab` 是同一个 `key`。

「一屏一焦点分区」由各场景自己维护（列表：`0` 分组行 / `1` 标签行 / `2` 卡片栅格；
文章：`chips` / `actions` / `none`），`G` / `T` / `L` 就是这些分区的直达键。

### 11.3 列表状态进 URL（`?group=&tag=&page=`）

- `page` 是 **1 起**，第 1 页**不写参数**（`/posts` 而不是 `/posts?page=1`）。
- 换筛选 / 换页只改 query，**场景帧不变**；`present()` 对同一帧直接返回，
  所以屏幕不转场、焦点不丢，也没有多余动画。
- `goPosts()` 只重写 `group` / `tag` / `page`，其余 query 原样保留 ——
  否则在列表里一翻页 `?demo=1` 就掉了，刷新即变回真数据源。
- 跳页的收敛规则写死在 `submitJump()`：非数字忽略并抖一下，超过总页数收敛到最后一页。
  页码越界（改 URL、换每页条数、筛选后条数变少）由 `watch` 收敛回地址栏，不留「第 3 页 / 共 2 页」。

### 11.4 文章详情的两处「链接化」

- **分组与标签是链接**，不是装饰文字：芯片点一下（或 `G` 聚焦后回车）跳到
  `/posts?group=…` / `/posts?tag=…`。这是用户第 7 条的原话要求。
- **返回列表优先走历史**（`goBackOrPosts()`）：从列表点进来就 `back()`（保留筛选与页码）；
  直接从地址栏打开文章（没有上一页）时退到列表页，否则键盘用户会卡死在详情页。

### 11.5 这一轮的方法论教训

- **换骨架之后第一件事是看控制台**。`setRouteResolver` 被误传成 `resolveRouteFrame` 自己，
  解析函数自我递归，全站白屏（`RangeError: Maximum call stack size exceeded`）——
  画面全白时先从控制台拿栈，比盯页面快得多。
- **第 4 轮的坑会以新形态回来**：那一轮是「焦点 + 粗边框」冲突，这一轮是「已选中芯片 + 焦点」冲突
  （两条规则权重相同，后写的压掉先写的，键盘用户看不到焦点在哪）。
  修法不是调一处颜色，而是**把它写进焦点门**：已选中项被聚焦时底色必须变化。
- **用例会过期，产品不一定有缺陷**：第 5 轮接上路由后，「减动效」用例仍假设「刷新回主页」，
  而刷新停在原地址恰恰是新行为。区别「用例过期」与「真回归」的证据是**控制台 + URL**，不是猜测。
- **可见性是两个轴**：列表筛选条用 `overflow-x: auto` 换取「绝不多占一行高度」，
  而 `ensureFocusedVisible` 当时只量纵向 —— 样张只有 9 个标签、不溢出，所以样机自测全绿；
  换成真实数据（14 个标签、`scrollWidth` 1802 > `clientWidth` 1358）立刻暴露。
  → 交给自己量就容易只量一半，交给 `scrollIntoView({ block: 'nearest', inline: 'nearest' })`
  反而更省心：它逐层处理可滚动祖先，且已可见时是空操作。
- **同一份数据源要覆盖到**：这条缺陷只在真实数据下出现、在样张下消失，
  所以门里现在**两种数据源都跑**（样张验形态，真实数据验溢出与边界）。

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

### 10.2 输入路由：焦点分区

`pad.ts` 是**输入层**，不只是键位表。它持有一条路由规则：

- `activeScope`：`scene` / `pause`——模态弹窗打开时内容层收不到按键。
- `focusZone`：`content` / `tabs`——焦点在标签栏时，`scene` 作用域的监听器被跳过。
  （没有这条规则，同一个方向键会既切标签又移动列表光标。）
- 消费语义：handler 返回 `true` 才算被消费，**只有被消费才 `preventDefault`**，没接管的键还给浏览器。
- `ensureFocusedVisible()`：焦点是自绘的（class，不是 DOM focus），浏览器不会帮忙滚动；
  每次按键被消费后用 `requestAnimationFrame` 检查 `.is-focused` 是否在 `.screen-inner` 视野内，不在才 `scrollIntoView({ block: 'nearest' })`。

键位（正式版沿用）：

| 键 | 动作 | 备注 |
|----|------|------|
| `↑↓←→` / `WASD` | 移动焦点 | 栅格用**视觉相邻**语义（见 10.3） |
| `Enter` / `Space` / `Z` | 确认 | |
| `Esc` / `Backspace` / `X` | 返回 / 关闭 | |
| `P` | 菜单 | 全局键，任何场景可呼出 |
| `PageUp` / `PageDown` | 上一页 / 下一页 | 列表翻页；文章页是整屏滚动 |
| `Q` / `E` | 上一个 / 下一个标签页 | 全局键，保证键盘一定能到达标签栏 |
| `Tab` | 原生 | 不劫持；表单与实体按钮仍可走浏览器默认焦点链 |

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

### 10.9 这一轮的方法论教训

三条真实缺陷（列表卡片被裁、主页被切、每页 8 条溢出）在截图里**全都"看起来正常"**，
是量了 `clientHeight` / `scrollHeight` / `getBoundingClientRect()` 才发现的。

**结论**：验收不许只靠看图。凡是"放得下 / 对齐 / 不溢出"这类判断，必须给出数值断言或像素级差异断言。

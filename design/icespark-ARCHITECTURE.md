# icespark 独立前端 · 技术选型与架构（已定稿）

> 这份文档是**决定记录**，也是后续开发的**可执行约束**。
> 第 3 节里的每一条都会落成 `scripts/` 下的脚本和 `e2e/` 下的用例，不是建议。
>
> 状态：**P0 骨架 + P1 设计系统已落地**（`icespark/` 独立 app · 构建 / 类型检查 / 六段门 / e2e 全绿，
> 见 §13、§14）；P2 交互内核起进入真实页面开发。`design/icespark-prototype/` 仍留作视觉与交互的参考实现。

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
├── tsconfig.json                 # 引用 app / node / e2e / vitest 四个子配置
├── vite.config.ts                # alias · /api 代理 · 构建期生成 token CSS 与字体/站点配置备料
├── eslint.config.ts / .oxlintrc.json / .prettierrc.json
├── playwright.config.ts / vitest.config.ts
├── public/
│   ├── site.config.example.json  # 模板（入库）；site.config.json 由脚本生成、gitignore、可手改
│   ├── robots.txt                # P7
│   ├── sitemap.xml               # P7
│   └── fonts/                    # 像素字体（脚本备好，不入库；子集化在 P7）
├── scripts/
│   ├── lib/openapi.mjs           # 取契约 + 生成类型（两个脚本共用）
│   ├── gen-api-types.mjs         # openapi.json → src/api/schema.d.ts
│   ├── check-api-drift.mjs       # 契约漂移门
│   ├── gen-tokens-css.mjs        # tokens.ts → tokens.generated.css（含 --check 漂移模式）
│   ├── ensure-font.mjs           # 备好像素字体（不入库）
│   ├── ensure-site-config.mjs    # 从 example 生成可手改的 public/site.config.json
│   └── check-independence.mjs    # 零外部 import 门（含 --selftest）
├── e2e/
│   ├── skeleton.spec.ts          # 骨架：真 URL / 后退键 / 404 兜底 / 无 JS 报错
│   ├── palette.spec.ts           # 配色门：var() 可解析 / 边框真画出来 / 无写死色值 / 字体真加载
│   ├── parity-keyboard.spec.ts   # P2 起：纯键盘旅程
│   ├── parity-mouse.spec.ts      # P2 起：纯鼠标旅程
│   └── a11y.spec.ts              # P2 起：axe-core 扫描
└── src/
    ├── main.ts
    ├── api/                      # schema.d.ts(生成) + client.ts + posts/comments/search…
    ├── config/                   # 站点配置三级合并 + 默认文案
    ├── router/                   # URL 是唯一真相来源
    ├── input/                    # pad.ts · focus.ts · scopes.ts —— 挂外壳根节点
    ├── scene/                    # 转场表现层（订阅 router，不再自己管导航）
    ├── styles/                   # tokens.ts(源) · tokens.generated.css(产物) · pixel.css · crt.css
    ├── machine/                  # M 层：状态行 · 对话框 · 菜单 · 开机 · 404 · 加载
    ├── frame/                    # F 层：卡片 · 列表 · 分页 · 标签 · 表单框架
    ├── signal/                   # S 层：正文 · 代码 · 图片 · 评论正文 · 编辑器容器
    ├── stores/                   # pinia：站点配置（已落地）· 文章 · 评论 · 账号
    └── views/                    # 路由级页面，组合上面四层
```

生成物 `src/api/schema.d.ts` 与 `src/styles/tokens.generated.css` **入库并进 review**：
两者的漂移门都是逐字节比对，手改必失败；`.prettierignore` 已把它们排除（格式由生成器负责）。

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
| **P0 骨架** ✅ | — | 独立性门 / 契约漂移门 / lint / vue-tsc / e2e 跑通（**已落地**，见 §13） |
| **P1 设计系统** ✅ | — | tokens 构建期生成、pixel.css、CRT、字体、M/F/S 分层规则（**已落地**，见 §14；字体子集化挪到 P7，理由见 §14.5） |
| **P2 交互内核** ✅ | — | 手柄层 + 共享焦点 + 作用域、场景转场、对话框、菜单（**已落地**，见 §15） |
| **P3 公开阅读** ✅ | HomeView 559 · PostListView 1373 · PostDetailView 1499 · About 286 · Links 288 · 404 460 | 路由化 + markdown-it 渲染正文（**已落地**，见 §17；404 尾巴见 §19） |
| **P4 搜索与档案** ✅ | SearchResultsView 1167 · UserProfileView 554 | 含 `/api/search/suggest`（**已落地**，见 §20 + §21）。搜索按用户裁定不建独立页，能力留在菜单弹窗内，故无 `/search` 路由 |
| **P5 账号与管理** ✅ | LoginView 526 · ProfileView 2256 | 登录/注册、个人设置、站点设置、外链管理、审计日志（**已落地**，见 §23 + §24）。登录按用户裁定用外壳弹窗，不建 `/login`；ProfileView 的四个 tab 拆成 `/profile` · `/admin/site` · `/admin/links` · `/admin/audit` 四张独立页 |
| **P6 写作** ✅ | PostEditView 2769 · MilkdownEditor 796 | **已落地**，见 §28（提案 + 裁决）与 **§28.9（交付记录）**。样机没有写作页，按硬要求 4 先出提案、用户逐条裁决（D1～D10）再动手；编辑器按 D2/D3 选 **E2 源码 + 实时预览**，没有装 `@milkdown/*` |
| **P7 收尾** ⬜ | — | **未开工**：字体子集化（§14.5）、highlight.js + DOMPurify `span` 白名单、meta / JSON-LD / sitemap、axe 审计、预渲染、性能预算门 |

覆盖率口径：旧前端 11 个视图（`frontend/src/views/`）**全部有着落** —— 10 个已迁移或按用户裁定换形态落地（SearchResultsView → 菜单弹窗、LoginView → 外壳弹窗），最后一个是 `PostEditView`，P6 以 E2 形态（源码 + 实时预览）落地到 `WriteView.vue`，旧 `MilkdownEditor.vue` 按裁决不迁（编辑器形态由用户选 E2）。icespark 现有 12 个视图共 11,015 行。

---

## 6. 三个风险点

1. **总量**：11 个视图、约 14,000 行 UI，不是几轮能完的。按阶段交付，每阶段都能跑起来。
2. **编辑器是最大风险项**：旧 `PostEditView` 2769 行 + `MilkdownEditor` 796 行，还叠着上传、草稿、图片插入。
   milkdown 的样式很硬（旧代码靠 `background: transparent !important` 压它），在像素皮里会更难缠。
   → **已化解**：P6 由用户裁决走 E2（Markdown 源码 + 实时预览），`@milkdown/*` 一个没装，
   风险从「样式对抗 + 新依赖」变成「自己写一个 496 行的编辑器容器」（见 §28.9）。
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
- **开发端口 5175**：5173 是样机、5174 被同机别的项目占着（本轮实测），所以 icespark 固定在 5175。
  等它接管线上服务时，AGENTS.md 第 2、3 节的目录表与端口表要一并更新（那时才不只是"另起一个 app"）。
- **history 模式要配 SPA 回退**：这是本轮的第二个决定（用户选的方案 A）。
  真 URL 换来的是「刷新 `/post/xxx` 必须由部署端回退到 `index.html` 而不是 404」。
  仓库不含部署配置，所以这条要求写在三处：`vite.config.ts` 注释、`router/index.ts` 注释、本节。
  `e2e/skeleton.spec.ts` 里有一条用例专门验「dev 下深链不白屏」，线上回退失效时它是第一道提示。

---

## 9. 起手顺序

**P0 + P1 先做**：骨架、三道门（独立性 / 契约漂移 / 配色）、设计系统，
跑通 `dev` / `build` / `type-check` / `e2e`，再进 P2。

实际起手（用户定的口径）：**P0 只做最小集** —— 骨架 + 独立性门 + 契约漂移门 + 一组骨架 e2e，
**设计系统与配色门留到 P1**。理由是先让"独立"这件事可验证，再谈好看；配色门离开真实样式表也无从验起。

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
- **第六轮补**：同一个视觉也接原生 `:focus-visible`（写成 `.focusable:is(.is-focused, :focus-visible)`）。
  文章详情页的 Tab 交给浏览器之后，原生焦点必须看得见，否则就是「看不见的焦点、回车却能触发」。
  用 `:is()` 而不是复制一份样式，是为了让「全站只允许一套焦点视觉」这条规则继续成立。

### 10.5 图片容器：像素画框

`ImageFrame`：硬边 3px + 内凹立体边，画框上叠一层 3px 抖动网点。
装饰层挂在**外层容器**上而不是 `<img>` 上（`<img>` 是替换元素，挂不上 `::after`）。
~~无封面时用同尺寸抖动占位块~~ → ~~第六轮改为「空画框」记号~~ → **第七轮：没有图就整个容器都不渲染**
（无封面改走另一套排版，见 §12.3）。

**关键纪律**：混排时**同一行内的卡片高度必须一致**。第七轮前的做法是「让封面区尺寸是常量」
（固定 `flex-basis` + 固定宽高比），于是无封面也必须摆一个同样大的占位块；
第七轮改成**两套排版、外框同高** —— 列表页 2 列栅格的行会按最高卡片拉伸，
只要两套排版的**内容高度都被撑满**（文字卡正文 `flex: 1` + 与卡等高的数据脊），行内自然齐平，
不再需要「无封面也占一块图位」这条约束。

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
- ~~登录成功后暂停菜单才会多出「编辑文章」一行~~ → **第六轮起**：登录后多出「编辑文章 / 个人信息编辑」
  两个真链接，`is_superuser` 再多一条「站点管理」（见 §12.1）。

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
| `Tab` / `Shift+Tab` | 有标签栏的页面：下一个 / 上一个标签页；文章详情页：**交还浏览器**，按 DOM 顺序遍历页面内链接 | **第六轮改**（见 §12.2）：无标签栏的页面不再「消费但不动作」，而是返回 `false` 把按键让给浏览器；输入框内保留原生 Tab；转场遮罩期间吞掉，避免原生焦点悄悄移位 |
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

---

## 12. 样机第六轮：菜单入口收口、原生 Tab 与无封面策略（新增）

### 12.1 菜单：导航行删掉，登录后换成真链接

行序（`ui/PauseMenu.vue`）：

| 状态 | 行数 | 行 |
|------|------|----|
| 未登录 | 6 | 继续 / 搜索文章 / 音效 / 登录 / 设置 / 返回主菜单 |
| 已登录 | 8 | 同上，但第 4 行是「退出登录（昵称）」，并多出 **编辑文章** / **个人信息编辑** |
| 超管（`is_superuser`） | 9 | 再多一条 **站点管理** |

三条链接的 `href` 是**正式版契约**（沿用旧版 `frontend/src/router/index.ts` 的路径）：

| 行 | 路径 | 旧版出处 |
|----|------|----------|
| 编辑文章 | `/write` | `PostEdit`（`requiresAuth: true`） |
| 个人信息编辑 | `/profile?tab=settings` | `ProfileView` 的「设置」tab |
| 站点管理 | `/profile?tab=siteConfig` | `ProfileView` 的「站点设置」tab（仅业务库超管可见） |

- 渲染成真 `<a href>`（不是 button）：可复制链接、可中键开新标签、Tab 顺序天然正确。
  点它的时候 `@click.prevent` 拦下默认跳转 —— 样机没有这三张页面，
  真跳过去会命中 catch-all 变成首页，看着像坏了，所以只给一句「正式版路径 …」。
- **前进 / 后退两行已删除**。历史前进后退是**全站能力**（`Q` / `E`、`X` / `Backspace`、浏览器按钮），
  菜单里再摆两行只是重复入口；`Q` / `E` 在菜单开着时依然生效（菜单不再拦这两个键）。
- `is_superuser` 只认 `GET /api/auth/me` 的返回值，**不在前端自己猜**；
  刷新后由 `bootstrapAuth()` 静默回填，所以「站点管理」不会在一刷新后消失。

### 12.2 原生 Tab 与自绘焦点共存（本轮最容易出事的地方）

文章详情页的 `Tab` 从「消费但不动作」改为**放手**（`App.vue` 的 `tabNext/tabPrev` 在 `!onTabScene` 时 `return false`）。
理由：浏览器原生 Tab 就是「按 DOM 顺序遍历可聚焦元素」，`Shift+Tab` 反向、自动滚进视野、回车自动激活——全部免费且不会写错。
样机实测的落点顺序是：**分组芯片 → 标签芯片 → 点赞 → 评论 → 返回列表 → 正文链接**（与 DOM 顺序严格一致）。

要点：

1. **可见性必须补上**：`.focusable` 里有 `outline: none`（为自绘焦点准备的），
   原生焦点进来若不画出来，就是「看不见的焦点、回车却能触发」。所以把 `:focus-visible` 并进唯一那套视觉
   （`pixel.css` 用 `.focusable:is(.is-focused, :focus-visible)` 写；`data-motion=off` 与
   `prefers-reduced-motion` 两个分支同步覆盖）。
2. **正文链接挂 `.focusable`**：由 `MarkdownBody` 的 `link_open` 规则加类
   （`link_open` 默认没有渲染规则，要调 `self.renderToken`）。
3. **一次按键只走一层**（`ArticleScene.vue` 的两条规矩）：
   - 原生焦点在本文档内时，`confirm` **直接放手**给浏览器（`nativeFocusInside()`）——
     否则浏览器激活一次、我们的 `confirm` 分支再激活一次，一次回车跳两条历史。
   - 反过来，只要是我们自己的焦点在动（方向键 / `G` / `L` / 鼠标划过），就 `blur()` 掉原生焦点，
     保证同一时刻屏幕上只有一个光标。
4. **验收方式**：round6 不比「看起来对不对」，而是逐项比对落点序列、`el.matches(':focus-visible')`、
   以及 **`history.length` 只加 1**；再用 `performance.getEntriesByType('navigation').length === 1`
   证明站内跳转没有整页刷新。

### 12.3 无封面：不占图片位，换一套排版

这一节记的是**同一件事被否了两次**的过程，因为它值得记。

| 方案 | 做法 | 结局 |
|------|------|------|
| 抖动马赛克块 | 与真封面同尺寸的棋盘格占位 | 第六轮被否：「太丑」—— 与真封面并排时像图挂了 |
| 空画框记号 | 外框 + 方块太阳 + 地平线，全 CSS 方块（硬边、圆角恒 0、纯蓝色阶） | 第六轮交付，**第七轮仍被否**：语义清楚，但它**仍然是一个空的图片位** |
| 放大标题首字做水印 | 拿标题第一个字当图形 | 更早放弃：`ArkPixel` 是按 12px 设计的点阵字体，放大到 94px 笔画被拉开、灰度抗锯齿一糊就是两团碎块 |
| **不占图片位，换一套排版** | 有封面卡左图右文；无封面卡一张图的位置都不留 | 第七轮定稿 |

**问题出在哪**：前两个方案都在优化「图片位里放什么」，而用户要的是**不要这个位置**。
只要空图位还在，卡片就永远是「缺了一半」——不管这个位置里画的是马赛克、画框还是水印。

**两套排版（不是两套皮肤）**：

- 列表页（2 列栅格，卡片约 673×239）
  - 有封面：左封面 320×213（3:2）+ 右文字栏，页脚摆日期 / 阅读 / 点赞。
  - 无封面：**右侧立一条与卡片等高的「数据脊」**（`justify-content: space-between`：月 / 年 + 大号日号 顶格，
    阅读与点赞贴底，左缘一条 4px `--blue-300` 竖线），正文栏因此收窄、标题放大到 24px、简介放宽到 5 行；
    页脚不再重复摆日期 / 阅读 / 点赞（它们已经在数据脊里），只留作者 + 分组。
  - 关键：日期不是「一行小字」，而是**字形**（`09 / 2026` 小字在上、`18` 走 `px-48` 档位的点阵数字）——
    它填补的是右栏的纵向空间，不是在文字里插一行。
    日号必须落在像素字体允许的字号上：`ArkPixel` 是按 12px 设计的，非 12 倍数会发虚，
    所以走现成的 `px-48 px-display` 档位（48 = 12 × 4），而不是自己写一个「刚好合适」的 46px；
    `px-display` 同时锁掉字距与行高（拉伸会破坏点阵网格）。实测落点 48×48、无溢出。
- 首页小卡（4 列栅格，卡片约 331×259）
  - 有封面：`21 / 9` 缩略图在上。
  - 无封面：顶部横一条**「分组 / 日期」头**（左分组、右 `YYYY.MM.DD`，下面压 2px 细线，与页面里其它标题行同一套语言），
    正文栏 `flex: 1` 吃掉剩下的高度，标题 18px / 简介放 6 行。页脚去掉重复的日期与分组标签。

**两条硬规则（第七轮第二轮反馈换来的）**：

1. **卡片标题一律不截断**。标题是这张卡存在的理由，字被吃掉比卡片高一点更糟：
   - 标题 `flex: 0 0 auto`（不参与收缩）+ 不用 `-webkit-line-clamp`（不按行数截断）+ `overflow-wrap: break-word`；
   - 空间不够时**收缩的是摘要**——摘要有 `line-clamp`，会在末尾补省略号，那是**有意的截断**，
     和「标题被悄悄吃掉」不是一回事；
   - 卡片按需要长高，同一行由栅格拉伸对齐，所以「某张卡变高」不会把栅格弄乱，只是那一行整体变高。
   - 反例记录：改成「不截断」之前，标题按 3 行截断。列一宽没事，**列一窄就换到 4–6 行**，
     多出来的行直接被吞掉；另有一些宽度下标题盒子比内容矮 2px，最后一行字的下缘被切——
     后者才是用户说的「个别文字被隐藏」。
2. **栅格本身不能既会压行、又会比内容矮**，这是同一件事的两个面：
   - `grid-auto-rows` 必须是 `max-content`，不能是 `auto`：`auto` 轨道在「内容装不下栅格高度」时
     会被压到可用高度（条目的自动最小尺寸因为 `min-height: 0` / `overflow: hidden` 是 0），
     卡片里的字被 `overflow: hidden` 切掉。
   - `.grid` 自己必须是 `flex: 0 0 auto`，不能是 `flex: 1` + `min-height: 0`：
     后者在内容比可用高度高时**盒子会比内容矮**，超出的卡片就画到下一个兄弟（翻页条）上面去。
     不伸缩也不收缩之后，多出来的高度交给 `.foot` 的 `margin-top: auto`（翻页条贴底），
     装不下就让整页滚。
   - 两条合起来的验收是**几何断言**：980 / 900 / 820 / 760 / 600 五个宽度下
     `卡片内容底 ≤ 翻页条顶`，并且 `栅格盒高 === 栅格内容高`。

**判断口径收口到 `ui/cover.ts`**：

- `coverOk(url)` = 字段**有值** 且 **没有加载失败过**。只看字段是不够的：上传文件 404 时字段是满的、图是空的，
  只看字段就会渲染出一个坏图框。
- `markCoverFailed(url)` 由 `ImageFrame` 的 `@error` 触发，失败集合是**模块级**的
  （同一条坏链接不必每个组件各失败一次），下一次渲染就自动换版式。
- 列表页 / 首页 / 文章页三处共用，同一条数据不会在不同页面上变成两种形态。
- 同一个文件里还放了 `stampParts(iso)`：把 `2026.09.18` 拆成 `{y, m, d}` 给数据脊用。

**验收怎么量**（`e2e/round6.mjs` 第 ④ 段）：不看截图，而是断言
① `.card.is-text` 里**没有** `.card-cover` / `.img-frame`；② 旧占位记号（`.img-ph-box` / `.img-ph-glyph`）计数为 0；
③ 每张文字卡都有 `.card-side` 且其高度 ≥ 卡片高度的 70%（实测 175/239）、标题 ≥ 20px（实测 24px）；
④ 有封面卡**没有** `.card-side`（两套排版互斥，不是叠加）；⑤ 按 `top` 分组后**每行高度集合 size === 1**
（实测 `239@209 239@209 239@460 239@460`）；⑥ 首页一行三张等高；
⑦ **1440 / 1280 / 1100 / 980 四个宽度下，每张卡的标题 `scrollHeight - clientHeight ≤ 1px`**
（实测四个宽度都是 1px 的取整误差），并附带一条「这条最长标题在 980 下确实排到 6 行 / 67 字」的空转检查。

⑦ 用的夹具是**样张数据**（`src/data/api.ts` 里的 `d7` 无封面 67 字长标题、`d8` 有封面上限更长），
不是真实库——真实库是可变的，拿它当夹具一定会出现「数据一改、用例就假失败」。
（这一轮真的踩到了：`smoke.mjs` 的「markdown 渲染出表格」原来挂在真实库第一篇上，
补完真实数据后第一篇换成新内容、没有表格，于是假失败。表格改用样张夹具断言。）

**第一版文字卡也不是一次成型**：初版用 40px 大间距撑高度、日期塞在左侧 118px 宽的栏里只有 96px 内容，
被 modlens 判为「lower half 大块空白」。改成「正文在左 + 与卡等高的右数据脊」后复判为
「deliberate, well-composed text card… 不像一个破洞」。

### 12.4 样张封面本地化

`?demo=1` 的两张封面从 `picsum.photos` 外链换成 `public/demo-cover-a|b.png`（16×9 像素图，各约 140 字节）：

- 评审环境可能没有外网，外链一挂六张卡片全是占位图 —— 恰恰把「有封面 / 无封面混排」这个最该看的形态弄没了；
- 断网时 `img` 报错会往控制台写 `ERR_CONNECTION_CLOSED`，混淆真正的 JS 错误（门里有「运行期无 JS 报错」这一条）。
- 小图 + 画框自带 `image-rendering: pixelated`，放大后是 8bit 方颗粒，比外链照片更贴这套语言。

真实库同理：`scripts/seed-live-posts.py` 现画 4 张像素封面 → `POST /api/upload/image` → `POST /api/posts/`，
补 6 篇（4 篇有封面、2 篇刻意没有，其中一条标题 67 字）。**脚本可重复执行**：标题已存在就跳过、
一件都不用做时连图都不上传。真实数据不进仓库（在业务库里），进仓库的是这个「怎么再造一份」的脚本。

### 12.5 设置项收口

「设置」任何登录状态都能进（用户确认「设置依然保留」），但内容**只放影响展示效果的项**：
音效 / 每页条数 / 动效。原来那条「数据来源」是**信息展示**、不是设置，已移出。
以后有新设置项（仍然要求「影响展示」）再往这里加。
`e2e/round6.mjs` 用 `data-testid` **序列相等**来断言这件事，避免「多一行少一行也算过」。

### 12.6 本轮的方法论教训

- **别按行数定位菜单**：三套脚本原来都用 `ArrowDown × N` 数到目标行，菜单一删两行就全部走错位
  （门里那条「动效开关」直接假失败）。改成按 `data-row` 找行后，菜单增删都不影响用例。
  这是**用例过期**，不是产品缺陷。
- **引入第二套焦点体系时，先想清楚「谁让位」**：原生焦点与自绘焦点同时存在时，
  必须有明确的规则说清「谁在什么时候放手、谁在什么时候收掉对方」，否则一定会出现双高亮或双触发。
  本轮把这两条规则写在代码注释里，并各自配了一条数值断言。
- **失败的设计方案也要写进文档**（放大字水印、马赛克占位、空画框）：它们是「看起来能行」的方案，
  记录下失败原因，比只留一个最终结果更有用。空画框这条尤其值得记 —— 它在前一轮是作为**修好**交付的，
  下一轮又被否；两次的差别是「把占位画得更好看」和「不要占位」，是**方向**不同，不是完成度不同。
- **同一个判断散落在三处，迟早会不一致**：封面可用性原来在列表页 / 首页 / 文章页各写一份，
  文章页还只看字段不看加载结果。收到 `ui/cover.ts` 一处之后，三页行为才第一次真正相同。
- **`<img>` 与容器的关系要早定**：装饰伪元素只能挂容器，而「容器要不要渲染」直接决定了
  「无图」在 DOM 里是「一个空节点」还是「没有节点」——后者才能让样式和断言都干净。

---

## 13. P0 落地记录（新增）

用户定的两条起手口径：**只做骨架 + 两道门**（设计系统与配色门留到 P1）；路由用 **history 模式 + 部署端 SPA 回退**。

### 13.1 落地了什么

```
icespark/
├── package.json                  # 独立 app：2 运行时 + 17 开发依赖，全部精确锁版本
├── tsconfig{,.app,.node,.e2e}.json · vite.config.ts · eslint.config.ts · .oxlintrc.json
├── playwright.config.ts · index.html · env.d.ts · .env.example · .prettierignore
├── scripts/
│   ├── lib/openapi.mjs           # 取契约 + 生成类型（两个脚本共用）
│   ├── gen-api-types.mjs         # openapi.json → src/api/schema.d.ts
│   ├── check-api-drift.mjs       # 契约漂移门
│   └── check-independence.mjs    # 独立性门（含 --selftest）
├── e2e/skeleton.spec.ts          # 7 条骨架用例
└── src/
    ├── main.ts · App.vue
    ├── api/client.ts + schema.d.ts(生成)
    ├── router/{index,routes,types}.ts
    ├── scene/presenter.ts
    ├── styles/base.css
    └── views/{HomeView,NotFoundView}.vue
```

一句话：这一轮交付的是**能跑、能查、能挡的空壳**，刻意没有任何设计（`base.css` 里一个颜色值都没有，防止出现"先用后定"的散装色板）。

`scene/presenter.ts` 只有 50 行左右，不是把样机那 153 行搬了个位置，而是**职责被砍掉了**：
导航、历史、返回栈全部交给 vue-router，presenter 只剩「把 `meta.scene` 写到外壳根节点的 `data-scene` 上」这一件事。
约定 3 说的"降级"就是这个意思。

### 13.2 独立性门：九条规则 + 15 个自测用例

| 规则 | 挡住的 |
|---|---|
| `EXTERNAL_IMPORT` | 相对导入或 `@` 别名指到 `icespark/` 之外（偷偷 import 旧前端） |
| `FORBIDDEN_PACKAGE` | element-plus / prismjs / refractor / axios 等旧前端专有依赖 |
| `UNDECLARED_PACKAGE` | 用了没在 `package.json` 声明的包 |
| `UNAPPROVED_PACKAGE` | 声明了但不在架构选型白名单里 |
| `STATIC_EDITOR_IMPORT` | `@milkdown/*` 被静态 import（编辑器会混进阅读 bundle） |
| `LAYER_VIOLATION` | `signal/` 反向 import `machine/` |
| `STORAGE_KEY` | 存储键没带 `synthspark` 前缀 |
| `LEGACY_NAMING` | 废弃命名残留（与 AGENTS.md 第 1 节同一口径） |
| `APP_IS_NOT_STANDALONE` | 引 workspace / 包名不对 / 依赖指向仓库里别的目录（`file:../frontend`） |

三条口径值得记下来：

- **白名单是"预先批准"，不是"当前用到"**：pinia、markdown-it、highlight.js、`@milkdown/*`、playwright、vitest 现在就写进白名单，
  下一轮加依赖不必回头改门；反过来，只要出现白名单外的包就失败 —— 生态污染在第一天就堵住。
- **门自己要有自测**：`--selftest` 把 15 个反例/正例喂给同一套判定函数。
  **它第一次跑就抓到了门自己的 bug**：自测里的文件路径多拼了一层 `src/`，导致"逃出 icespark"这条反例反而不被判出来。
  一个永远打 PASS 的门比没有门更危险 —— 因为它会让人以为查过了。
- **已知边界写在脚本注释里**：存储键门只看字面量（`localStorage.setItem('x')`），
  常量传递的键靠 P2 的运行时门（枚举 localStorage）兜底，不假装自己全覆盖。

### 13.3 契约漂移门

实测契约：**63 paths / 89 operations / 50 schemas**，生成物 6179 行，`sha256:c0a63327…`。
生成物进仓库、进 review；指纹算在**规范化 JSON** 上，后端换序列化格式不会误报，任何一个字段变化都会变。

退出码分三档，对 CI 意义不同：`0` 一致 · `1` 漂移或生成物缺失 · `2` 拿不到契约（后端没跑 / 路径不对）。
把"后端没跑"和"契约变了"混成一个失败码，是这类门最常见的坏味道。

### 13.4 反例验证：门真的会响

本轮不只跑绿灯，还往真实树上注入了三次**故意**的错误，确认每条门各自会失败：

| 注入 | 门 | 结果 |
|---|---|---|
| 往 `schema.d.ts` 追加一行类型 | 契约漂移门 | `FAIL 第 6180 行起（行数 6181 → 6179）` |
| 在 `src/api/client.ts` 里 import `../../../frontend/src/api/http` | 独立性门 | `FAIL src 内零外部 import —— 1 处` |
| 在 e2e 用例里写 `const n: number = 'x'` | vue-tsc（含 `tsconfig.e2e.json`） | `error TS2322` |

三次注入后逐字节还原并复验绿灯。**只跑绿灯的门等于没门**：它证明不了"坏了会被发现"。

### 13.5 顺手定下的细节

- **e2e 从第一天就在**（7 条，连跑三次稳定）：验真 URL、后退键、404 兜底与回显原地址、表现层归属、正文可选中且整页无 canvas、`/api` 没被 SPA 回退吃掉、运行期无 JS 报错。
  其中一条写过一版**假断言**（"兜底页是懒加载 chunk"永远为真），已删 —— 骨架用例只留能失败的断言。
- **依赖口径**：全部 `--save-exact`，版本与仓库已有版本对齐（vue 3.5.41 / vite 7.3.6 / vue-tsc 3.3.9 / vue-router 5.2.0 / playwright 1.61.1）。
  `jiti`（eslint 读 TS 配置的硬需求）、`@types/node` 是实测缺了就跑不起来才补的，版本抄的旧前端。
- **`.prettierignore` 把生成物排除**，`format` 改成 `prettier --write .`：
  漂移门是逐字节比对，谁顺手 prettier 一下 `schema.d.ts`，门就会全红 —— 这类"工具互相打架"要提前掐掉。
- 端口 5175（5173 样机 / 5174 被同机别的项目占用），写在 §8。

### 13.6 没做的事（明确留给下一轮）

> 其中 P1 相关的几条已在下一轮完成，见 §14；本节保留当时的取舍记录，不改写历史。

- **P1 设计系统**：tokens.ts → tokens.generated.css（构建期生成）、像素字体子集、pixel.css / crt.css、`machine/` `frame/` `signal/` 三个目录与对应 lint 规则。
- **配色门 / parity / a11y**：都依赖真实样式与交互，跟 P1、P2 一起做；现在写只能是空转。
- **vitest**：本轮没有可单测的东西，装上就是摆设。
- **三个菜单链接的落点**（`/write`、`/profile?tab=settings`、`/profile?tab=siteConfig`）：查询参数还是独立路由，等 Profile 视图动工时再定。
- **调色板 A/B 终选**：仍挂在 `design/README.md` 的待定项里。

---

## 14. P1 落地记录：设计系统 + 外壳 + 配置层（新增）

P1 的名义范围是「设计系统」，但硬要求 2 / 3 / 5 一落地，就有三件事必须同时做到位：
**配置层**（页脚内容不能硬编码）、**外壳**（页脚刻在外框下边框内侧）、**配色参数化**（颜色只许出现在 tokens 里）。
所以本轮实际交付 = 设计系统 + 外壳 + 配置层。

### 14.1 用户在两处交互确认里定的口径

> **本节口径已被 §15.1 推翻，保留原文以记下当时怎么理解的。** 现在生效的是：
> 底栏就是样机的 `.deck`（在**外框下方**），站点小字在 `.deck` 里、位于软键**左侧**。

| 问题 | 用户决定 |
|---|---|
| 页脚状态行放哪 | **刻进外框下边框内侧，但不许加宽外框**；菜单键等软键在左边合适位置，页脚在右边，一行小字 |
| 状态行放什么 | **只放 `© 版权 · 口号 · 备案`**；传统页脚的多栏链接不做 |

「不加宽外框」这条直接决定了实现：状态行是屏幕内 **20px 高的一行 + 一条发丝线**，
外框仍是 3px 的像素边框（`palette.spec.ts` 用数值断言把它钉住，防止后来被"顺手加宽"）。
这条 3px 的断言与「配色只许写在 tokens.ts」在 P2 之后依然有效。

### 14.2 落地清单

```
src/styles/tokens.ts             # 配色方案表（PALETTES）+ 8px 网格 / 12 倍数像素字号 / 边框宽度 / 动效时长
src/styles/tokens.generated.css  # 构建期生成（入库、进 review）
src/styles/pixel.css             # 基础层：铁律、像素字体、立体边框、抖动、焦点、画框、动画原语
src/styles/crt.css               # 显像管质感：扫描线、荫罩点阵、桶形暗角、辉光、刷新抖动、开机亮线
src/config/{types,defaults,site}.ts   # 站点配置三级合并（内置默认 → site.config.json → 后台接口）
src/config/__tests__/site.spec.ts     # 10 条单测：合并语义 + 页脚分段
src/stores/site.ts               # 站点配置 store（pinia）
src/machine/StatusBar.vue        # 状态行（M 层机器质感组件）—— **P2 已删除**，见 §15.1
src/App.vue                      # 外壳：外框 + CRT + 场景出口 + 状态行
scripts/gen-tokens-css.mjs       # tokens.ts → CSS（含 --check 漂移模式）
scripts/ensure-font.mjs          # 备好像素字体（目标 → env → 样机定稿副本 → 下载）
scripts/ensure-site-config.mjs   # 从 example 生成可手改的 public/site.config.json
e2e/palette.spec.ts              # 配色门 4 条
```

### 14.3 配色参数化（硬要求 5）

- 颜色**只允许**出现在 `tokens.ts` 的 `PALETTES` 里；CSS 与组件一律 `var(--xxx)`。
  配色门第 3 条会扫所有样式表，出现 `#hex` / `rgb()` / `hsl()` 直接失败 —— 这条是**可执行**的约束，不是约定。
- 配色按「方案」参数化：`PALETTES` 是方案表，生成物按 `:root[data-theme='…']` 分组输出，
  `main.ts` 只写一次 `document.documentElement.dataset.theme`。
  **本轮不做主题切换**，但将来加主题 = 加一个同形状的键，组件一行都不用改。
- 刻度也进了 token（网格 / 像素字号 / 边框 / 动效时长）。像素字号只有 12/24/36/48/72 五档：
  非整数倍会让点阵字被重采样，字就发虚 —— 这是样机踩过的坑。

### 14.4 页脚状态行（硬要求 3）+ 配置层（硬要求 2）

- **状态行由外壳渲染**（`App.vue` → `StatusBar.vue`），所有场景都在（404、开机自检都在），
  各场景不许自己实现页脚，也不许写「要不要显示」的分支 —— 页脚与外框绑定。
- 页脚内容来自站点配置：`© 版权 · 口号 · 备案`，空字段整段省略（不留下孤零零的 ` · `）。
- **窄屏优先丢口号**：段是分开渲染的，`@media (max-width: 900px)` 只隐藏 slogan 段 ——
  版权与备案不能被省略号吃掉。
- 配置层三级合并的语义**照抄旧前端**：`null`/`undefined` 跳过、**数组整体替换**、
  嵌套对象深合并、基本类型含空串照覆盖；两层覆盖并行拉取、独立 3 秒超时、失败安静跳过。
  这套语义有 10 条单测钉住 —— 「管理员删掉一个导航项，却怎么都删不掉」就是数组没整体替换的后果。
- `public/site.config.json` **由脚本从 `site.config.example.json` 生成并 gitignore**（与旧前端同一套做法）：
  部署方能手改、能进 `dist/`、不需要 node 环境；少了它第 2 级就是空话，
  而且 `fetch('/site.config.json')` 会在控制台留一个 404（这条是实测撞到的）。

### 14.5 字体：本轮只做「备好」，子集化挪到 P7

样机用的是方舟像素字体 12px（756KB）。本轮把它备好并**断言真的加载了**（字体没加载会静默退回系统字体，
字形全变却看不出原因 —— 配色门第 4 条专门守这个），但**没有做子集化**，理由：

1. 像素字体在 icespark 里只承担 UI 外壳，正文走系统思源黑体 —— 但 UI 标签有一半来自**可编辑的站点配置**，
   字集不是固定的，现在切一刀，管理员改一个词就可能出现缺字回退；
2. 正确做法是 P7 拿「构建产物 + 站点配置默认值」反推字集，并断言每个 UI 字符都被覆盖 ——
   属于性能预算那一摊，跟预渲染一起做。

### 14.6 本轮的门与反例验证

`npm run check` 现在是六段：独立性门 → 配色漂移门 → 单测 → oxlint → eslint → 契约漂移门 → vue-tsc。

| 门 | 反例验证（注入后确认会失败） |
|---|---|
| 分层规则（eslint + 静态门） | `src/signal/x.ts` 里 `import '@/machine/StatusBar.vue'` → eslint 与独立性门**双双报错** |
| 配色门·无写死色值 | `StatusBar.vue` 里写 `color: #ff0000` → 该条失败 |
| 配色门·var() 必须可解析 | 从 `tokens.ts` 删掉 `--ink-faint` → 「每一个 var() 都能解析」失败 |
| 单测·合并语义 | 把「数组整体替换」改成逐元素拼接 → 对应用例失败 |

另有 11 条 e2e（骨架 7 + 配色 4）连跑稳定，以及一次**生产产物验证**：
`npm run build` 后用 `vite preview` 实测渲染、`data-scene`、状态行内容、字体加载、3px 边框、零 4xx。

顺带记一个环境坑：首次装 vitest 时 npm 10.9.8 的 arborist 崩在
`Cannot read properties of null (reading 'edgesOut')`，用 `npm install --legacy-peer-deps` 装过一次后
锁文件即稳定，`rm -rf node_modules && npm install` 实测可复现。

### 14.7 没做的事（留给 P2 起）

- **parity（纯键盘 / 纯鼠标）与 a11y 门**：P1 还没有可交互的东西，写了也是空转；P2 有了手柄层与焦点分区立刻补。
- **字体子集化**：见 §14.5，挪到 P7。
- **M/F/S 三个目录**：规则（eslint + 静态门）已生效，`machine/` 已有第一个组件；
  `frame/`、`signal/` 等 S 层、F 层组件真的出现时再建目录 —— 空目录 commit 进 git 没意义。
- ~~**`#app[data-scene]` 与外壳的关系**：转场表现层把 `data-scene` 写在挂载点 `#app` 上，
  外壳 `data-motion` / `data-scope` 写在 `.app` 上，两者是父子节点~~ —— **P2 已统一**：
  表现层只保留响应式真值，`data-scene` / `data-scene-seq` 由外壳自己绑在 `.app` 上（见 §15.3）。

---

## 15. P2 落地记录：交互内核 + 外壳纠正（新增）

### 15.1 我先把外壳做错了，用户当场纠正

P1 按 §14.1 的口径，把页脚做成了一条**自造的状态行**塞进 `.screen` 内部，并且整条丢掉了样机的 `.deck` 底栏；
P2 又把底栏里的「菜单 (P)」软键以「暂停菜单依赖的页面还没做」为理由省掉了。用户两次叫停，口径纠正为：

| 项 | 错的做法 | 用户口径（现在生效） |
|---|---|---|
| 外壳结构 | `.app` + `.screen`（页脚在框内） | **三段式照样机**：`.app` + `.screen` + **框下方 `.deck`**；框内底部还给场景自己的按键提示 |
| 底栏顺序 | 场景指示 / 软键 / 数据源 / 站点小字 | 场景指示 / **站点小字** / 软键 / 数据源（小字在软键**左侧**） |
| 软键 | 只剩「音效」 | **样机的两个都在**：「菜单 (P)」+「音效 ON/OFF」 |
| `.softkey:hover` | 按「无 hover」铁律删掉 | **照样机保留** —— 铁律里的「无 hover」只管列表/卡片的焦点模型，软键是外壳控件 |
| 淡色小字对比度 | 打算改成 `--blue-700` 达标 | **保持样机原色**（3.32:1 / 4.24:1 低于 AA，是已知取舍，写进 §15.5） |

教训写下来，比只改代码有用：**「样机没实现」不是删样机东西的理由**。
判断一个外壳元素要不要做，看的是它自己依赖什么 —— 菜单本体只依赖偏好存储与路由（今天就有），
依赖 P3–P6 页面的只是它内部的两三条行，而不是菜单本身。

### 15.2 落地清单（本轮新增）

```
src/scene/scenes.ts                 # 场景表（样机 SCENES 原样）：boot/home/posts/links/about/article
src/scene/transition.ts             # 整屏像素转场状态机（遮罩 / 锁输入 / 去重 / 结算）
src/scene/presenter.ts              # 场景真值 + 转场接线 + 换页重置输入状态（重写）
src/input/{scopes,pad,focus}.ts     # 输入内核：作用域 / 两趟派发 / 共享焦点
src/input/index.ts                  # 输入层挂到外壳根节点（不挂 window）
src/input/sfx.ts                    # WebAudio 方波音效（零资源）
src/config/prefs.ts                 # 音效 / 每页条数 / 动效 + synthspark-icespark-* 持久化
src/api/search.ts                   # 契约驱动的搜索（菜单内检索用）
src/machine/SoundPrompt.vue         # 首次音效询问（键鼠双路径的模态样本）
src/machine/PauseMenu.vue           # 暂停菜单（继续/搜索/音效/登录/设置/返回主菜单）
src/machine/SettingsDialog.vue      # 设置弹窗（音效 / 每页条数 / 动效）
src/App.vue                         # 外壳：外框 + CRT + 转场遮罩 + 底栏（重写）
src/input/__tests__/*.spec.ts       # 37 条单测：派发语义 / 焦点模型 / 作用域 / 偏好持久化
e2e/shell.spec.ts                   # 外壳保真门 6 条（防再次改掉样机外壳）
e2e/pause.spec.ts                   # 暂停菜单 5 条（键鼠双路径）
e2e/parity-keyboard.spec.ts         # 纯键盘门 3 条
e2e/parity-mouse.spec.ts            # 纯鼠标门 2 条
e2e/a11y.spec.ts                    # 无障碍门 4 条（axe-core/playwright）
```

### 15.3 输入内核：三件事说清就够

1. **按键语义与消费语义**：`resolvePadAction` 把事件转成动作（方向/WASD、A=Enter/Z/Space、B=Esc、P=START、
   Tab、Q/E、PgUp/PgDn、J/G/T/L/U）；监听器返回 `true` 才算「用掉」，**只有被用掉才 `preventDefault`** ——
   这正是「方向键被全局吞掉导致长文页键盘滚不动」那个真实缺陷的修法。
2. **两趟派发**：第一趟只给当前作用域（`scene` / `pause`），第二趟给 `any` 并带上 `consumed`。
   没有它就会出现「ESC 关掉菜单 → 全局监听立刻又打开菜单」这种同键双触发。
   `focusZone === 'tabs'` 时内容层收不到方向键（P3 的标签栏要用），`inputLocked` 期间只放行 START。
3. **共享焦点**：不做两套状态（键盘焦点 + 鼠标 hover），键盘与鼠标操作**同一个**下标；
   键盘移动出声、鼠标划过静音（划过不是离散事件）。方向键按**视觉相邻**走（`spatialIndex`），
   不是依次切换 —— 两列栅格里「右键跨行」是最容易写错的地方。

`data-scene` / `data-scene-seq` 现在由外壳绑在自己的根节点 `.app` 上（真值是表现层的响应式 ref），
不再像 P0 那样由表现层去 `document.querySelector` 写属性：一个外壳只有一个节点、一处真值。

### 15.4 转场：把样机的时序搬到 vue-router 上

样机自己换画面，所以能「遮罩盖上 → 120ms → 换内容」。生产版画面归 vue-router，于是时序改成
`beforeEach` 盖遮罩并锁输入（懒加载那段等待因此有 0 延迟反馈）→ `afterEach` 立刻解锁输入、
动画从头重播一遍盖在新内容上（`.trans` 用 `:key` 强制重建，否则导航比动画慢时遮罩会变成静态色块）→ 280ms 后撤掉。
导航被守卫拦下时安静收尾，不留遮罩。用户关掉动效（`.app[data-motion='off']`）时整段跳过，不是把动画时长设成 0。

### 15.5 本轮的六道门与反例验证

`npm run check` 六段之外，e2e 现有 **31 条**（骨架 7 · 配色 4 · 外壳 6 · 菜单 5 · 纯键盘 3 · 纯鼠标 2 · 无障碍 4）。

| 门 | 反例验证（注入后确认会失败） |
|---|---|
| 外壳保真 | 把 `.deck` 塞回 `.screen` 内 → 「底栏不在外框里」失败；删掉「菜单 (P)」软键 → 「两个软键都在」失败 |
| 纯键盘 | 在用例里加一次 `page.click()` → 「零鼠标事件」失败（键盘激活按钮产生的 `click` 不算鼠标，见下） |
| 纯鼠标 | 在用例里按一次键 → 「零键盘事件」失败 |
| 无障碍 | 去掉底栏的 `role="contentinfo"` → `region` 违规失败；把 `.hint` 换成写死色值 → 配色门失败 |
| 输入内核单测 | 把两趟派发改成只看第一趟 → 「consumed 传给 any 监听器」失败 |

两条容易误判、已写进注释的口径：

- **键盘激活按钮也会派发 `click`**：纯键盘门只把 `pointerdown` / `mousedown` 记为鼠标事件，
  否则「按回车确认」会被误判成动了鼠标。
- **axe 判不了屏幕外框内的文字**：CRT 扫描线是一层渐变，对比度检查只能归为 `incomplete`（需要人工看）。
  所以无障碍门实际守住的是框外内容，`a11y.spec.ts` 里显式断言这个盲区存在，
  避免以后误以为「axe 全绿 = 整页无障碍都过了」。
- **底栏淡色小字是用户确认保留的**：小字 3.32:1、数据源标记 4.24:1，低于 AA 的 4.5:1；
  门里**只对这四个已知节点**放行 `color-contrast`，任何新增的对比度问题照样拦下来。

### 15.6 没做的事（留给 P3 起）

- **暂停菜单里依赖页面的部分**：搜索命中后打开文章详情（P3）、登录行落到 `/login`（P5）、
  登录后才出现的三行真链接（写作 P6 / 个人信息 P5 / 站点管理 P5）、样机里的菜单内登录弹窗（P5）。
  行与文案都照样机摆好了，落点页面到位即通。
- **PauseMenu 里被替换的两处文案**：样机搜索空态那句「接口不可用时会退化为本地标题匹配」在生产版是假的
  （没有本地样张），改成「检索失败：后端接口不可用，稍后再试」。
- **开机自检场景（boot）**：场景表里已有 `boot`，但开机动画与自检画面（样机 BootScene + `signal/` 层）还没做；
  它**不是一条路由**，播完换成当前路由的场景。
- **顶部标签栏（TabBar）**：P3 随列表页一起，样式取自样机 `.tabbar`。

---

## 16. P3 迁移契约：样机页面 → 生产（并行迁移的唯一口径）

本节是**并行迁移时所有参与者的唯一接口口径**。凡是"多个文件要达成一致"的地方（目录归属、函数签名、
store 形状、组件 props、改写规则）都以本节为准；与本节冲突时先报告，不要各自决定。

### 16.1 目录与命名映射

| 样机 | 生产 | 层 / 说明 |
|---|---|---|
| `scenes/BootScene.vue` | `src/machine/BootScreen.vue` | M；**开机自检不是路由**，由外壳在 `booting` 期间渲染 |
| `scenes/HomeScene.vue` | `src/views/HomeView.vue` | 路由 `/`（`meta.scene: 'home'`） |
| `scenes/ArticleListScene.vue` | `src/views/PostListView.vue` | 路由 `/posts`（筛选与页码走 query） |
| `scenes/ArticleScene.vue` | `src/views/PostDetailView.vue` | 路由 `/post/:key` |
| `scenes/LinksScene.vue` | `src/views/LinksView.vue` | 路由 `/links` |
| `scenes/AboutScene.vue` | `src/views/AboutView.vue` | 路由 `/about` |
| `ui/SceneHead.vue` | `src/machine/SceneHead.vue` | M：机器铭牌（时钟 + 页面名 + 右侧插槽） |
| `ui/TabBar.vue` | `src/machine/TabBar.vue` | M：顶部标签栏 |
| `ui/PixelDialog.vue` | `src/machine/PixelDialog.vue` | M：通用像素对话框 |
| `ui/LoginDialog.vue` | `src/machine/LoginDialog.vue` | M：登录弹窗 |
| `ui/ImageFrame.vue` | `src/frame/ImageFrame.vue` | F：画框（`frame/` 首个组件） |
| `ui/MarkdownBody.vue` | `src/signal/MarkdownBody.vue` | S：正文渲染 |
| `ui/PixelAvatar.vue` | `src/signal/PixelAvatar.vue` | S：头像（canvas 降采样 + 量化） |
| `ui/cover.ts` | `src/scene/cover.ts` | 封面可用性（字段有值 ≠ 图出得来） |
| `ui/tabs.ts` | `src/scene/tabs.ts` | 标签页状态（当前页签由路由决定） |
| `ui/nav.ts` | `src/scene/nav.ts` | 导航助手（写 URL + 指定转场） |
| `ui/scene.ts`（滚动 / 时钟 / 开机） | `src/scene/screen.ts` · `src/scene/clock.ts` · `src/scene/boot.ts` | 拆三处 |
| `ui/pad.ts`（动效原语） | `src/signal/motion.ts` | S：打字机 / 计数滚动 |
| `data/api.ts` | `src/api/{types,posts,comments,links,groups,tags,stats,format}.ts` + `src/stores/content.ts` | 数据层 |
| `ui/auth.ts` | `src/stores/auth.ts` | 账号（P5 前置：登录弹窗要用） |
| `styles/tokens.ts` 的 `AVATAR_PALETTE` | `src/styles/tokens.ts` 的 `avatarPalette()` | 已在 P1 |

### 16.2 数据层（冻结接口）

- `src/stores/content.ts`：pinia setup store，id `content`。state 名与样机 `store` **同名同型**：
  `posts` / `total` / `stats` / `post` / `comments` / `groups` / `tags` / `links`；
  另加 `loading`（是否有请求在飞）与 `dataSource`（`'loading' | 'live' | 'demo'`）。
  actions：`loadPosts(limit = 24)` / `loadPost(key?)` / `loadStats()` / `loadGroups()` / `loadTags()` / `loadLinks()`。
- **唯一机械改写**：样机是裸 ref 对象（`store.posts.value`），pinia 实例上 `store.posts` 就是数组 ——
  场景代码里写 `store.posts`（去掉 `.value`），其余访问形状不变。
- 类型：`src/api/types.ts` 导出 `PostListItem` / `Post` / `Comment` / `Stats` / `Group` / `Tag` / `Link` / `SearchHit`。
  **字段以后端契约为准**（`src/api/schema.d.ts`），样机类型只是参照；契约里没有的字段不要凭空调用，
  对不上就在文件头注释里写清「契约叫 X，样机叫 Y」。
- 格式化：`src/api/format.ts` 导出 `shortDate(iso)` / `shortNum(n)` / `postKey({id, slug})`，行为与样机一致。
  （`postKey` 从 `src/api/search.ts` 挪到这里，只留一处。）
- **不迁移**：`forceDemo` / `?demo=1` / `DEMO_POSTS` / `DEMO_POST` / `DEMO_COMMENTS` / `DEMO_GROUPS` /
  `DEMO_TAGS` / `DEMO_LINKS` / `DEMO_STATS`（正式版没有样张）。
  `dataSource` 的三态名字保留，`demo` 的含义退化为**「接口没命中，页面按空数据渲染」**；
  **文案照样机一字不改**（`● LIVE` / `○ DEMO`、`LIVE DATA` / `DEMO DATA`）。

### 16.3 场景工具（冻结接口）

- `src/scene/screen.ts`：`screenScroller`（`Ref<HTMLElement | null>`）、
  `scrollScreenBy(deltaY): boolean`、`scrollScreenTo(top): boolean`、`scrollScreenTop(): void` —— 照搬样机 `ui/scene.ts`。
- `src/scene/clock.ts`：`useStatusBar(): { clock: Ref<string>; stop: () => void }`。
- `src/scene/boot.ts`：`booting: Ref<boolean>`、`finishBoot(skip = false): void`；
  `booting` 为真时外壳渲染 `BootScreen`（画面）而 URL 已经是真实路由 —— 深链先自检、再落到目标页。
  `skip` 的含义照搬样机：自检正常播完 → 直接落页（瞬时）；用户按键跳过 → 亮一下整屏闪白
  （调 `@/scene/transition` 的 `beginTransition('flash', 'boot-skip')` + `applyTransition()`，
  **不要** import router，也不要自己写 DOM/动画）。
- `src/scene/tabs.ts`：`TABS` / `TAB_IDS` / `activeTab` / `tabIndex` / `tabCursor` / `onTabScene` /
  `switchTab(id, t?)` / `cycleTab(dir)` / `focusTabs(i?)` / `moveTabCursor(dir)` / `blurTabs()`，
  并重导出 `focusZone`（来自 `@/input/scopes`）。当前页签**读路由名**，不自持状态。
- `src/scene/nav.ts`：`goTab(id, t = 'wipe')` / `goPosts(opts, t = 'none')` / `goArticle(key, t = 'flash')` /
  `goBackOrPosts()` / `canGoBack` / `canGoForward` / `syncHistoryFlags()`。
  转场一律走 `@/scene/transition` 的 `requestTransition()`，不要自己造动画。
- `src/signal/motion.ts`：`useTypewriter()` / `useCountUp()`（样机 `usePad` 文件里的两个原语，逐行照搬）。
- **场景一律用 `onPad(handler)`**（等同于 `scene` 作用域）；**不要迁 `usePad()`** ——
  外壳已经挂了唯一的键盘监听器（`@/input` 的 `mountInput`），再挂一个就是双触发。
- **不要迁** `useFocusList()` / 全局 `focusIndex`（P2 的共享焦点模型已替代，场景用 `useFocusGroup()` 与 `spatialIndex()`）、
  `playFocusMove()`（用 `playSfx('move')`）。

### 16.4 组件契约（props / emit / testid 一律不改）

| 组件 | props | emit |
|---|---|---|
| `SceneHead` | `{ title: string; clock: string }` + 默认插槽（右侧尾部） | — |
| `ImageFrame` | `{ src?: string \| null; alt?: string = ''; ratio?: string = '16 / 9' }` | `error`（图挂了） |
| `PixelAvatar` | `{ src?: string \| null; name: string; size?: number = 16; display?: number = 48; palette: string[] }` | — |
| `MarkdownBody` | 照样机（至少 `source`） | — |
| `PixelDialog` / `TabBar` / `LoginDialog` | 照样机 | 照样机 |

所有既有 `data-testid` **必须原名保留**（e2e 与后续验收依赖它们）。

### 16.5 迁移硬规则（违反即返工）

1. **视觉与交互 1:1**：模板结构、类名、scoped 样式**逐字照搬**。只允许两处机械改写：
   (a) 具体色值 → `var(--token)`（颜色只许出现在 `src/styles/tokens.ts`）；
   (b) `store.x.value` → `store.x`。
2. **不新增设计**：不增删按钮 / 行 / 字段 / 提示，不"优化"文案，不改间距与字号。
   若样机某处依赖生产版没有的东西，**停下来在报告里说明**，不要自己发明。
3. **中文注释**，关键判断写清「为什么」；样机注释里的踩坑记录（试过但没用的方案）要保留。
4. **只动分配给你的文件**。不要改：`src/App.vue`、`src/router/**`、`src/input/**`、
   `src/scene/presenter.ts`、`src/scene/transition.ts`、`package.json`、`src/styles/*`、别的参与者的文件。
5. **不要 `npm install`**（依赖已装好）；**不要跑全量 `npm run check` / `npm run test:e2e`**（会互相踩）。
   只跑：`npx prettier --write <你的文件>`、`npx eslint <你的文件> --fix`、
   `npx vue-tsc --noEmit -p tsconfig.app.json`（别人文件里的报错忽略，只修自己的）。
6. 只用 §16.2 / §16.3 冻结的接口；**不许 import 样机目录或旧前端**里的任何东西（独立性门会拦）。
7. 页面数据一律走内容 store，**不许留 mock 数组**。
8. 交付报告格式：改了哪些文件 / 与样机的逐条偏差（没有就写"无"）/ 阻塞与未解决项 / 跑过的命令与结果。

### 16.6 验收命令（由主线统一执行，参与者不必跑）

`npm run check`（独立性门 → 配色漂移门 → 单测 → oxlint → eslint → 契约漂移门 → vue-tsc）+
`npx playwright test`（骨架 7 · 配色 4 · 外壳 6 · 菜单 5 · 纯键盘 3 · 纯鼠标 2 · 无障碍 4 + 本轮新增页面用例）。

## 17. P3 落地记录：样机页面全量迁移（新增）

本轮把**样机已实现的每一个页面**搬到生产版，一次做完，并保留样机的视觉与交互口径。
分工：主线负责外壳 `src/App.vue`、路由、数据层与集成；页面/组件用互不重叠的文件集并行迁移
（规则见 §16.5，参与者不跑全量门，验收由主线统一执行）。

### 17.1 交付清单

| 层 | 文件 | 行数 | 来源（样机） |
|----|------|------|--------------|
| 数据 | `src/api/{types,format,posts,comments,groups,tags,links,stats,search}.ts` | — | 新写（接口按契约） |
| 状态 | `src/stores/content.ts` / `src/stores/auth.ts` | 189 / 172 | 新写（pinia） |
| 场景 | `src/scene/{screen,clock,boot,nav,tabs,cover}.ts` | — | `ui/{screen,clock,nav,tabs,cover}.ts` |
| 信号 | `src/signal/{MarkdownBody,PixelAvatar}.vue`、`src/signal/motion.ts` | 369 / 141 / — | `ui/MarkdownBody.vue`、`ui/PixelAvatar.vue`、`ui/motion.ts` |
| 框架 | `src/frame/ImageFrame.vue` | 58 | `ui/ImageFrame.vue` |
| 机器 | `src/machine/{SceneHead,TabBar,PixelDialog,LoginDialog,BootScreen,SettingsDialog,SoundPrompt,PauseMenu}.vue` | 44–662 | `ui/` 同名组件 |
| 页面 | `src/views/{Home,PostList,PostDetail,Links,About,NotFound}View.vue` | 223–1068 | `scenes/*Scene.vue` |
| 外壳 | `src/App.vue`（接线：自检、标签栏、全局键、账号引导、隐藏 `h1`） | 529 | `App.vue` |
| 门 | `e2e/pages.spec.ts`（11 条）+ `e2e/helpers.ts` | — | 新写 |

路由定稿：`/`（home）· `/posts`（posts）· `/post/:key`（article）· `/links`（links）· `/about`（about）·
`/:pathMatch(.*)*`（not-found，场景 `error`）。**标签页 = 路由名**，底栏场景指示与 URL 是同一份事实。

### 17.2 与样机的逐条偏差（全部是"生产版没有样机那个东西"导致，无一条是重新设计）

1. **点赞不做网络请求**：契约里 `Post` 没有 `like_count`（只有独立的 `PostWithLikeStatus`），
   所以详情页 `hearts = 0` —— 心形照旧可点、本地计数，只是不落库。等接口再定。
2. **外链没有说明字段**：契约 `ExternalLink` = `name/url/cover_image/sort_order/id/created_at/updated_at`，
   没有 `description`/`icon`，所以 `LinksView` 的 `.card-desc` 照样机渲染占位文字"（没有说明）"，
   **没有**本地扩类型硬塞字段。同时把引导句从"返回空时展示的是内置样张"改成"没有配置时这里是空的"
   （生产版没有样张，见 §16.2）。
3. **遮罩透明度：无偏差**（P3 收尾时改过一版）。样机里三处遮罩是三个不同的字面值
   （音效询问 0.30 / 暂停菜单 0.28 / 登录与设置 0.34），第一版图省事全写成 `var(--veil)`（0.30），
   等于悄悄改了两处颜色；现在三档各建一个 token：`--veil` / `--veil-soft` / `--veil-deep`，
   色值仍只写在 `tokens.ts`，运行期实测与样机逐位相同。
4. **DOMPurify 白名单层**：样机 `v-html` 直出 markdown，生产版过一层 DOMPurify
   （27 个标签 / 8 个属性）。**注意**：白名单里没有 `span`，将来接 highlight.js 时必须先加，
   否则代码高亮会被静默洗掉 —— 已写在 `MarkdownBody.vue` 顶部注释里。
5. **aria 增补（纯语义，零视觉）**：`PixelDialog` / `LoginDialog` / `SoundPrompt` 补
   `role="dialog"` + `aria-modal` + `aria-labelledby`（`pixel-dialog-title` / `login-dialog-title` /
   `sound-prompt-title`）；外壳 `<main>` 地标 + `.deck` `role="contentinfo"`（`NotFoundView` 根节点
   相应从 `<main>` 改成 `<div>`，避免两个地标）。
6. **外壳补一个视觉隐藏的 `h1`**（`.sr-heading`）：样机里只有文章页有 `h1`，其余页面名是机器铭牌
   span，axe 的 `page-has-heading-one` 会拦。补在**外壳**而不是逐页改样机 DOM（与第 5 条同一套做法）；
   文章页/404 自带 `h1`，外壳让位。副作用是首页/列表出现 h1 → h3 的跳级（样机卡片标题就是 `h3`），
   a11y 门把这一条记成已知取舍并**只**放行 `.post-title` / `.card-title` 节点（见 `e2e/a11y.spec.ts` 口径 3）。
   **用户已确认就这样保留**（2026-09-29：宁可多一条有说明的放行，也不动样机的页面结构）。
7. **`?demo=1` 死分支保留**：样机的样张开关不迁（§16.2），但 `MarkdownBody` 里那个分支**原样保留**
   并加注释说明它在生产版里永远走不到 —— 删掉会造成"与样机不一致"，留着才好逐个对照。
8. **`playSfx('cancel' as SfxKind)` 的 cast 保留**：样机与生产版的 `SfxKind` 都没有 `cancel`，
   `RECIPES[kind]()` 抛错被吞成静默无操作 —— 两边行为一致，加音效属于新增设计，不做。
9. **`chipFocus.click(i)`**：样机里有个 `chipFocus.index = i` 的重构残留（只动索引不触发跳转），
   生产版按样机**意图**写 `click(i)`，并保留注释。
10. **暂停菜单的账号行/站点行接真实账号层**：样机的"演示版"提示换成真实行为 ——
    已登录 → `auth.logout()`、未登录 → 打开登录对话框；站点设置行只在 `isSuperuser` 时出现；
    样机尚未实现的页面（编辑资料 / 站点设置 / 写文章）给"这张页面还没做，目标路径 xxx"的提示。
11. **首页状态行文案**：`'后端不可达，回退内置样张'` → `'后端不可达，暂无数据'`（生产版没有样张）。
12. **尺寸也走 token（P2 起就有的口径，值完全相同）**：`PauseMenu` / `SettingsDialog` 里的
    `3px` / `2px` / `24px` 写成 `var(--border-frame)` / `var(--border-thin)` / `var(--px-md)`
    （`tokens.ts` 里 `SCALE.border` = 1.5/2/3、`SCALE.px` = 12/24/36/48/72，值一一对上）。
    这是 P1 设计系统定的"尺寸进 token"，不是本轮新加的；**渲染结果逐像素相同**，
    保真巡检会把它列成差异，特此写明免得下轮当成漂移去改。
13. **格式与类型**：所有文件过一遍 prettier（模板属性换行等纯排版差异）；`noUncheckedIndexedAccess`
    下补 `TABS[i]!` 一类断言（`PixelAvatar` 9 处、`tabs.ts` 1 处），**只加断言不改逻辑**。
14. **`nav.ts` 没有第二份 `nextTransition`**：样机把"下一跳用哪种转场"放在 nav 模块内，
    生产版由 `scene/transition.ts` 的 `requestTransition()` 保管（presenter 取走），已写在文件头。
15. **自检期间的场景**：样机的 `frame` 初值是 boot；生产版 `booting` 为真时 `data-scene` 显式映射成
    `boot`（底栏点亮 BOOT），自检播完跟随路由 —— 深链接也照播，且不占历史。

16. **焦点蓝底差点被懒加载的样式源序吃掉（已修，记下来防复发）**：
    `pixel.css` 的 `.focusable:is(.is-focused, :focus-visible)` 与组件 scoped 的
   `.post[data-v-x]` 特异性都是 (0,2,0)，平局看源序。样机的场景是静态 import，
   组件样式先注入、`pixel.css` 最后注入 → 蓝底赢；生产版视图是**懒加载**，
   视图 CSS 永远在 `pixel.css` 之后 → 卡片的 `background: var(--paper)` 赢，
   焦点只剩闪烁方块、没有蓝底（实测 `.post` / `.chip` / `.fchip` / `.pbtn` / `.cap-more`
   全变白底）。修法是把这条规则提到 `.app .focusable:is(...)`（(0,3,0)）：
   既压过单类组件规则，又**仍然输给更具体的组件规则**（如 `.post.all` 的 (0,3,0)），
   与样机实测的逐点结果完全一致，但不再依赖注入顺序。纯键盘门新增一条断言守着它，
   并做过反例验证（把选择器改回去 → 断言报 `rgb(255,255,255)`）。

### 17.3 两条契约缺口（结论：不改接口，先按现状做）

| 缺口 | 现状 | 处理 |
|------|------|------|
| `Post` 无 `like_count` | 只有 `PostWithLikeStatus`（`GET /posts/{id}/like-status`） | 详情页心形本地计数，`hearts = 0`；要不要落库等用户定 |
| `ExternalLink` 无 `description`/`icon` | 不是接口漏字段，是模型就没有 | 页面上照样机显示占位文字，不做本地类型拓宽 |

### 17.4 本轮的门与结果

- `npm run check` → **通过**（独立性门 66 文件 · 配色漂移门 · 单测 57 · oxlint 0/0 · eslint · 契约漂移门 63 paths/89 ops/50 schemas · vue-tsc）。
- `npx playwright test` → **43 通过**（骨架 7 · 配色 4 · 外壳 6 · 菜单 5 · 纯键盘 4 · 纯鼠标 2 · 无障碍 4 · 页面 11）。
  纯键盘那一条是收尾时补的「焦点落点必须是蓝底」（见 17.2 第 16 条）。
- 修掉的三处红灯，值得记下来：
  1. 开机自检吃掉第一次按键 → 交互用例 `goto` 之后统一 `await booted(page)`（`e2e/helpers.ts`）。
  2. 迁移后首页没有 `h1` → 见 17.2 第 6 条。
  3. **"Tab 还给浏览器"是分场景的**：有标签栏的页面（`onTabScene` 为真）Tab 被外壳消费去切标签页，
     没有标签栏的页面（文章详情 / 404）才还给浏览器。纯键盘门里"Tab 走到软键上按回车"这一段
     因此必须在 404 页上验（样机口径如此，`App.vue` 的 `tabNext` 分支同一处）。

### 17.5 收尾后剩下的（用户已裁决，2026-09-29）

1. **样机没实现的页面，下一轮做**（用户点的单）；**本条已被后续裁决改写，以这里为准**：
   - **404 皮肤**已按旧前端（460 行）重做，记录见 **§19**（原先的 `NotFoundView` 是 P0 占位皮肤）。
   - **P4 只做 `/user/:username`**，记录见 **§20**；**搜索不做独立页**，仍留在菜单内弹窗
     （`/search` 独立结果页作废）。
   - **P5 口径改为「账号与管理各自独立成页」**（用户否决了「一个设置页塞四个 tab」）：
     `/profile` 个人信息编辑 · `/admin/site` 站点设置 · `/admin/links` 外链管理 ·
     `/admin/audit` 审计日志，**登录仍用现有外壳弹窗，不建 `/login` 页**。
     菜单里每项按权限分别显隐；鉴权口径：未登录访问需鉴权页 → **重定向回主页并由外壳弹出登录框**
     （带一句提示）；非超管进超管页 → 页内「仅超管可见」提示。
     「我的文章 / 草稿」不在 P5，**推迟到 P6**。
   - **P6 写作**（`/write` + 编辑器 + 「我的文章/草稿」）单列一轮。（已落地：编辑器形态经用户裁决为 E2，见 §28.9。）
2. **站点配置接线口径已定**：先把 `config/defaults.ts` 里的首页 / 关于 / 导航文案改成**样机文案**，
   再把这些位置改成读三级配置 —— 默认渲染与样机逐字一致，同时管理员可覆盖。
   字段映射（哪些中文算"站点文案"、哪些算"机器字样/皮肤"）**已确认并落地，见 §18**。
3. **隐藏 `h1` 保留**（见 17.2 第 6 条）；**音效询问默认项保持现状**（见 17.7 的 D4）。
4. 配色 A/B 仍未定稿（`design/README.md` §8），本轮不动。
5. highlight.js（代码着色）需要先给 DOMPurify 白名单加 `span`；字体子集化仍在 P7。

### 17.6 保真巡检（机器比对，主线跑的）

迁移完的"照搬"不能只靠眼看，主线另跑了两个一次性比对脚本（不入库），结果记在这里：

| 比对项 | 方法 | 结果 |
|--------|------|------|
| 样式块 | 抽出两侧 `<style scoped>` → 去掉注释/空白 → 颜色字面量与 `var(--color)` 归一成 `C` → 逐规则逐声明对照 | **全量一致**；仅 `PauseMenu` / `SettingsDialog` 出现 `2px/3px/24px → var(--border-thin)/var(--border-frame)/var(--px-md)`（值相同，见 17.2 第 12 条） |
| 模板类名 / 标签数量 | 统计模板里出现的 class 名与标签名的出现次数并对照 | **全量一致**（`dataSource` → `content.dataSource` 是 store 改写，非新增元素） |
| 模板文案 / 表达式 | 抽出字面文本与 `{{ }}` 表达式（表达式里 `.value` 归一掉）对照 | 只差已记录的 4 处：首页数据源那句、关联页引导句、关联页 `（没有说明）`、`SettingsDialog` 的 `r.* → row.*` 改名 |
| 运行期 | 逐页（`/` · `/posts` · 文章详情 · 带分组筛选 · `/links` · `/about` · 404）看控制台报错 / 失败请求 / 坏图 | **零报错、零失败请求、零坏图**；外链页走后端 `GET /api/links/` 返回空的空态（数据问题，不是页面问题） |

范围与边界：这一节比的是"结构 + 样式 + 文案"，**像素级观感**另由 `e2e/palette.spec.ts` 与人工过图
负责（§17.4 的 42 条门里，配色 / 外壳 / 屏幕外框都有断言）。

### 17.7 逐页视觉比对（独立复核，1440×900 自适应取样）

§17.6 是声明级比对（样式/类名/文案），抓不到「声明一样但级联结果不同」这类缺陷。
收尾时另跑了一轮**运行期**比对：两侧各截同一批页面、按「有封面 / 无封面」变体对齐后
比几何与计算样式（`.app` / `.screen` / `.screen-inner` / `.tabbar` / `.deck` 的盒子、
字体与字号、边框与配色、卡片变体、暂停菜单、音效询问、滚动条、动效时长）。

**结论**：几何与配色逐项相同（`--motion-step` = 160ms = 样机字面 160ms，
`--border-thin` = 2px = 样机字面 2px，值等价）。同一轮里发现并处理了 5 处差异：

| # | 差异 | 处理 |
|---|------|------|
| D2 | 焦点蓝底在卡片 / 芯片 / 分页按钮上被组件白底压掉 | **已修**（见 17.2 第 16 条）+ 补了一条纯键盘门的断言 |
| D3 | 遮罩透明度被抹平成 0.30（样机是 0.28 / 0.30 / 0.34） | **已修**（见 17.2 第 3 条） |
| D1 | 底栏站点小字：正式版有、样机没有 | **不是缺陷**：硬要求 3 的用户口径（外壳渲染、位于软键左侧、所有场景常驻）。样机的底栏只有「场景指示 / 软键 / 数据源」，这四段小字是本项目**有意新增**的外壳内容，样机未回写 |
| D5 | 404：样机 `redirect: home`（源码原话「样机不做 404 页，但不能白屏」），正式版有独立 404 页 | **不是缺陷**：P0 起就有的有意新增（回显原地址，e2e 有断言）。皮肤按旧前端重做排在下一轮（用户已定） |
| D4 | 音效询问的默认高亮项：样机按方向键打开时，同一按键**又**算一次选项切换（高亮落到「保持静音」）；正式版让位，高亮留在「开启音效」 | **用户已裁定：保持正式版现状**（2026-09-29「音效暂时还可以」）。样机那条是监听器注册顺序的副产物（它自己的冒烟用例用 Shift 打开询问，避开了这个副作用），照搬反而与弹窗自己的默认项矛盾 |

另外记一条容易误判的：全局 `*` 有 `transition-duration: var(--motion-step)` + `steps(4, end)`，
所以焦点底色在按下后 160ms 内是**离散中间值**（例如 `rgb(224,241,250)`），
要等 700ms 左右才是稳态 `rgb(214,236,248)`。比对截图/取样必须等过渡走完，
否则会把中间态当成色差（这轮踩过一次）。

---

## 18. P3 尾巴 A：站点配置接线（新增）

§17.5 第 2 条留的口径这一轮做完了：内置默认文案改成样机文案，首页 / 关于 / 标签栏
改读三级配置；**默认渲染仍与样机逐字一致，管理员可整段覆盖**。

### 18.1 落地清单

| 位置 | 改了什么 |
|------|----------|
| `src/config/types.ts` | 新增 `home.groups.title` · `home.tags.title` · `home.allCard.{title,hint}` · `about.facts[{key,value}]` · `about.body`（markdown）；旧前端首页 / 关于页的字段（`badge` / `primaryBtn` / `secondaryBtn` / `techStack`）**保留**并注明「icespark 无此结构，渲染时忽略」 |
| `src/config/defaults.ts` | 首页 / 关于 / 导航文案改成样机原文；关于页正文（1513 字符）搬成常量 `ABOUT_BODY` |
| `src/config/site.ts` | 新增纯函数 `tabLabels(config, tabs)`：按 `path` 对齐取标签，多的项忽略、缺的项回退兜底 |
| `src/scene/tabs.ts` | `TabDef` 增 `path`（导航对齐用）；`label` 降级为「兜底标签」 |
| `src/machine/TabBar.vue` | 页签文字改读 `useSiteStore()`；英文小字（HOME / POSTS / …）仍是皮肤 |
| `src/views/HomeView.vue` | 英雄区大字与副文、统计条三个标签、三段段标题、「查看全部」「全部文章」卡片全部改读配置 |
| `src/views/AboutView.vue` | `SECTIONS` / `MD` 两个常量删掉，改读 `about.facts` / `about.body` |
| `public/site.config.example.json` | 同步新增字段与样机文案（模板是第二级覆盖，必须与第一级一致，见 18.3 的门） |
| `e2e/site-config.spec.ts`（新） | 两条用例：**运行期取最高优先级覆盖层**，再核对渲染结果 —— 不去断言某一串具体的字 |

**顺带处理的一件事（值得记下来）**：后台配置库里的 `site_config` 是 P1 期间存进去的
**旧文案整份配置**（内容与旧前端 `copywriting.json` 的内置默认逐字相同）。它是三级里
优先级最高的一层，于是接完线之后页面显示的还是旧文案 —— 这**不是接线没生效，正是三级合并
在正确工作**。已把该行更新为样机文案（旧值备份在 `/tmp/backend-site-config.before.json`），
现在「内置默认 = 本地文件模板 = 后台配置」三层同文，渲染与样机逐字一致。
顺手验证了改后台配置 → 刷新页面即生效（改 `home.title` / 导航标签 / `about.facts[0].key` 各试一次）。

### 18.2 字段映射表（用户已确认口径）

分三类，判据只有一条：**管理员换了它、页面会不会跟着变**。

| 类 | 位置 | 字段 |
|----|------|------|
| 站点文案（走三级配置） | 标签栏四项文字 | `navbar.navItems[].label`（按 `path` 对齐；**增删项无效**，标签栏永远是固定四项） |
| | 首页英雄区大字 | `home.title`（样机：`SYNTHSPARK`） |
| | 首页英雄区副文 | `home.desc` |
| | 统计条三个标签 | `home.stats.articles` · `home.stats.creators` · `home.stats.reads` |
| | 「最新文章」段标题 / 查看全部按钮 | `home.articles.title` · `home.articles.viewAll` |
| | 「分组」/「标签」段标题 | `home.groups.title` · `home.tags.title` |
| | 「全部文章」大卡片 | `home.allCard.title` · `home.allCard.hint` |
| | 关于页要点块 / 正文 | `about.facts` · `about.body` |
| | 底栏站点小字 | `footer.copyright` · `footer.slogan` · `site.icp`（P1 就接了） |
| 机器字样 · 皮肤（硬编码，不进配置） | 8bit 外壳上的英文与代号 | `LATEST` / `GROUPS` / `TAGS`、页签英文小字 `HOME` / `POSTS` / `LINKS` / `ABOUT`、`SYNTHSPARK BIOS`、软键名、`SceneHead` 的「主页 · HOME」、键盘操作提示行 |
| 运行期读数 · 空值占位（硬编码） | 数字与占位词 | `N 个分组`、`按使用次数排序`、`未分组`、`（暂无简介）`、`N 阅读`、`● LIVE / ○ DEMO`、`接口 /api 实时数据` |

后两类的道理：前者是**外壳的身份**（换成中文或让管理员改，8bit 机器就不像机器了）；
后者是**数据事实**（数字来自接口，占位词属于排版兜底），都不是「站点文案」。

保留但 icespark 不渲染的字段（`home.badge` / `home.primaryBtn` / `home.secondaryBtn` /
`about.badge` / `about.title` / `about.desc` / `about.techStack`）只为一件事：
两个前端共用同一份后台配置，后台不会因为 icespark 而少显示几个输入框。

### 18.3 保真与门

- **逐字保真**：`config/defaults.ts` 的 `ABOUT_BODY` 与样机 `scenes/AboutScene.vue` 的 `MD`
  在解开模板字面量转义后**字节相同**（1513 字符）；首页那几个位置逐个比过，同文。
- **单测**（`src/config/__tests__/site.spec.ts`，17 条）：`tabLabels` 的四种情形（按 path 取值 /
  改名生效 / 多出的项忽略 / 结尾斜杠与空标签兜底）、内置默认文案与样机一致、以及
  **模板文件不改变可见内容**（拿 `public/site.config.example.json` 跑一遍合并，与内置默认逐项相等）
  —— 这一条守的是「改了 defaults 却忘了改模板」那个只有本机能撞上的坑。
- **e2e**（`e2e/site-config.spec.ts`，2 条）：从运行期取最高优先级覆盖层，核对首页 / 标签栏 /
  关于页渲染出来的字；取不到覆盖层（全新克隆）就 `test.skip` —— 那种情况由单测钉住。
- 本轮门：`npm run check` 通过（独立性门 66 文件 · 配色门 · 单测 · oxlint 0/0 · eslint ·
  契约门 63 paths / 89 ops / 50 schemas · vue-tsc）。

### 17.8 收尾后的两处交互优化（用户反馈）

P3 交完之后用户点了两条，都属于外壳的交互手感，改完只动了三个文件
（`App.vue` / `machine/PauseMenu.vue` / `machine/LoginDialog.vue`）：

1. **点菜单面板外即关菜单**（鼠标路径的 ESC）。遮罩自己接管点击（`@click.self`），
   搜索态下与 ESC **同口径**：先退回行列表，而不是把整个菜单关掉 —— 一次点击只退一层。
2. **登录框不再嵌在菜单里**。原来是「菜单里再叠一个登录框」：两层遮罩、两个模态框，
   视觉上很难受。现在菜单先关掉、由外壳开一个**外壳级**登录模态，屏幕上任何时刻只有一个模态。
   取消（ESC / 点遮罩）→ 菜单原样回来（不掉回场景）；登录成功 → 菜单重开并带一句「登录成功」，
   用户回到菜单就能看到多出来的三行；登录框开着时按 P 不会在背后又开一层菜单。

实现上有一个**必须记下来的坑**：登录模态从菜单里提到外壳之后，模态作用域（`setScope('pause')`）
不能再由各个组件「自己开、自己恢复」—— 组件挂载/卸载与 `flush: 'post'` 的 watcher 在同一次
patch 里的执行次序会互相擦掉对方设置的作用域（实测：登录框开着时 `data-scope` 掉回 `scene`，
于是按 ESC 会在登录框**背后**开出一个菜单）。现在改由外壳在 `nextTick` 里统一收敛：

```
watch([pauseOpen, promptOpen, loginOpen], ([菜单, 询问, 登录]) =>
  void nextTick(() => setScope(菜单 || 询问 || 登录 ? 'pause' : 'scene')), { flush: 'post' })
```

一处收口，三个模态的开关都走它，不再依赖各组件自己的时序。

**门**：`e2e/pause.spec.ts` 新增 4 条（点面板外关菜单、搜索态点面板外只退一层、
登录框不叠且开着时按 P 无效、密码错误时框不关且取消后不留提示），全套 47 条通过；
`npm run check` 通过。

## 19. P3 尾巴 B：404 皮肤重做（新增）

### 19.1 是什么

P0–P3 期间的 `NotFoundView` 是占位皮肤（约 19 行），本轮按**旧前端** `frontend/src/views/error/NotFoundView.vue`
（460 行）整页重做，产出 `icespark/src/views/NotFoundView.vue`（**739 行**）。结构逐项对应旧前端：

- 5 条故障亮条（`v-for="n in 5"`，`animationDelay = n * 0.6s`）+ 20 个随机漂浮粒子
  （`left: Math.random()*100%`、`delay: Math.random()*8s`、`duration: 6 + Math.random()*4s`）。
- 大号 `404`：三个图层叠字，上 / 下层各带 `clip-path` 多边形出蓝 / 品红刃边，抖动关键帧的
  `translate(±2px)` 数值照抄。
- 终端块三行：`$ find /pages -name "<真实路径>"` → `> Error: File not found` → `$ cd ~` + 闪烁光标。
- 「页面未找到」/「你寻找的页面似乎已经迷失在数字深渊中，或者它从未存在过。」两句文案照抄。
- 主按钮「返回首页」+ 底部链接组「文章列表 `/posts`」「个人中心 `/profile`」「返回上一页」。
- 元素出现顺序照抄：大号 404 → 标题 → 描述 → 终端块 → 主按钮 → 链接组。

### 19.2 与旧前端的偏差（16 处）

计数口径：照搬以「可点名的视觉 / 文案事实」计 1 处，共 **20 处照搬**（表里只列偏差）；
偏差 16 处，按影响从大到小排。行号引用写作 `旧:N` / `新:N`。

| # | 旧前端的行为 / 元素 | 新前端的做法 | 理由（归类） |
|---|---|---|---|
| 1 | 终端第一行写死 `$ find /pages -name "target"`（旧:59） | 回显真实地址 `$ find /pages -name "{{ route.fullPath }}"`（新:58、新:249） | `e2e 要求`：`skeleton.spec.ts` 的 404 用例钉着页面正文必须含原路径 |
| 2 | 页面左上角自带品牌位（Spin 三瓣 SVG + 站点名，40px 方框 + 圆角 + 发光，旧:31-42、旧:195-235） | 整块不搬，页面内不出现 logo 与站点名 | `外壳归属`：品牌与站点小字由外壳 `.deck` 常驻（`App.vue` 的 `.deck` 段） |
| 3 | 无页内键盘模型，只靠浏览器原生焦点与鼠标（旧:72-85） | `useFocusGroup` 四项 + `onPad` 方向键移动 + 自绘 `.focusable.is-focused`；到两端交还按键 | `输入内核`：焦点组（架构 §15） |
| 4 | 无（回车由 `<a>` 原生激活） | `nativeOwnsEnter()` 判据把回车交还浏览器；`dropNativeFocus()` 把原生焦点收回外壳根节点 | `输入内核`：原生焦点让位 Enter，见 §21 |
| 5 | `/profile` 是可用页面（旧:83） | 链接文案与去向照搬保留，但该路由 P5 才做，点击会落回本页 | `产品口径`：刻意不删旧结构项，P5 落地后自然闭合 |
| 6 | 无场景头 | 新增 `SceneHead`「错误 · ERROR」+ 时钟 + 小字「这个地址没有对应的页面」 | `设计系统`：场景头是全站骨架固定件 |
| 7 | 无按键说明 | 新增 `.foot-hint`「↑↓←→ 移动 · ENTER 确认 · Q 返回 · ESC 菜单 · TAB 到软键」 | `设计系统`：与首页 / 关于页同一套操作提示 |
| 8 | `.error-code` 180px，窄屏 120px（旧:247、旧:436） | 走 `px-72 px-display`，窄屏 `--px-xl`（48px）且必须 `!important` | `实现坑`：像素档位是 `!important`，同特异性压不过 |
| 9 | 主按钮渐变 + 12px 圆角 + hover 位移与外发光（旧:373-388） | 实色 `--blue-600` + 硬边 + `inset` 内高光，hover / 聚焦只换实色 | `设计系统`：渐变 / 圆角 / 外投影 → 硬边实色块 |
| 10 | 终端块 12px 圆角 + 1px 细描边；错误行 `accent-secondary`（旧:323-335、旧:63） | 硬边 + `--blue-100` 底 + `::before` 四角打点；错误行改 `--blue-700` | `设计系统`：去圆角细描边；亮品红在白底对比度不足 |
| 11 | 扫描亮条是渐变 + `3s linear`（旧:152-154） | 实色亮条 + 抖动网点 + `3s steps(8, end)` | `设计系统`：渐变→抖动网点、线性缓动→`steps()` |
| 12 | 无屏幕级扫描线 | **先加后又删掉**（见 §19.3 末条）：外壳 `.screen.crt::before` 已对每个场景常驻同一份细纹，页面再铺一层就是叠两遍 | `外壳归属` |
| 13 | 粒子 `8s infinite ease-in-out`；动效只在 `prefers-reduced-motion` 下关（旧:172-179、旧:449-459） | 同样 4px 方块 + `8s steps(12, end)`；新增 `.app[data-motion='off']` 一档 | `设计系统`：缓动→离散动画，动效开关对齐全站两档 |
| 14 | 链接直接用 `accent-secondary` / `text-tertiary`；光标自带 `@keyframes blink`（旧:63、旧:405、旧:353-365） | 统一 token 且按对比度选档（链接 `--blue-700`，不用对比度 3.65 的 `--ink-soft`）；光标改用全局 `.blink` 原语 | `设计系统`：色值只走 token，去重复关键帧 |
| 15 | 根节点 `min-height: 100vh`，背景层 `position: fixed`（旧:131、旧:142、旧:166） | 根节点 `min-height: 100%`，背景层 `absolute` | `外壳归属`：页面归 `.screen-inner` 承载，背景不固定到视口 |
| 16 | 装饰层无 aria 处理，404 只有视觉文本 | 故障层 / 粒子层加 `aria-hidden="true"`，大号 `404` 是装饰字、页面另出 `.sr-only`「404 页面未找到」 | `无障碍基线`：全站有 a11y 用例，装饰层不得进可访问性树 |

### 19.3 保真与门

- **照搬清单**（最能说明没擅自改设计的 8 条）：故障亮条 5 条与 `n * 0.6s` 延迟；粒子 20 个与三条随机
  公式；三层 `404` 的 `clip-path` 与抖动数值；终端块的命令原文与提示符；两句中文文案逐字相同；
  四个按钮 / 链接的文案与去向；元素出现顺序；终端行的 `gap/margin` 节奏（8px / 8px / 末行归零）。
- **被 e2e 钉住的两条**：`skeleton.spec.ts` 的 404 用例（回显原地址）、`shell.spec.ts` 的站点小字
  用例（404 页底栏也在、且仍在右侧）。
- **ESC 口径**：不消费 ESC（全站「P / ESC 菜单」），页内返回给 `Q` —— 与 `App.vue` 的全局键位一致。
- **一处自查修正**：移植版一度自带 `.scanlines` 层，复查时删掉 —— 外壳 `.screen.crt::before`
  （`styles/crt.css`）对**每个场景**常驻同一份 1px / 3px 细纹，页面里再画一遍等于叠两遍、
  唯独 404 页比其他页更脏；旧前端 404 也没有屏幕级细纹（只有那 5 条移动亮条）。
  顺带修掉了它那句与源码不符的注释。

## 20. P4 落地记录：用户档案页 `/user/:username`（新增）

### 20.1 是什么

新增路由 `/user/:username`（`name: 'user'`、`meta.scene: 'user'`、懒加载）、场景注册表加第 7 项
`{ id: 'user', label: 'USER', hint: '用户主页' }`、数据层加 `api/users.ts` 的
`fetchUserByUsername()` 与 `api/posts.ts` 的 `fetchPostsByAuthor(authorId, 100)`
（`query: { author_id, status: 'published', limit }`），视图 `views/UserProfileView.vue`（659 行）。

- **四态显式化**：`loading` / `ready` / `missing`（404 → 页内空态，不是整页 404）/ `error`，
  另加「这个人一条已发布文章都没有」的列表空态。用户卡与列表分开降级：文章接口单独失败时
  按空列表渲染，用户卡照常显示。
- **统计**：文章数取接口 `total`，获赞取 Σ`like_count`，阅读取 Σ`view_count`（都来自那一批
  ≤100 条），数字走 `shortNum()`（≥10000 出「万」、≥1000 出「k」）。
- **输入**：`useFocusGroup` + `spatialIndex`；鼠标 hover 与方向键移动同一份焦点 index；
  卡片是 `data-testid="user-post-card"`；`h1` 是显示名、卡片标题是 `h2`（不跳级）。
- **`watch(username)`**：`viewKey` 不随 `params.key` 变化而重建视图，`/user/a → /user/b` 靠
  `computed(route.params.username)` + `watch` 重新 `load()`，并加 `reqId` 竞态守卫。

### 20.2 与旧前端的偏差（15 处）

口径同上：旧前端 `frontend/src/views/user/UserProfileView.vue`（554 行）→ 新前端 659 行；
**照搬 8 处**（表里只列偏差），偏差 15 处。

| # | 旧前端的行为 / 元素 | 新前端的做法 | 理由（归类） |
|---|---|---|---|
| 1 | 页面自带 `<Navbar />` 与 `<footer>` 品牌小字，页头是渐变 banner（旧:9、旧:91-93、旧:256-260） | 只出 `SceneHead` + 页脚键位提示；品牌与状态行由外壳常驻 | `外壳归属` |
| 2 | 无封面文章摆一个随机 `linear-gradient` 色块（旧:144-153、旧:390-394） | 无封面走文字卡版式：不摆空图位、正文占满整行、摘要放到 4 行 | `设计系统`：渐变 → 硬边 + token |
| 3 | 卡片纯点击，无键盘层；hover 是 CSS 抬升 + 外发光（旧:364-368、旧:386-388） | `onPad` + `useFocusGroup` + `spatialIndex`；方向键一动收掉原生焦点，原生按钮上的 Enter 让位浏览器 | `输入内核` |
| 4 | 两态列表 + 一个合并错误态（404 与其它错误都写进 `loadError`，旧:70-86、旧:178-182） | 四态显式分开，404 单独成 `missing` 页内空态；文章接口单独失败按空列表渲染 | `实现坑`：404 与页内空态、接口抖动 |
| 5 | `username` 只在 setup 里取一次，无 `watch`（旧:110、旧:236-243） | `computed` + `watch` 重新加载，并加 `reqId` 竞态守卫 | `实现坑`：参数变化不重建视图 |
| 6 | 无页内返回入口，返回依赖 Navbar | 页头「◀ 返回 (Q)」真实 `<button>` + 键盘 `Q`，无上一页时兜底回主页 | `产品口径`：页内返回 + Q 键、深链接兜底 |
| 7 | 无头像时渲染用户名首字母 + 80px 圆形渐变底（旧:14-17、旧:270-289） | `PixelAvatar`（`name = username` 哈希出稳定面孔，72px，无色值字面量） | `设计系统`：像素头像 + 硬边 |
| 8 | `h1` 显示名 → 卡片 `h3`（跳级） | 页面自出 `h1`（`SELF_TITLED_SCENES` 加 `user`），卡片标题降为 `h2`，三个状态里 `h1` 常驻 | `外壳归属`：`h1` 归属重新划分 |
| 9 | 错误态带「重试」按钮（旧:491-506） | 错误态只有文案与提示，无重试按钮 | `产品口径`：全站口径 —— `src/` 里 `重试` 零命中，恢复靠 Q / 菜单 / 重进，本页与首页、列表页一致 |
| 10 | 状态视觉用 emoji（📝 / ⚠️）与 `spin` 旋转 spinner，圆角卡片底（旧:71、旧:475-489） | 像素闪烁光标 `▌` + 机器字样；状态块 3px 虚线硬边、圆角 0 | `设计系统`：离散动效 / 硬边 |
| 11 | meta 行有 `AI创作` 徽章（`author_type === 'agent'`，旧:417-424） | 卡片不带该徽章；机器标记在全站统一为 `AGENT` / `HUMAN` 机器字样，只出现在**文章详情页**的 meta 行 | `设计系统`：机器字样全站一处口径，作者页本身是主体、不重复标记 |
| 12 | 封面固定 120×80 + 8px 圆角，hover 放大（旧:370-377） | `ImageFrame` 3:2 画框、宽 240px、直角硬边，失败走 `markCoverFailed` 兜底 | `设计系统` |
| 13 | 统计竖排（数字在上），数字 20px 直出（旧:322-337） | 横排 baseline：数字 24px 像素字体 + `shortNum()` 缩写，标签 13px 黑体 | `设计系统`；`shortNum` 规则见 §20.1 |
| 14 | `postsApi.getList({ author_id, status:'published', limit:100 })`（旧:193-197） | 新增 `fetchPostsByAuthor(u.id, 100)`，封装内仍显式传 `status: 'published'` | `接口限制`：统计只能由这一批 ≤100 条算出 |
| 15 | 分组名空值兜底 `'未分类'`（旧:204） | 同位置为 `'未分组'` | `产品口径`：**样机口径本来就叫「未分组」**（样机 `HomeScene` / `ArticleListScene` / `ArticleScene` 三处都是 `未分组`），旧前端的「未分类」才是孤例 |

另两项不计入表：数据层由旧前端的 `authApi` / `postsApi` 换成本仓 `api/users.ts` + `api/posts.ts`，
且刻意**不走 `stores/content`**（用户档案是独立读数，没有进缓存的意义）；响应式断点 768px → 760px
（对齐本仓其余页面，无设计含义）。

### 20.3 保真与门

- **照搬清单**：用户卡字段与回退链（`display_name` → `username`、句柄一律 `@username`）；
  三项统计的名称与算法逐条一致；简介空态「暂无简介」；列表空态「该用户还没有发布文章」；
  404 分支文案「用户不存在」；按作者 + 上限 100 条的请求口径；文章卡结构（分组行 → 标题 →
  2 行截断摘要 → `◉ 阅读 ♥ 点赞`）与「封面在左、正文在右」；三态都渲染在列表区域内、不整页跳转；
  打开文章同样 slug 优先（`postKey`）。
- **e2e**（`e2e/user-profile.spec.ts`，7 条）：深链接直接打开（用户卡 / 统计 / 列表 / 底栏都在、零报错）、
  键盘选卡 + 回车进文章、鼠标与键盘到达同一落点、返回按钮与 `Q`、不存在的用户名给**页内**空态
  （不是整页 404、不是白屏）、没有已发布文章时的空态（stub `/api/posts/`）、`h1`/`h2` 层级 + axe。

## 21. 输入内核的一处真 bug：焦点掉到 `body` 之后键盘整块死（新增）

**现象**：文章页（以及新做的 404、用户档案页）Tab 到正文里的链接之后按方向键，之后**整个键盘失灵**
—— 按 `P` 打不开菜单、按 `Q` 也回不去。

**根因**：输入层挂在**外壳根节点**上（不挂 `window`，架构 §15 的输入路由规则），而键盘事件只沿
**当前焦点元素的祖先链**冒泡。页面自定义焦点模型在「方向键接管」时会把浏览器原生焦点丢掉，
原来的写法是 `el.blur()` —— 焦点掉回 `body`，`body` 不在 `.app` 的子树里，外壳的 `keydown`
监听器从此收不到任何按键。这不是三个页面的问题，是**所有**「Tab 走出去再按方向键」的路径的问题。

**修法**：`src/input/index.ts` 记下 `mountInput` 挂的那个根节点，新增
`focusShellRoot()`（`shellRoot?.focus({ preventScroll: true })`）；`PostDetailView.vue`（原有）
与新的 `NotFoundView.vue` / `UserProfileView.vue` 一律用它，不再 `blur()`。
另外两个页面沿用文章页的两条原生焦点惯例：`nativeOwnsEnter()` 判断回车是否该交还浏览器（页面里
是真实 `<a href>`，交给浏览器点才对），方向键 / hover 一动就收掉原生焦点，屏幕上只有一个光标。

**顺手记下的两个观察**（都**不改**，属既有效果）：

1. 文章页连续 Tab 会卡在第一个可聚焦元素上 —— 因为 `dropNativeFocus()` 在 Tab 的 keydown 上就跑了。
   这与样机行为一致，改了才是偏离；回归用例据此写成「Tab 循环到焦点进入 `.screen-inner` 为止」。
2. 404 页的四个焦点项是真实 `<a href>`，所以「Tab 走到软键上按回车」这条纯键盘门要在 404 页上验
   （样机口径如此，见 §17.4）。

**回归用例**：`e2e/parity-keyboard.spec.ts` 新增
「Tab 进正文后按方向键，键盘不会失效（焦点必须收回外壳内）」：Tab 到正文 → 方向键 → 断言
`document.activeElement` 不在 `body`、且在外壳子树内 → 按 `P` 菜单必须打开。
（该用例第一版挂在「首访音效询问框」上：第一次按键会被那个模态先吃掉，`P` 就轮不到外壳，
所以在用例里预置了 `synthspark-icespark-sound-prompt` 把它关掉。）

## 22. 本轮计数与门（2026-09-29）

- **单测**：`vitest` 5 文件 / **64 条**（新增站点配置 17 条）。
- **e2e**：`npx playwright test` **57 条**全绿 —— `a11y` 4 · `pages` 11 · `palette` 4 ·
  `parity-keyboard` 5 · `parity-mouse` 2 · `pause` 9 · `shell` 6 · `site-config` 2 ·
  `skeleton` 7 · `user-profile` 7。`shell.spec.ts` 的场景指示用例从 6 项改 7 项（新增 `user` 场景）。
- **`npm run check`**：独立性门（**68 个文件**）→ tokens 生成物校验 → 单测 → oxlint →
  eslint → 契约门（**63 paths / 89 operations / 50 schemas**，`sha256:c0a6332757d33c87`）→ `vue-tsc`，
  全部通过；`git status` 里没有生成物。
- **配色门 / 焦点门 / 键盘与鼠标 parity** 都在上面这 57 条里，未另开套件。

## 23. P5 契约：账号与管理的四张独立页（并行实现的唯一口径）

> 本节是**开工前**的契约（接口字段、共同硬要求、e2e 手法、分工红线）。
> 实际落成了什么、过程中撞到哪些坑，见 **§24 落地记录**。

用户裁定（**2026-09-29**，本轮开工前已确认，含三个问题的答案）：

1. **四张页面各自独立成页**，不再是旧前端 `ProfileView.vue` 那种「一个设置页五个 tab」：
   `/profile` 个人信息编辑 · `/admin/site` 站点设置 · `/admin/links` 外链管理 · `/admin/audit` 审计日志。
   **登录仍用现有外壳弹窗**，不建 `/login` 页。
2. 「我的文章 / 草稿」**不在本轮**，推迟到 **P6**（与 `/write` 一起）。
3. **鉴权口径**：未登录访问需鉴权页 → **重定向回主页 + 外壳弹出登录框**（附提示）；
   非超管进超管页 → 页内「**仅超管可见**」提示（不重定向）。

### 23.1 已经落地的公共部分（页面任务不必再碰）

这一节的代码是**主线写好的**，页面任务只消费、不修改 —— 四张页面并行开工时，
公共文件的写者只有一个，否则会互相覆盖。

| 文件 | 做了什么 |
|---|---|
| `src/api/users.ts` | `fetchMe()`（`GET /api/users/me`，带 `auth`）、`updateMe(payload)`（`PUT`，body 是 `UserUpdate`） |
| `src/api/links.ts` | `createLink` / `updateLink` / `deleteLink`（都带 `auth: true`，路径带尾斜杠） |
| `src/api/admin.ts` | `fetchAdminSiteConfig` / `saveAdminSiteConfig`、`fetchSiteConfigAuditLogs({limit,offset})`、`uploadAvatar(file)`（multipart，自己拼 `FormData`，不走 `request()`） |
| `src/stores/shell.ts` | `requestLogin(notice)` / `loginRequested` / `loginNotice` / `clearLoginRequest()`：守卫与外壳之间的传话通道 |
| `src/router/types.ts` | `meta.requiresAuth` / `meta.requiresSuperuser` 两个字段（语义写在注释里） |
| `src/router/index.ts` | `installGuards()`：`requiresAuth` 且未登录 → `requestLogin('这个页面要先登录')` + `{ path: '/', replace: true }` |
| `src/router/routes.ts` | 四条路由（`profile` / `admin-site` / `admin-links` / `admin-audit`），`meta.scene` 与路由名同名 |
| `src/App.vue` | `SELF_TITLED_SCENES` 加入四个 scene id（这四页**自带可见 h1**）；`loginFromMenu` 区分来源；watch 外壳请求开登录框并消费掉；模态作用域收口加入 `viewKey`（见下） |
| `src/machine/LoginDialog.vue` | 新增 `notice` prop，渲染成 `[data-testid="login-notice"]` |
| `src/machine/PauseMenu.vue` | `LINK_ROWS` 改成五条真路径；登录后加 `PROFILE`，超管再加 `SITE` / `LINKS` / `AUDIT`；点这四行 = 关菜单 + `router.push`；`WRITE` 行给「P6 还没做」的提示 |

**P5 顺手修掉的一个外壳时序 bug**（`App.vue` 的模态作用域收口）：
守卫那条路是「导航（还带一次 `resetInputState()`）+ 开登录框」两件事同时发生，
而收口只看三个模态的开关，于是转场层的 `resetInputState()` 把刚设好的 `pause` 又摁回 `scene` ——
**登录框挂在屏幕上、键盘却是死的**（ESC 收不到，按键先被全局那条拿去开了暂停菜单）。
修法：把 `viewKey` 也纳入收口观察名单，导航结束后再收口一次，谁先谁后都无所谓。
实测：守卫路径下开框时 `data-scope = pause`，ESC 只关框、不冒出菜单。

**scene id 不是导航场景**：这四张页面**不进 `SCENES`**（`src/scene/scenes.ts` 保持 7 项），
理由与 404 相同 —— 底栏那排指示是「导航场景」，管理页不该在里面占一格，
加进去还会把 `shell.spec.ts` 的「7 个场景」断言变成一句没有意义的话。
`data-scene` 仍会写成 `profile` / `admin-site` / `admin-links` / `admin-audit`（转场表现层照常走）。

**两条鉴权口径的实现位置**（分清责任，别在两处都写）：

- **未登录**：路由守卫负责（公共部分已完成）。页面里**不要**再写一遍「未登录 → 跳主页」。
- **非超管**：**页面自己**负责渲染「仅超管可见」的那块提示 —— 路由照常进去
  （`meta.requiresSuperuser` 只是声明，守卫不拦），因为登录了但不是超管的人有权知道这里少了什么。

### 23.2 每张页面的接口与字段（契约原文，别再自己猜）

- **`/profile`（个人信息编辑）**
  - 读：`GET /api/users/me`（需登录）→ `User`：`username` / `email` / `display_name` / `avatar_url` / `bio`。
  - 写：`PUT /api/users/me`，body `UserUpdate`，**只有四个字段**：`email` / `display_name`（≤100）/
    `bio`（≤500）/ `avatar_url`。返回更新后的整份 `User`。
  - 头像：`POST /api/upload/avatar`（multipart，字段名 `file`）→ `UploadResponse.url`；
    再把这个 url 写进 `avatar_url` 保存。旧前端的限制照抄：只能图片、≤5MB。
  - 改密码：`POST /api/auth/password/reset`，参数走 **query string**
    （`old_password` / `new_password`，注意不是 JSON body）。
  - 登录后要同步 `stores/auth.ts` 里的 `user`（`auth.loadMe()` 或等价），否则菜单里的昵称还是旧值。
- **`/admin/site`（站点设置）**
  - 读：`GET /api/admin/site-config`（超管；从没保存过返回 `{}`）。
  - 写：`PUT /api/admin/site-config`，body 是**完整配置 dict**（不是补丁），返回 `{success: true, …}`。
  - 结构口径与 `src/config/types.ts` / `public/site.config.example.json` 一致
    （`site` / `navbar` / `footer` / `home` / `about` 五段），页面要能看清自己在改哪一段。
  - **保存后提示「刷新页面才生效」**（旧前端原话口径；配置在启动时读一次）。
- **`/admin/links`（外链管理）**
  - 读：`GET /api/links/`（公开）→ `Link[]`：`id` / `name` / `url` / `cover_image` / `sort_order`。
  - 增删改：`POST /api/links/`、`PUT /api/links/{link_id}`、`DELETE /api/links/{link_id}`（仅超管）。
  - `url` 规则交给后端校验：`http(s)://` 绝对链接，或 `/` 开头的站内路径；拒绝 `//`、`javascript:`。
    前端**不重复实现**这套规则，只把后端的 `detail` 原文显示出来。
- **`/admin/audit`（审计日志）**
  - 读：`GET /api/admin/site-config/audit-logs?limit=&offset=`（超管）→ `{ logs: [...], total: N }`。
  - 一条日志的字段：`id` / `admin_id` / `admin_username` / `action`（目前只有 `update`）/
    `old_value` / `new_value`（整份配置，**大，默认折叠**）/ `ip_address` / `user_agent` /
    `created_at`（形如 `2026-09-29 14:11:48`，**不是 ISO**，原样显示，别硬套 `Date` 解析）。
  - **不读 `GET /api/admin/audit-logs`**：那条是**配置库**超管的领域，现有登录弹窗拿不到那种令牌
    （实测同一令牌调它返回 `{"detail":"无效的认证凭证"}`）。这件事要写在页面注释里。

### 23.3 四张页面共同的硬要求（与前面各轮完全一致）

1. **配色只走 token / CSS 变量**：不许出现色值字面量（`#hex`、`rgb()`、`hsl()`），
   抖动网点用 `--blue-*`，硬边、圆角 0、无渐变、无外发光、无模糊；动效一律 `steps()`。
2. **每页自带一个可见 `h1`**（页面名），页面内标题层级不跳级（`h1` → `h2`），
   装饰层 `aria-hidden="true"`，axe 无新增违规（底栏小字与卡片标题跳级是既有的放行项）。
3. **键盘等价**：`useFocusGroup()` + `onPad`，方向键移动、`ENTER` 确认、`Q` 返回上一页；
   表单页（`/profile`、`/admin/site`、`/admin/links`）里输入框用**原生焦点**：
   Tab 在字段间走，输入框内不劫持按键（`isEditableTarget` 已经处理），
   方向键 / 鼠标 hover 一动就收掉原生焦点（`nativeOwnsEnter()` / `focusShellRoot()` 那两条惯例，
   见 §21 —— **不要用 `blur()`**）。
4. **四态显式**：`loading` / `ready` / `empty` / `error`，失败时把后端的 `detail` 原文显示出来，
   不吞异常、不整页白屏、不弹 `alert`。
5. **页面结构**：`SceneHead`（`标题 · 机器字样`，带 clock 与右侧 slot）+ 页面内容 +
   底栏键位提示一行；**不自己画品牌 / 站点小字 / 状态行**（外壳 `.deck` 负责）。
6. **中文注释**，说清「为什么」而不是复述代码；文案里不出现具体身份信息。
7. **改动范围**：只写自己的那一个视图文件 + 自己的那一个 e2e 文件。
   公共文件（`router/*`、`App.vue`、`stores/*`、`api/*`、`machine/*`）**一律不碰** ——
   需要新的接口函数时，**报告给主线**，不要自己加到 `api/` 里。

### 23.4 e2e 口径（不依赖真账号密码）

**不许在仓库里写死真令牌 / 真密码**。三条手法，与既有用例同源：

1. **未登录路径**（无需任何凭据）：`page.goto('/admin/site')` → 断言 URL 回落到 `/`、
   外壳弹出 `[data-testid="login-dialog"]`、`[data-testid="login-notice"]` 有那句提示、
   按 ESC 关掉之后**不会**冒出暂停菜单（这是 `loginFromMenu` 的意义）。
2. **登录态**：`page.addInitScript` 写两把键 —— `synthspark-token`（随便一个假串，如 `e2e-token`）
   与 `synthspark-icespark-user`（JSON：`{username, display_name, is_superuser}`）。
   然后**必须**用 `page.route()` 把该页要调的接口全部换成夹具响应（先例：`user-profile.spec.ts`
   的 `page.route(/\/api\/posts\//)`）—— 假令牌打真接口只会拿到 401。
   **`/api/auth/me` 也要打桩**：外壳挂载时 `App.vue` 会调一次 `auth.bootstrapAuth()` 静默校验登录态，
   假令牌打真接口拿 401，`stores/auth.ts` 的 `loadMe()` 会**登出并清掉缓存** ——
   表现是「守卫放行了、菜单却只有 6 行」（实测撞到过，排查了半天）。
3. **仅超管可见**：同一套初始化脚本把 `is_superuser` 写成 `false`，
   断言页面渲染出「仅超管可见」那块提示、且**没有**真内容节点。

### 23.4b 已知遗留（本轮不修，记下来）

- ~~**后端 `total` 语义与契约不符**~~ → **已修**（用户另行点头，见 §25.6）。
  当时的记录：`backend/app/routers/site_config.py` 的
  `GET /admin/site-config/audit-logs` 返回 `{"logs": logs, "total": len(logs)}` ——
  `total` 是**本页条数**而不是总条数（契约与 `api/admin.ts` 都按总条数声明）。
  审计页按契约显示「共 N 条」并用它算页数，只能额外加一条「本页满页也算还有下一页」的兜底，
  否则真后端记录超过一页时第二页永远翻不到。彻底修法在后端（补一个 `COUNT(*)`）。

### 23.5 分工与门

- 四张页面**并行**实现（一个页面一个任务，各自一个视图文件 + 一个 e2e 文件）。
- 并行期间的分工红线：**只有主线跑 `npm run check` 与整轮 `npx playwright test`**；
  页面任务用临时 `.mjs` chromium 探针打 5175 自查（跑完删掉探针），
  或只跑自己那一个 spec 文件。
- 本轮收口时主线跑：`npm run check`（独立性门 / tokens 生成物 / 单测 / oxlint / eslint /
  契约门 / `vue-tsc`）+ 全量 `npx playwright test`，然后更新本节为「落地记录」。

## 24. P5 落地记录：四张账号管理页（新增）

§23 是开工前的契约，这一节记**实际落成了什么**、以及过程中撞到的坑。四张页面并行实现，
公共文件（`router/*`、`App.vue`、`stores/*`、`api/*`、`machine/*`）全程只有主线在写。

### 24.1 交付清单

| 路由 | 视图 | 行数 | 自己的 e2e |
|---|---|---|---|
| `/profile` 个人信息编辑 | `views/ProfileView.vue` | 976（原占位 33） | `e2e/profile.spec.ts` 7 条 |
| `/admin/site` 站点设置 | `views/AdminSiteView.vue` | 1484 | `e2e/admin-site.spec.ts` 7 条（底栏顺序那条见 §26.3） |
| `/admin/links` 外链管理 | `views/AdminLinksView.vue` | 1129 | `e2e/admin-links.spec.ts` 9 条 |
| `/admin/audit` 审计日志 | `views/AdminAuditView.vue` | 1122 | `e2e/admin-audit.spec.ts` 7 条 |

外壳级那一份（路由守卫、菜单按权限显隐、提示、点行跳转）在 `e2e/admin-guard.spec.ts`（4 条），
由主线写并维护 —— 页面任务不许碰它。

### 24.2 每张页面的关键实现（以及为什么这么做）

**`/profile`**
- **只提交改动过的字段**：读回来的用户存一份快照，保存时做差集，于是 `PUT /api/users/me`
  的 body 只有真正改过的键（e2e 断言 body 严格等于 `{display_name:'新昵称'}`），不会拿整份对象
  覆盖掉别人刚改的字段。
- 头像：`uploadAvatar(file)` 只把返回的 `url` 写进表单，仍然要点「保存」才随 `avatar_url` 提交
  —— 「上传即生效」会让用户没法反悔。本地限制照样机（只图片、≤5MB）。
- 改密码走 `POST /api/auth/password/reset`，参数在 **query** 上（`old_password` / `new_password`）；
  两次输入不一致时前端直接拦住、不发请求。
- 两个 `<form>` 加 `novalidate`：**有意的取舍** —— 要「后端 `detail` 原文显示在页面上」，
  请求就必须真的发出去；让浏览器原生气泡先拦下来，那条路永远到不了页面。后端仍是唯一校验者。

**`/admin/site`**
- **`texts`（每段 JSON 文本）是编辑的唯一真相**，保存时按段拼出**完整 dict** 再 PUT。
  这样契约里列了但 `config/types.ts` 没进类型的键（如 `site.defaultTheme`）与整段陌生的段
  （如 `custom`）都会**原样写回** —— e2e 断言未改动的那几段与数组逐项 `toEqual` 原夹具。
  「只把认识的表单字段拼回去」会静默丢数据，这个坑必须在结构上堵死，不能靠自觉。
- 非法 JSON 本地拦下并给人话（`第 X 行第 Y 列附近：多了一个逗号…` + 浏览器原文），
  **不发** PUT 去换 422；但后端拒绝时照样把 `detail` 原文摆在按钮边，且改动一个都不丢。
- 空态（`GET` 返回 `{}`）不是错误：给一条「以五个已知段起骨架」的明路，且不写请求。

**`/admin/links`**
- 与公开页 `/links` **同一套视觉语言**（同一款序号铭牌、硬边卡、2 列栅格、同一套四态块）：
  同一批数据的两种视角，不该长成两个东西。差异只在动作按钮与 `#sort_order`。
- 写接口返回整份对象 → 按 id `upsert` 后按 `sort_order` 重排，**不重读列表**
  （e2e 断言 `GET` 次数不变）。读失败时表单照常可用：列表与表单分开降级。
- `url` 规则完全交给后端：前端不重复实现 `http(s)://` / `/` 开头那套判断，
  只把 `detail` 原文显示出来（e2e 用 `javascript:` 提交，断言请求**真的发出去了**）。
- 删除用**页内模态**二次确认（`role=dialog`、`aria-modal`、默认焦点在「取消」），
  不是 `window.confirm`（那个框不可键盘导航、样式也不归我们）。

**`/admin/audit`**
- 只读站点配置审计（`/api/admin/site-config/audit-logs`）。**不读** `/api/admin/audit-logs`：
  那是配置库超管的领域，现有登录弹窗拿不到那种令牌（理由写在视图与 `api/admin.ts` 注释里）。
- `created_at` **逐字渲染**（`2026-09-29 14:11:48` 不是 ISO，套 `Date` 只会自找时区麻烦）；
  `old_value` / `new_value` 默认折叠，展开给人能读的形态（段级芯片 + 字段级 `- 旧 / + 新`），
  原文两栏 `max-height + overflow:auto + tabindex="0"`（长 JSON 在**内层**滚，整页不被滚飞 ——
  实测 59KB 两栏只让整页高了 268px）。
- 分页 `limit=10` 定死，不用 `config/prefs.pageSize`（那是文章列表 4/6 的用户偏好，
  拿它当审计分页会让无关设置带歪这一页）。

### 24.3 本轮顺手修掉的三个共性问题

1. **页面级模态会被外壳压层**（`/admin/links` 的删除确认框实测）：框开着按 `P` 会在确认框上
   再叠一层暂停菜单 —— 与 P3 收尾定的「屏幕上任何时刻只有一个模态」直接矛盾。
   修法是内核加一个开关而不是让页面去切作用域：`src/input/scopes.ts` 新增
   `pageModalOpen`，`App.vue` 把它并进 `inModal` 判定（P / ESC / Q / E 让位）。
   **为什么不让页面自己 `setScope('pause')`**：页面自己的 `onPad` 注册的是 `scene` 作用域，
   作用域一切过去它当场收不到按键，框会变成键盘死的（派发第一趟只喂「作用域 === 当前作用域」的监听器）。
   新增 e2e 一条（框开着 `P` 不叠菜单、关掉之后基础态 ESC 照常呼出菜单，证明开关放掉了）。
2. **焦点消失 = 键盘整块死**的第二个与第三个入口（§21 的同一类 bug）：
   `:disabled` 的提交按钮（点完保存按钮变灰，浏览器把焦点丢回 `body`）与
   `input[type=file]`（`isEditableTarget()` 认 `INPUT`，焦点停上去后 `Q`/`P`/方向键全被吃掉）。
   口径落进 §21 的补记：**任何会让原生焦点消失的动作，收尾都把焦点交回外壳根节点**
   （判据是「焦点确实掉在 body / 根上」而不是无条件抢）。
3. **模态作用域收口必须也盯导航**（§23.1 已记）：守卫那条路是「导航 + 开框」同时发生，
   转场层的 `resetInputState()` 会把刚设好的 `pause` 摁回 `scene`。收口观察名单加 `viewKey` 之后，
   导航结束后会再收口一次，谁先谁后都对。这条修好之前，登录框挂在屏幕上却是键盘死的。

### 24.4 一条被改正的既有用例（不是放宽断言，是它原先"因为缺陷才对"）

`parity-keyboard.spec.ts` 的「模态作用域生效」原先用 **Enter** 开音效询问框。
首页焦点正落在第一张卡上，而样机的「首次手势」与输入内核是**两个独立监听器**，
同一个 `Enter` 两边都收得到 —— 于是它「既开框、又进了文章」：那次导航自带一次输入锁
与一次作用域重置，把这条用例要验的东西搅在一起。修好收口之后作用域正确地停在 `pause`，
这条用例反而红了（它原先的绿是**旧缺陷**给的：导航后 `resetInputState()` 把 `pause` 抹成 `scene`，
框开着而作用域写着 `scene`）。现在改用**方向键**开框（只挪焦点、不导航），
要验的隔离性因此干净可判。**双击这个行为本身照搬样机，不动它**，只在用例里写明缘由。

### 24.5 本轮的道与计数

- **`npm run check` 通过**：独立性门（74 个文件）→ tokens 生成物校验 → 单测
  （5 文件 / **64 条**）→ oxlint 0/0 → eslint → 契约门（63 paths / 89 operations / 50 schemas，
  `sha256:c0a6332757d33c87`）→ `vue-tsc`。
- **`npx playwright test` 全量 91 条通过**：`a11y` 4 · `admin-audit` 7 · `admin-guard` 4 ·
  `admin-links` 9 · `admin-site` 7 · `pages` 11 · `palette` 4 · `parity-keyboard` 5 ·
  `parity-mouse` 2 · `pause` 9 · `profile` 7 · `shell` 6 · `site-config` 2 · `skeleton` 7 ·
  `user-profile` 7。
- 四张页面的 e2e **全部打桩、零真令牌零真密码**（手法见 §23.4）；未登录路径只在
  `admin-guard.spec.ts` 里验一遍，不在各页重复。

### 24.6 已知遗留与后续

1. ~~**后端 `total` 语义**（§23.4b）~~ → **已修**（见 §25.6）：后端改为另走一次 `COUNT(*)`，
   前端那条「本页满页也算还有下一页」的兜底同步删掉。
2. **`api/auth.ts` 缺一个 `resetPassword()`**：改密码那一处页面直接用了 `client.request()`
   （`POST` + `query`），红线是不许页面自己往 `api/` 加函数。后续补上正式函数再把这一处换过去。
3. **四张页面都没有真账号跑过一遍**：e2e 全程打桩（不写死凭据），
   「整份写回不丢段」「保存成功」这类路径缺一次真实后端的旁证（§23.5 的取舍）。
4. **`/admin/site` 没做 `defaultTheme` 下拉**：icespark 的配色走 `styles/tokens.ts`，
   与旧前端 11 套主题不是一回事，它作为普通字段 / 整段 JSON 可编辑。
5. 「我的文章 / 草稿」与 `/write` 已在 **P6 落地**（编辑器形态改为 E2，不迁 Milkdown，见 §28.9）；
   字体子集化与 highlight.js 的 DOMPurify `span` 白名单仍在 **P7**。

## 25. 用户反馈三条（2026-09-29 晚）

### 25.1 ESC 在每一页都能起菜单

**现象（用户）**：「现在只有主页才能 ESC 唤起菜单」。实测逐页探过一遍，**真正吃掉 ESC 的是两张页**
（`/links`、`/about`），其余页面（首页 / 列表 / 文章详情 / 用户档案 / 404）本来就是好的 ——
但用户的体感没错：同一个键在不同页有不同含义，就是不可预期。

**根因**：`AboutView.vue` 与 `LinksView.vue` 各自把 `cancel` 吃下去改去 `focusTabs()`
（把焦点挪回标签栏），`TabBar.vue` 也会在光标停在自己身上时吃掉它做 `blurTabs()`；
再叠加 `App.vue` 全局那句「焦点停在标签栏上时 ESC 先退回内容区」——
于是 ESC 的含义取决于「在哪一页 + 焦点在哪一块」，这在键盘优先的界面里是最难记的那种设计。

**改法（口径统一成一句话：ESC 只有一个含义 = 菜单，除非眼前有模态）**：

- `AboutView` / `LinksView` 删掉 `cancel` 分支（返回 false 交给全局）；
- `TabBar` 删掉 `cancel → blurTabs()`；
- `App.vue` 全局删掉「焦点分区是 tabs 就不起菜单」那条例外。
- **模态照旧优先**：暂停菜单 / 登录框 / 音效询问 / 页面自己的确认框开着时，ESC 关的是那一层
  （这是「模态必须能被 ESC 关掉」的键盘可达性要求，与本节不冲突）。
- 顶部的「↑ 到首行再往上 → 焦点交给标签栏」这条路**保留**（那是方向键的活，不是 ESC 的）。

**验证**：`e2e/shell.spec.ts` 新增「ESC 在每一页都能起暂停菜单」——
七个路径逐个按 ESC 断言菜单出现、再按一次关掉；另用临时探针验了「光标停在标签栏上时 ESC 也起菜单」。

### 25.2 底部键位 / 翻页条改成常驻

**现象（用户）**：喜欢首页与文章列表那条快捷键栏的样式，但它排在正文最后，
屏幕不够高就看不见。

**改法**：样式**一个字没改**，只把「贴住屏幕下沿」这件事抽成一条全局规则
（`styles/pixel.css` 的 `.sticky-foot`），页面加个类名即可 —— 文章页与关于页的 `keybar`
本来就是 sticky 的，其余九处（首页 / 列表 / 关联 / 用户档案 / 404 / 个人信息 / 三张管理页）
现在跟它们一致。

**第一版做错了，用户当场指出来（保留记录）**：第一版给 `.sticky-foot` 填的是
`background: var(--paper-alt)`，理由是「不透明才盖得住从下面滚过去的正文，而 `--paper-alt`
就是 body 底色，静止时看着与没有背景一样」。前半句对，后半句是**看错了层**：

| 层 | 背景 | 说明 |
|---|---|---|
| `body` / `.app` | `--paper-alt` `#EAF6FC`（浅蓝） | **外壳**，在那圈 3px 边框之外 |
| `.screen` | `--paper` `#FFFFFF`（白） | **页面画布**，页面内容都在它上面 |

这九个底条原先根本没有 `background`，透出来的是**白画布**；换成 `--paper-alt` 就比画布蓝一档，
于是页面下沿显出一条浅蓝色带 —— 看着像从外面贴上来的一条工具条，而不是页面自己的东西。
用户说的「保留原样式，看起来要像在页面内」指的正是这个。**改成 `background: var(--paper)`**
（即页面画布本色）后，静止与滚动两种状态都与原样式完全一致，只剩 `border-top` 那条细线。
文章页 / 关于页的 `keybar` 不动：样机里它们本来就是 `--paper-alt`（见 `ArticleScene.vue:648`、
`AboutScene.vue:190`），照搬。

**验证**：`e2e/shell.spec.ts` 新增「底条常驻」——1100×520 的短视口、滚到正文中间，
断言底条仍在视口下沿内，**并且**用计算值断言底条底色与 `.screen` 底色相同（色带这种事
不能靠静止画面肉眼判断，量出来才算数）；另用探针把 11 个底条逐个量过一遍
（含三张管理页，走真令牌），全部为 `rgb(255,255,255)` = 画布。

### 25.3 文章详情页的快捷键提示

用户三条意见，逐条落地（只动文案与顺序，行为一个没改）：

| 意见 | 处置 |
|---|---|
| `TAB` / `ENTER` 仍然有用，但没必要标在提示里 | 两条都删掉（TAB 遍历链接、ENTER 执行照常好使） |
| 左右键应当是「左右」而不是「右左」，且排在上下之后 | 改成 `← → 行内移动`，紧跟 `↑ ↓ 滚动` 之后 |
| `PgUp` / `PgDn` 的说明改成「翻页」 | `整屏` → `翻页` |

现在的原文：`↑ ↓ 滚动 · ← → 行内移动 · PgUp PgDn 翻页 · G 分组/标签 · L 点赞评论 ·
U 回顶部 · Q 返回 · P / ESC 菜单`。顺带把关于页底条里那句已经不成立的
「ESC 回标签栏」改成「TAB 切页」。

### 25.4 门与计数

- `npm run check` 通过（独立性门 74 文件 · 单测 5 文件 / 64 条 · oxlint 0/0 · eslint ·
  契约门 63 / 89 / 50 · `vue-tsc`）。
- `npx playwright test` **93 条全绿**（本轮 +2：ESC 全站、底条常驻）。

### 25.5 关于审计日志接口 `total` 的问答（留档）

用户问：这个到底有什么风险、影响什么场景、后端是否真的缺接口。**结论：接口不缺，
是那一行返回值算错了。**

- `backend/app/routers/site_config.py` 的 `GET /admin/site-config/audit-logs` 最后一行是
  `return {"logs": logs, "total": len(logs)}` —— `len(logs)` 是**这一页取回来的条数**，
  不是「符合条件的总条数」。契约与 `api/admin.ts` 都按总条数声明。
- **影响场景只有一个**：审计记录**多于每页 10 条**的时候。此时页面显示的「共 N 条」偏小，
  「第 X / Y 页」的 Y 也偏小（真后端现在 3 条，显示是对的，所以平时看不出来）。
  审计页已经加了兜底（本页满页就算还有下一页），所以**翻页仍然翻得动**，不会漏记录。
- **风险等级**：低 —— 纯读数显示问题，不写错数据、不崩、不影响保存；
  只是「管理员看到的总数」不真实，而这页存在的意义正是让人相信审计。
- **彻底修法**：后端补一个 `COUNT(*)`（`config_db_manager` 加一个计数函数，或复用现有查询），
  是一处独立的后端小修。**待维护者点头再动**（本轮是前端轮次）。
- 如果暂时不想动后端，还有一条纯前端选项：把「共 N 条」改成「本页 N 条」——
  话是真的，但信息量也少；两害相权，推荐修后端。

### 25.6 后端 `total` 已修（2026-09-29 晚，用户点了头）

**改动（后端两处 + 前端一处 + 测试三份）**

| 文件 | 改动 |
|---|---|
| `backend/app/config_db/manager.py` | 新增 `count_site_config_audit_logs()`：同表 `SELECT COUNT(*)`，不接过滤条件（查询接口本来也只支持 limit / offset） |
| `backend/app/routers/site_config.py` | `total = config_db_manager.count_site_config_audit_logs()`，替掉 `len(logs)`；docstring 写明 `total` 的口径 |
| `icespark/src/views/AdminAuditView.vue` | 删掉当初为绕开这个 bug 加的兜底 `\|\| logs.value.length >= PAGE_SIZE`，`hasNext` 回到契约写法 `page < pageCount` |
| `backend/tests/test_config_db.py` | 新增 `TestSiteConfigAuditLog`：12 条 / 每页 10 条时「第一页 10 条、total 12」、空表 0 |
| `backend/tests/test_site_config_audit.py` | 新增（路由级）：自搭 ASGI 客户端 + 覆盖超管依赖，直接断言接口响应的 `total` 与 `logs` 长度 |
| `icespark/e2e/admin-audit.spec.ts` | 新增「总数正好是每页条数的整数倍时下一页是灰的」 |

**为什么删兜底**：兜底与修好的后端**互相冲突**。记录正好是每页条数的整数倍（如 10 条、每页 10）
时，`total` 说只有 1 页，而兜底看到「本页满页」仍判定还有下一页 —— 点进去是一张空页。
这就是所谓「临时补丁会变成下一个 bug」。

**两处新测试都验过「能红」**：把路由那一行改回 `len(logs)` → 路由测试红；
把兜底加回视图 → 新 e2e 红。不这么试一遍，就等于没测。

**没动的**：`GET /api/admin/audit-logs`（配置库超管审计）返回的键是 `count`，
语义含糊但**现有消费方都当本页条数用**，不在这次讨论范围内，故不顺手改 —— 要改另开一轮。

**为何不重启 8002**：跑着的那个 uvicorn 没带 `--reload`，代码要重启才生效。
本轮只改代码与测试、不擅自重启用户在跑的服务；下次重启后审计页的「共 N 条」即为真值
（真后端目前 3 条，重启前后显示都是 `共 3 条 第 1 / 1 页`，要看差别得先攒够 11 条记录）。


## 26. 用户反馈四条（2026-09-29 深夜；第二条当场撤回）

用户一次提了四条，其中第二条（个人信息页的改密码功能）当场说「不用管，留着也挺好」，
于是本轮落地三条。**三条都不是「按感觉改一下」，都是先量出事实再改，并留下能量红的用例。**

### 26.1 菜单里的红字提示不再闪

**现象（用户）**：菜单里部分场景会弹一条红字提示，**不断闪烁**，太晃眼睛。

**根因**：`machine/PauseMenu.vue` 的提示行挂了全局 `.blink`
（`animation: blink-step var(--motion-blink) steps(1, end) infinite`）——
这是**照搬样机的**（`design/icespark-prototype/src/ui/PauseMenu.vue:415` 同样写着
`class="pause-hint blink"`）。但 `.blink` 在样机里是给**光标字形**用的（`▌ 检索中 …` / `▼` / `▶`），
一个方块明灭才像光标；这条 `.pause-hint` 却是一整句话（「还没有下一页」「已退出登录」
「写作页还没做（P6）…」），一句话反复明灭就是干扰。

**改法**：`PauseMenu.vue` 的提示行去掉 `blink` 类（`.pause-hint` 规则里也只有这一处差别），
颜色 / 字号 / 位置一个字没动；`.blink` 本身与其余三处光标用法原样保留。
**这是本轮唯一一处有意偏离样机的地方**，理由即上 —— 归入既定偏差清单（§19 那张表的同一类）。

**验证**：`e2e/pause.spec.ts` 新增「提示行不闪」——
断言 `[data-testid="pause-hint"]` 的 `getComputedStyle().animationName === 'none'`，
**同时**断言焦点光标伪元素 `::before` 的 `animationName === 'blink-step'`（该闪的没被误伤）。
一行字闪不闪，静止截图里看不出来，只能量计算值。把 `blink` 加回去，用例立刻红（已验）。

### 26.2 登出后回主页（仅当当前页需要权限）

**现象（用户）**：在需要权限的页面上登出，应该自动跳回主页。

**改法**：`App.vue` 挂一个 `watch(() => auth.isLoggedIn)`：由真变假**且**当前路由
`meta.requiresAuth` 时 `router.push('/')`。

- **为什么挂在 store 而不是菜单那一处 `auth.logout()`**：登出确实只有菜单一个入口，
  但 `stores/auth.ts` 的 `loadMe()` 撞到 401（令牌过期）也会调 `logout()`。
  那条路同样不该把人留在 `/admin/site` 上 —— 否则地址栏写着管理页、屏幕上却是
  「仅超管可见」的空壳，正是 P5「未登录深链接回主页」那条裁定要避免的矛盾。
- **为什么不写在 `stores/auth.ts` 里**：`router/index.ts` 已经 import 了 `useAuthStore`
  （守卫要用），store 再 import router 会绕成一个环。外壳本来就是路由与 store 的会合处。
- 只在 `requiresAuth` 为真时跳：在不需权限的页面上登出**原地不动**，不多管闲事。

**验证**：`e2e/profile.spec.ts` 新增用例 —— `/profile` 上登出 → URL 回 `/`、
`data-scene` 变 `home`、`synthspark-token` 被清、菜单里那句「已退出登录」还在；
再在 `/posts` 上登出 → URL 仍是 `/posts`。把那一行 `router.push` 注释掉，用例立刻红（已验）。

### 26.3 站点设置页的底边栏顺序（用户抓到的第二个真缺陷）

**现象（用户）**：「站点设置页底边栏布局错了，为什么快捷键指引可以在保存栏的上面？」

**实测**：滚到底时，快捷键指引停在屏幕 `y=190`（页面中部、JSON 编辑器上方），
保存栏反而在它下面 `y=524`。

**根因不是 DOM 顺序** —— `.foot` 本来就是 `.admin-site` 的最后一个孩子。真正的原因是布局：
页面根节点被外壳的 `.screen-inner > * { flex: 1 1 auto; min-height: 100% }` 定成一屏高，
而页内 `.work { flex: 1 }`（= `1 1 auto`）**允许收缩**，于是内容（左段列表 635 + 保存栏 55 = 704）
比一屏高时，`.work` 的**盒子**被压回 301px，内容溢到盒子外面继续渲染；
紧随其后的 `.foot` 是按**盒子的底**定位的，自然落在溢出的内容中间 —— 视觉上就是
「指引压到保存栏上面」，而且这块白底（`z-index: 5`）还会盖住滚过去的保存按钮。

**改法**：`.work { flex: 1 0 auto }` —— 那个 `0` 是**不许收缩**。
`.work` 的盒子于是等于内容高，`.foot` 回到保存栏下面；内容不足一屏时 `flex-grow: 1` 照旧撑满。
代码里留了注释，写明「别改回 `flex: 1`」以及为什么。

**顺带把这一整族页面查了一遍**（用户问「你自己不检查的吗」——该查）：
九张挂了 `.sticky-foot` 的页面（首页 / 列表 / 关联 / 404 / 个人信息 / 用户档案 / 三张管理页），
在 1180×620 的短视口下逐一滚到底量过：**只有 `/admin/site` 有这个缺陷**，
其余八张的底条下沿都正好压在可见区下沿、下面什么都没有（`/links` 不滚动，底条下沿距下沿 16px
= 页面自身的下内边距，属正常）。

**验证**：两处 ——
1. `e2e/shell.spec.ts` 的「底条常驻」补一条**通用判据**：滚到底时，
   底条下面不许再有别的**流内可见元素**（绝对/固定定位的装饰不算）。
   这条判据是全局的，任何页面重演同一个错都会红。
2. `e2e/admin-site.spec.ts` 新增「底栏顺序」：先钉住根因本身（`.work` 的盒子高 ≥ 内容高），
   再断言指引顶边 ≥ 保存栏底边、指引下沿≈可见区下沿、保存按钮**命中测试**落在按钮自己身上
   （不是被盖住点不到）。
两条都验过能红（把 `.work` 改回 `flex: 1 1 auto` → 两条立刻红）。

### 26.4 顺手修掉一条会让门变红的既有 flaky

全量跑第一遍时 `admin-links.spec.ts` 的「新建一条」红了：`expect(recorder.writes).toHaveLength(1)`
读到空数组。**与本轮改动无关**（那页一个字没碰），是既有写法的问题：
`page.click()` 返回只代表点击已派发，请求还在路上，紧接着同步读数组就会先读到 `[]`
（并行跑 97 条时更容易撞上）。改法：新建那条改成 `expect.poll` 等请求落地，
编辑那条改成先 `page.waitForRequest` 再点。**改完全量连跑两遍 97 条全绿。**

### 26.5 门与计数（本轮）

- `npm run check` EXIT=0（独立性门 / tokens / 单测 5 文件 64 条 / oxlint 0/0 / eslint /
  契约门 63-89-50 / `vue-tsc`）。
- `npx playwright test` **97 passed**（本轮 +3：提示行不闪、登出回主页、底栏顺序），连跑两遍稳定。
- 改动面：`machine/PauseMenu.vue`、`App.vue`、`views/AdminSiteView.vue` 各一处，
  加三个 e2e 文件与这条文档记录。


## 27. 设置页长文本的弹窗编辑（2026-09-30）

**用户诉求（原话）**：「各个设置页面有不少文本编辑框，部分可能要写大文本，小宽度编辑不方便。
所以需要你给文本框加一个能够以弹窗的形式编辑的功能」。

**为什么不是「把格子改宽」**：版面宽度是样机定稿的一部分（`/admin/site` 左列只有 260 来像素），
改宽度就是在改样机；这一页真正别扭的是「一格里写几百字」这件事本身。
所以做法是**同一份数据换一块大画布**，不动字段、不动契约、不动数据流。

### 27.0 用户第一轮反馈后的收敛（第二轮口径，最终形态）

第一版做完就被打回来了，四条意见全部照办，这一节记的就是**收敛后**的形态：

1. **不要满屏的「放大」文案**。原先每格行尾挂一个写着「放大」两字的按钮，用户说「难看死了」。
   现在**没有一个字**：入口是文本框**框内右上角**一个小图标（SVG 画的展开符号，跟着字号与
   `currentColor` 走）。图标用 SVG 而不是 `⤢` 这类字符，是因为像素字体没有那个字形，
   符号会掉成豆腐块（`machine/ExpandGlyph.vue` 里写着这条理由）。
2. **只有文档型文本框才配这个功能**。单行的名称 / 邮箱 / 链接 / 标题一律不加（连图标都没有）。
   `/admin/site` 上按内容判：带换行或超过 80 字（`kind === 'area'`）才算文档型。
   `/admin/links` 四格全是单行 → **整页退回原样**（连那次为放按钮做的 DOM 改动一起撤回）。
3. **弹窗里没必要的文字全删**。第一版有「放大编辑 · 简介」标题、一句说明、一行
   「CTRL/⌘ + ENTER 保存 · ENTER 换行 · ESC 取消」—— 现在只剩：**字段名 + 字数**一行、
   编辑区、**保存 / 取消**两个按钮。键位说明归页脚那一行（`F2 编辑全文`）。
4. **UI 做小、文本框做大**。面板宽度 760px（整段 JSON 那种长行给 1000px 一档），
   高度 `min(70vh, 620px)`；标题 13px、按钮 13px、边距收窄，省下来的全给编辑区
   （`flex: 1` 且 `min-height: 0`）。实测编辑区一屏能放二十来行正文。

### 27.1 载体与分层

| 文件 | 层 | 职责 |
|------|----|------|
| `icespark/src/machine/TextEditorDialog.vue` | M | 弹窗本体：字段名 / 字数 / 大编辑区 / 两个按钮，`role="dialog" aria-modal="true"` |
| `icespark/src/machine/ExpandGlyph.vue` | M | 框内那个展开图标（纯 SVG，`aria-hidden`） |
| `icespark/src/scene/longtext.ts` | 页面运行时 | `useLongText()`：谁在编辑 / 关掉后焦点还给谁（`focusId`） |
| `/profile`、`/admin/site` | 视图 | 每格的入口（`F2` + 框内图标）与写回（各自原来那条 @input 路径） |

弹窗的 `.btn` 是**自己带的一份**：`.btn` 在本仓向来是「每个组件各写一遍」的局部类
（`PauseMenu` / `LoginDialog` / 每个视图都这么干），父页面的 scoped 样式够不到子组件内部的元素。

**入口的语义**：图标是那一格的属性，所以摆进那一格的框里（`.area-wrap { position: relative }`
+ 图标 `absolute` 到右上角，编辑框 `padding-right: 30px` 给它让位）。e2e 里直接量了
「图标的盒子落在文本框盒子内部」——「在框里」不是形容词。

### 27.2 五条有意的取舍（都不是随手写的）

1. **不实时写回**。`draft` 是开框那一刻的快照，点保存才 emit，`ESC` / 「取消」直接丢弃。
   反过来写（边打边写回表单）会让「改了又后悔」污染已填表单，还会让「已保存」反馈说谎。
2. **点遮罩不关框**。与页内二次确认框（`AdminLinksView` 的删除确认）**有意不同**：
   那里点错没损失，这里点错可能丢掉几百字。出口只有 ESC / 取消 / 保存三个。
3. **关框后焦点还给原来那一格**（`focusId`）。`nextTick` 让这一句跑在弹窗 `onUnmounted` 的
   `focusShellRoot()` **之后** —— 焦点掉回 `body` 就是 §21 记的那条「整块键盘失灵」。
4. **打开期间页面的 `onPad` 首行守卫**（`if (editing.value) return longTextPad(a)`）。
   守卫**必须写在页面自己的监听器里**：外壳的 `runPass` 会遍历全部同作用域监听器、不提前退出，
   弹窗后注册一个挡不住页面先注册的那个；而且派发是两趟（先 `scene` 层的页面监听器、后 `any`
   层的外壳全局键），页面这一趟用掉才算「消费」。守卫里 `cancel` 关框、其余吞掉，
   Tab 放行（焦点在编辑区里时内核本来就交给浏览器）。
5. **`ESC` 关框不能只靠弹窗自己的 DOM 监听**。点过遮罩之后外壳的 `onPointerDown` 会把原生焦点
   收回根节点，弹窗内部的监听器再也收不到按键 —— 这一条路只剩页面守卫里的 `cancel` 分支。
   另外弹窗仍照 `AdminLinksView` 的先例置 `pageModalOpen`（外壳全局键的兜底闸），
   与页面守卫是「双保险」：实测只留守卫也能过（P 被守卫消费掉），但去掉守卫时它不顶用，
   所以两个都留着，注释里写明各管一段。

**换行语义**：这一层只服务文档型文本框，所以面板里 `ENTER = 换行`、`CTRL/⌘ + ENTER = 保存`
（第一版还有「单行模式 ENTER 即保存」的分支，收敛后没有单行入口，那一段代码一起删了）。

### 27.3 覆盖面（3 处进，若干类有意不进）

| 页面 | 接入的格 |
|------|----------|
| `/profile` | 简介（`textarea`，≤500） |
| `/admin/site` | 当前段里**文档型**的字段（`kind === 'area'`：带换行或 > 80 字） · 整段 JSON（等宽） |

**有意不进的**，每类都有理由：`/admin/links` 四格全是单行（名称 / 链接是 URL、配图、排序是数字）·
`/profile` 的昵称与邮箱（单行）、改密码三格（密码不该平铺在大框里）、头像 `<input type="file">`、
`/admin/site` 的单行字段与「添加段」的段名（一个词）、菜单里的搜索框（它自己就是模态）。

### 27.4 e2e（新增 3 条，全部验过能红）

- `profile.spec.ts` ×2：
  ① F2 / 图标两个入口 · 焦点在按钮上时 P 不叠菜单 · **点遮罩不关但之后 ESC 仍能关** ·
  ESC 丢弃 · 单独 ENTER 只换行、`CTRL+ENTER` 才保存 · 保存写回 + 焦点回原格 + 不发请求 ·
  **弹窗里没有 `<p>`**（说明文字确实删干净了）· 打开状态 axe 无新增违规；
  ② 图标**在框里**（量盒子包含关系）+ 单行的昵称 / 邮箱 / 密码三格 / 文件框都**没有**入口 +
  页脚那一行写了 `F2 编辑全文`（发现路径不能只靠图标）。
- `admin-site.spec.ts` ×1：单行字段（`site.description`）没有图标 → 切到 `about` 段，
  `about.body`（带换行，文档型）有图标且在框里 → `about.title` 没有 → F2 打开、保存写回后
  **整段 JSON 立刻跟着变** → 整段 JSON 的图标（`wide` + 等宽）· `CTRL+ENTER` 保存后字段列表
  按新 JSON 重算 → ESC 丢弃。

**两条能红证据**（改回缺陷写法，用例当场红）：
① 摘掉页面 `onPad` 的守卫 → 第 ① 条在「点遮罩后 ESC 关框」红；
② 去掉 `scene/longtext.ts` 的 `nextTick` 焦点归还 → 第 ① 条在「焦点回原格」红。
（`pageModalOpen` 那两行摘掉时 3 条**都没红**，因为页面守卫已经消费了 P —— 它是冗余兜底闸
而不是主路径，这条结论照实写进 27.2 第 5 条，不假装它是被测行为。）

**撤回的改动**：第一版为放「放大」按钮把 `AdminLinksView` 的 `<label class="field">` 改成
`<div>` + `label[for]`，连带改了那条「Tab 走原生焦点」的断言。第二版该页整页退回原样，
断言与文件一起回到 `b869a080` 的状态 —— 少动一处是一处。

### 27.5 真机验证与门

- 真后端（8002）+ 真账号登录后截图看过：`/profile` 表单（只有简介那格带图标）与弹窗、
  `/admin/site` 逐段扫一遍（真配置里只有 `about.body` 是文档型，图标 1 个）、
  整段 JSON 弹窗（等宽、宽一档）；另把图标放大 6 倍单看了形状（两个对角箭头，笔画清晰）。
- `npm run check` EXIT=0（独立性门 / tokens / 单测 64 / oxlint 0-0 / eslint /
  契约门 63-89-50 / `vue-tsc`）。
- `npx playwright test` **100 passed**（基线 97 + `profile` 2 + `admin-site` 1），全量一遍通过。
- 临时探针脚本与截图用完即删。

---

## 28. P6 写作页设计提案（已裁定 · 已落地，交付记录见 §28.9）

### 28.0 为什么这一轮只有提案、没有代码

硬要求 4：样机 `design/icespark-prototype/` 里**没有写作页**（只有 Boot / Home / ArticleList /
Article / Links / About 六个场景 + 404），所以这一页不能"照搬样机"，必须先与用户把交互与设计谈定。
本轮只做两件事：**盘清旧版功能面** + **把提案与待裁决点摆出来**（下文每一条都能被单独否掉）。

### 28.1 旧版功能面盘点

来源：`frontend/src/views/posts/PostEditView.vue`（2769 行）+ `components/editor/MilkdownEditor.vue`（796 行）。
「后端接线」一列是实际核对过的接口，不是猜的。

| # | 旧版位置 | 功能 | 后端接线 | 提案 |
|---|---|---|---|---|
| 1 | 顶栏左 | 返回上一页 | — | 要（Q 键同义） |
| 2 | 顶栏左 | 分组选择器（下拉 + 新建分组） | `GET`/`POST /api/groups/` | 要 |
| 3 | 顶栏右 | 保存状态（保存中 / 已自动保存 / 保存失败） | — | 要（SceneHead 右侧） |
| 4 | 顶栏右 | 保存草稿 | `PUT /api/posts/{id}` `status=draft` | 要 |
| 5 | 顶栏右 | 发布 / 更新 | `POST /api/posts/` 或 `PUT /api/posts/{id}` `status=published` | 要 |
| 6 | 左栏 | 分组内文章列表（已发布 / 草稿两个 tab） | `GET /api/posts/?group_id=` | 要 |
| 7 | 左栏 | 新建文章 | `POST /api/posts/` | 要 |
| 8 | 左栏 | 文章右键菜单：重命名 / 移动到… / 复制 / 删除 | `PUT` / `DELETE` / `POST` | 要，但**右键菜单改成面板操作行**（见 28.6.1） |
| 9 | 左栏 | 「移动到分组」对话框 | `PUT` `group_id` | 要（像素对话框） |
| 10 | 中栏 | 标题输入（单行） | `PUT` `title` | 要 |
| 11 | 中栏 | 格式工具条：粗体·斜体·删除线·标题·引用·代码·无序·有序·链接·图片 | — | 要（形态随编辑器形态定，见 28.5） |
| 12 | 中栏 | 代码块语言下拉（35 种语言） | — | 要（清单原样保留） |
| 13 | 中栏 | Milkdown 正文（WYSIWYG） | `PUT` `content` | **待裁定**（28.5 三个形态） |
| 14 | 右栏 | 「AI 助手（开发中）」三个 disabled 按钮 | 无 | **不迁**（旧版自身就是死 UI） |
| 15 | 右栏 | 标签：输入 + 建议下拉 + 逐个删除 | `GET /api/tags/` + `PUT` `tags` | 要 |
| 16 | 右栏 | 封面图：上传 / 预览 / 移除 | `POST /api/upload/image` + `PUT` `cover_image` | 要 |
| 17 | 右栏 | 发布设置两开关：公开文章 / 允许评论 | **无** | **不迁**（死开关，见下） |
| 18 | 全局 | 防抖自动保存（2s；只对已有 id 的文章） | `PUT` | 要 |
| 19 | 全局 | 图片插图上传 | `POST /api/upload/image` | 要 |
| 20 | 全局 | 发布后把地址栏换成分组/文章 slug | — | 要（`/write/:key` 的 key 用 slug 优先，同 `/post/:key`） |
| 21 | 全局 | 所有提示走原生 `alert()` / `confirm()` | — | **改成像素对话框**（见 28.6.2） |

**#17 是"死开关"的证据**（不是我的判断，是代码事实）：`settings.isPublic` / `settings.allowComments`
只在模板里被 `@click` 翻转（旧 `PostEditView.vue:301` / `:307`），全文件没有任何一处把它发给后端；
而契约里 `Post` / `PostCreate` / `PostUpdate` 三个 schema **都没有**这两个字段 —— 后端无从接收。
同理 `introduction`（简介）后端有字段，但旧编辑器**没有输入口**，故 `introduction` 永远为 null；
照旧不给入口（要加就是新增功能，得另行确认）。

### 28.2 三条既有技术事实（决定键位设计，全部核对过代码）

1. **可编辑目标只让 ESC 过去**（`src/input/index.ts:38`）：`isEditableTarget()` 命中的目标只处理
   Escape（转成 `cancel`），其余按键一律还给浏览器 / 编辑器。→ **在正文里打字时手柄层完全静默**，
   字母与方向键都是正文的，不存在"按 s 想打字母结果焦点跳走"。
2. **Tab 在本页归浏览器**（`App.vue:286`）：全局 Tab 只在**有标签栏的页面**上切页
   （`if (!onTabScene.value) return false`）。写作页没有标签栏 → Tab = 浏览器原生遍历可聚焦元素。
   **这是本页键盘路径的骨架**：从正文 Tab 出去就是工具条 / 标签框 / 按钮。
3. **ESC 不在页面里消费**（用户裁定：每一页都要能起菜单）→ 写作页**不用 ESC 关面板**；
   面板关闭走自己的键或面板里的按钮。（这条与 1 合起来看：正文里按 ESC 一定起菜单。）

### 28.3 路由与场景

| 路由 | 路由名 | 场景 | 说明 |
|---|---|---|---|
| `/write` | `write` | `WRITE` | 新建；`?group=<slug>` 指定目标分组（列表状态走查询参数的既有口径） |
| `/write/:key` | `write` | `WRITE` | 编辑既有；key = slug 优先、落回 id（同 `/post/:key` 的 `postKey()`） |

- 两条都 `requiresAuth: true`，复用 P5 守卫（未登录深链接 → 回主页 + 弹登录框）。
- `scene/scenes.ts` 的 `SCENES` 补一格 `{ id: 'write', label: 'WRITE', hint: '写作' }`，
  底栏场景指示点亮 WRITE（与 USER 那条同族）。
- 无标签栏（不进 `scene/tabs.ts` 的 `TABS`），与 `/post/:key`、`/profile`、`/admin/*` 同类。

### 28.4 布局：两个方案

**方案 A：旧版三栏**（左列表常驻 + 中正文 + 右资料常驻，窄屏折叠）
- 优点：与旧版逐块对应，没有新设计。
- 缺点：像素皮的口径是"画面即屏幕"，一屏三栏会把正文挤到中间一条；窄屏还得另写一套折叠态。

**方案 B（推荐）：正文独屏 + 两个覆盖面板**
```
SceneHead   写作 · WRITE                                 ● 未保存
──────────────────────────────────────────────────────────────
  标题（单行 input）
  工具条（一行图标按钮，横向可滚）
  ──────────────────────────────────────
  正文（编辑器，占满剩余高度）
──────────────────────────────────────────────────────────────
  .keybar   N 文稿 · M 资料 · Ctrl+S 存草稿 · Ctrl+Enter 发布
```
- `N` → **文稿面板**（左侧滑出覆盖）：分组切换 + 新建分组 + 已发布/草稿 + 篇目列表 + 新建文章
- `M` → **资料面板**（右侧滑出覆盖）：标签 / 封面 / 分组归属 / 文章操作（重命名·移动·复制·删除）
- 两个面板都是**页内模态**：置 `pageModalOpen`（外壳 P / ESC 让位），同一时刻只开一个
- 面板内：↑↓ 移焦点环、Enter 确认（`nativeOwnsEnter()` 规矩 ①）、Tab 原生遍历、
  面板里放一个「关闭」按钮（ESC 不消费，见 28.2.3）
- 优点：写作时屏幕上只有一件事（正文），贴合"一屏一场景"；键盘路径短；实现集中在两个覆盖层
- 缺点：切文章要点两下（`N` → 选中 → `N`）

### 28.5 编辑器形态：三选一（**本轮最大的待裁决点**）

| 形态 | 内容 | 新依赖 | 风险 |
|---|---|---|---|
| **E1 Milkdown WYSIWYG**（同旧版） | `@milkdown/core` + `preset-commonmark` + `preset-gfm` + `plugin-listener` / `plugin-history` / `plugin-prism` + `prosemirror-*` | **需要在 `icespark/` 里 `npm install @milkdown/*`（约 10 个包，当前未安装）** | 高：§7.5 记过 milkdown base 的实色背景要用 `background: transparent !important` 才压得住；ProseMirror 的光标 / 选区 / placeholder 都要重新对齐 tokens；bundle 最大 |
| **E2 Markdown 源码 + 实时预览** | 一个 `<textarea>` 写 markdown，另一侧 `MarkdownBody` 实时渲染（复用已有渲染器 + DOMPurify 白名单） | 零 | 低：textarea 天生是"可编辑目标"，与内核口径完全一致；像素皮天然适配；可直接复用 §27 的全屏编辑弹窗做"全屏写作" |
| **E3 源码 / 预览 可切换** | 同一个 textarea，一键在"编辑"与"预览"之间切（预览用 `MarkdownBody`） | 零 | 低；键盘模型同 E2 |

**取舍权交给用户**。我的倾向是 **E2 或 E3**：零新依赖、与既有输入内核和皮肤口径天然一致、
不引入 ProseMirror 那套与像素皮互相打架的样式层；但**只有 E1 才是旧版的体验**，
如果用户要的是"和旧版一样随手加粗所见即所得"，那就得走 E1 并接受它的皮肤成本。

### 28.6 与既有全站口径的三处对齐（都是既有惯例，不是新设计）

1. **右键菜单 → 面板操作行**：旧版的"重命名 / 移动到… / 复制 / 删除"靠右键呼出，
   而全站要求键鼠等价 —— 纯键盘路径下右键菜单不可达。改成资料面板里的一行操作按钮 +
   像素二次确认框（做法同 `/admin/links` 的删除确认框）。
2. **原生 `alert` / `confirm` → `machine/PixelDialog.vue`**：全站口径是"屏幕上任何时刻只有一个模态"，
   原生弹窗没有皮肤也没有键盘路径。标题为空不发草稿、删除二次确认都走像素框。
3. **页面自己不做页脚**：站点小字在 `.deck`，由外壳渲染；写作页页内只放 `.keybar` 键位提示（同 `/about`）。

### 28.7 待裁决点清单

| 编号 | 待裁决 | 我的推荐 |
|---|---|---|
| D1 | 布局：方案 A（三栏）/ 方案 B（正文独屏 + 覆盖面板） | B |
| D2 | 编辑器形态：E1 Milkdown / E2 源码+预览 / E3 源码·预览可切 | E2（或 E3） |
| D3 | 若选 E1：批准在 `icespark/` 里 `npm install @milkdown/*`（门禁白名单 `RUNTIME_ALLOW_PREFIX` 已预先批准该系列） | 选 E2 则无需安装 |
| D4 | 文章右键菜单改面板操作行（28.6.1） | 接受 |
| D5 | 代码语言下拉 35 种语言：原样 / 精简 | 原样 |
| D6 | 新稿未保存时离开页面是否拦截提醒（**旧版没有这个行为**） | 不拦截，只在 SceneHead 常显"未保存" |
| D7 | 发布成功后：留在写作页（旧版行为）/ 跳到文章详情页预览 | 留页 + 给一个"查看"入口 |
| D8 | 三处死 UI（AI 助手占位块 / 两个发布设置开关 / 简介无入口）都不迁 | 不迁 |

### 28.8 验收口径（动手后适用，沿用全站门）

- `npm run check` EXIT=0（独立性门要能证明 `@milkdown/*` 只被写作路由**动态** import，
  否则 `STATIC_EDITOR_IMPORT` 直接响；不选 E1 则这条门无所谓）。
- e2e 新增计划（写作页专属）：① 未登录深链接 `/write` → 回主页 + 登录框；
  ② 新建 → 标题为空不发 → 填标题 → 存草稿 → 出现在草稿列表；
  ③ 发布 → `/post/:key` 详情页能看到正文；④ 纯键盘：从正文 Tab 到工具条、Enter 生效、
  `N` / `M` 开面板、↑↓ 选择；⑤ 纯鼠标无障碍路径；⑥ ESC 在正文里起菜单（口径 3）；
  ⑦ 面板开着时按 P 不叠二层菜单（`pageModalOpen`）；⑧ axe 无新增违规。
- 真机验证：起 5175 + 真后端 8002，登录 `icespark_admin` 造一篇草稿再发布，截图存档；
  探针脚本与截图用完即删。

### 28.9 交付记录（已实现 · 2026-09-30）

提交：`feat: P6 写作页 —— 正文独屏 + 文稿/资料覆盖面板（E2 源码 + 实时预览）`
（本节与实现同一次提交；哈希不写在这里 —— 写进去就得为它再改一次，改完哈希又变）。

§28.7 的十条裁决逐条落地：**D1 方案 B**、**D2/D3 形态 E2**（Markdown 源码 + 实时预览，
零新依赖，没有装 `@milkdown/*`）、**D4～D10 全部按推荐**。下面记的是**改动清单 + 验收结果 +
与提案不一样的地方** —— 后面那几处是动手才暴露的，提案当时的文字已经不准确了，以本节为准。

#### 28.9.1 动过的文件

| 文件 | 性质 | 规模 | 说明 |
|---|---|---|---|
| `icespark/src/views/WriteView.vue` | 新增 | 1720 行 | 路由页面：动作条 / 标题 / 正文分屏 / 三个覆盖面板 / 二次确认 / 自动存草稿 |
| `icespark/src/signal/MarkdownSourceEditor.vue` | 新增 | 496 行 | `signal/` 层的编辑器容器：插入条 + 语言下拉（35 项）+ 正文 textarea + 记法插入 |
| `icespark/src/api/upload.ts` | 新增 | 94 行 | `POST /api/upload` 的 multipart 封装 + 10MB 上限 + `UploadError` |
| `icespark/e2e/write.spec.ts` | 新增 | 493 行 / 9 用例 | 写作页专属门（§28.8 的计划是 8 条，实际拆成 9 条） |
| `icespark/src/api/posts.ts` | 改 | — | 追加 `fetchMyPosts` / `createPost` / `updatePost` / `deletePost` 与三个载荷类型 |
| `icespark/src/api/groups.ts` | 改 | — | 追加 `createGroup`（面板里的「＋ 新建分组」） |
| `icespark/src/router/routes.ts` | 改 | — | 404 前插入 `/write/:key?`（`meta.scene='write'`、`requiresAuth`） |
| `icespark/src/scene/scenes.ts` | 改 | — | 场景表加 `{ id: 'write', label: 'WRITE' }`（底栏场景指示 7 格 → 8 格） |
| `icespark/src/input/pad.ts` | 改 | — | `PadAction` 加 `panelDocs / panelMeta / panelPreview`，`KEYMAP` 加 `n / m / v` |
| `icespark/src/App.vue` | 改 | — | `SELF_TITLED_SCENES` 加 `write`；新增 `SELF_LOADING_SCENES`（见 28.9.2 第 4 条） |
| `icespark/src/machine/PauseMenu.vue` | 改 | — | 「编辑文章」从占位提示改成真跳转（`profile/site/links/audit` 同一组） |
| `icespark/e2e/admin-guard.spec.ts` | 改 | — | 「未登录深链接」那一圈从四个路径扩到五个（加 `/write`） |
| `icespark/e2e/pause.spec.ts` | 改 | — | 提示行不闪那条改用 `e`（前进）触发，不再依赖写作页占位 |
| `icespark/e2e/shell.spec.ts` | 改 | — | 场景格数 7 → 8；底条常驻那条加「等列表渲染」 |

**没有动的东西**（有意为之）：`signal/` 不 import `machine/`（独立性门照过）；
没有新依赖（E2 形态的全部成本是 496 行的编辑器容器）；样机六页一行未改。

#### 28.9.2 与提案不一样的地方（六处）

1. **面板里的 ESC 不是「不消费」，而是「关面板」**。§28.4 当时写的是「ESC 不消费，见 28.2.3」。
   真做起来才发现：面板是**页内模态**（`pageModalOpen` 为真、外壳 ESC 已经让位），
   如果页面自己不吃这一下，ESC 就成了死键。落地口径改成
   「页内模态开着时，ESC 关的是那一层」—— 与外壳既有的一句话完全一致，也比原提案好。
2. **`PostListItem` 没有 `group_id`，分组过滤只能按 `group_name`**。文稿面板要「按分组筛稿」，
   可 `GET /api/posts/my` 回的是 `PostListItem`，契约里只有 `group_name`（旧前端也是按名字筛的）。
   代价：分组改名后老文章会掉出该分组的列表。**这是契约的字段缺口，不是本页能修的**；
   要修得先给 `PostListItem` 加 `group_id`（留给下一步）。
3. **面板一开，动作条就被遮罩盖住：鼠标换面板要先关，键盘不用**。面板页内模态与全站同款
   （管理页的 `.del-mask` 就是这么写的），遮罩自带点击即关，面板头另有「✕ 关闭」。
   键盘在面板里按 `N`/`M`/`V` 是**直接切**（`switchPanel()` 那条：同一个键再按一下才关），
   鼠标点不到动作条 —— 键盘路径比鼠标路径短一步。**这条不对称已经报给用户裁决**（要么接受，
   要么在面板头加三颗切换 chip）。
4. **写作页不进 `:key` 重建**。外壳原来的 `viewKey` 是 `${scene}:${route.params.key}`，
   对写作页是错的：`/write` → `/write/<slug>`（第一次保存时地址栏换名）会**整页重建**，
   重建又会重新拉分组与文稿列表、把刚写好的「已保存 12:34:56」抹掉，并且和 `fill()` 抢状态。
   新增 `SELF_LOADING_SCENES = ['write']`：这些场景**自己管装载**，外壳不重建。
5. **插入条是文字按钮，不是「图标按钮」**。§28.4 的草图写的是「一行图标按钮」。
   实际做成文字标签（粗体 / 斜体 / 行内码 / 标题 / 引用 / 无序 / 有序 / 链接 / 代码块 / 图片）：
   像素皮里没有图标字库，画图标要么引 SVG 要么写一堆 CSS；文字版一眼能认，也不加依赖。
   D9「保留一行插入条」的精神没变。
6. **删除线按钮没做**。`MarkdownBody` 没有开 GFM 的 `strikethrough`，做一颗插入 `~~x~~`
   的按钮就会出现「插得进、渲染不出」的假功能 —— 宁可少一颗。要补得先改进样机渲染器（待裁决）。

#### 28.9.3 键位：新增的都是「全局名字、局部消费」

- `pad.ts` 的 `KEYMAP` 新增 `n → panelDocs`、`m → panelMeta`、`v → panelPreview`。三个动作目前
  **只有写作页消费**；其它页面没有监听器，`runPass` 走完没人吃就什么也不发生，也不会 `preventDefault`
  （内核只在可编辑目标里对 Escape 这么做）。所以这三个键名是**全局保留**的。
  宽屏下 `V` 有意**不消费**（预览列常驻，开一个「预览面板」是多余的），只有窄屏才开面板。
- **正文里 Tab 出正文到插入条**：插入条在 DOM 里排在 textarea 之前，原生 Tab 够不到它，
  会一路落到页面末尾那两个隐藏文件框。现在 textarea 自己接住不带 Shift 的 Tab，把焦点交给插入条第一颗按钮；
  插入记法后焦点交回 textarea。小环闭在编辑区里。
- **N/M/V 在正文里收不到**（内核事实：`isEditableTarget()` 的可编辑目标只处理 Escape），
  这也正是「Tab 出正文」存在的理由。选完一篇稿子焦点会落回正文（`fill()` 的既定行为：接着写），
  想再开面板要再 Tab 一次 —— 与上面同一条规矩。
- `Ctrl+S` / `Ctrl+Enter` 在 textarea 内由编辑器自己处理（内核把 Enter 让给真实按钮，
  `s` 又是 `down`，所以这两条捷径只在编辑器里成立，与 §28.2 的推演一致）。

#### 28.9.4 验收结果

- `npm run check` **EXIT=0**（独立性门 → tokens:check → vitest 64 → oxlint 101 files → eslint → api:check
  63 paths / 89 operations / sha256 `c0a6332757d33c87` → `vue-tsc`）。
- `npx playwright test` **109 passed / 0 failed**（动手前基线 100；新增 9 条全在 `write.spec.ts`）。
- §28.8 那 8 条计划的落点：① → `admin-guard.spec.ts`（五路径那一圈）；②③④⑤⑥⑦⑧ → `write.spec.ts`
  的九条（多出来的一条是「已发布再改走 PUT 而不是又建一篇」，这是**发布后留页 + 查看入口**
  （D7）的必然第二条路径，不测它就等于没测 D7）。

#### 28.9.5 真机验证（5175 前端 + 8002 真后端，账号 `icespark_admin`）

一条龙跑完，全部真接口、零打桩：

1. `POST /api/auth/token` 拿真令牌 → `/api/auth/me` 取用户；写进 `localStorage`（与外壳启动读的两把键同款）。
2. `/write` 拿场景 `write`，填标题与正文 → **存草稿**：`POST /api/posts/` 真落库，
   公开接口 `GET /api/posts/slug/<slug>` 取得回来（`status=draft`，地址栏换成这一篇）。
3. **插入图片** → `POST /api/upload` 真 multipart：返回
   `![live-check.png](/api/download/<user_id>/images/<uuid>.png)`，该 URL 200 / `image/png` /
   89 字节 / 8×8（图确实存下来了，正文与文章页都按原尺寸显示）。
4. 资料面板加标签「真机」→ 发布：`PUT /api/posts/{id}`，`status` 转 `published`，
   **后端自补 `published_at`**（核对过），按钮文案转「更新」，「查看」入口出现。
5. 点「查看」→ `/post/<slug>`，标题与正文渲染正常（真机截图里那张小方块就是 8×8 的测试图本身）。
6. 回到 `/write`，文稿面板里「文章」分节数 +1，自检稿在列。
7. **清理**：`DELETE /api/posts/{id}` → 按 slug 再取 404，站点上不留痕迹（`/api/posts/my` 复查残留为空）。

截图五张（新建态 / 资料面板 / 发布后 / 文章页 / 文稿面板）在 `/tmp/icespark-live/`；临时用例
（`tmp-live-write.spec.ts`、`tmp-measure.spec.ts`）与截图都是**用完即删**，没有留在仓库里。

#### 28.9.6 顺手修掉的三处

1. **`shell.spec.ts` 底条常驻那条会假失败**：它在 `/posts` 上量 `scrollHeight`，
   但列表是异步拉的 —— 默认 8 个 worker 并行时页面还是空的，量出来「不比视口高」。
   现在先等第一批卡片渲染再量（这条用例要证明的是「长页面也贴住下沿」，不是「接口有多快」）。
2. **插入条在 1280 下会被切掉半个字**：宽屏左右分屏时源码列只有约 587px，
   而插入条要 613px（溢出 26px），最后一颗「图片」只剩半个「图」字，还带出一条 12px 的横向滚动条。
   收紧一档间距（gap 4→3、`.md-tool` 内边距 8→7、`.tool-btn` 内边距 7→5）后 1280 下 **587/587，零溢出**；
   1100 及以下才需要横滚（`overflow-x: auto` 保留）。实测：1440→0、1280→0、1100→61、900→161。
3. **五处缺 label 的控件补 `aria-label`**：两个隐藏 `input[type=file]`（`opacity:0` 仍在无障碍树里）、
   新分组名、加标签输入、分组归属下拉。axe 从 `label: 2` + `select-name: 1` 归零。
   底栏那几行小字的对比度是**全站已知取舍**（`a11y.spec.ts` 的清单），本页照 `admin-links.spec.ts`
   的口径排除，不重复判。

#### 28.9.7 留给下一步

- **删除线按钮**：要先给 `MarkdownBody` 开 GFM `strikethrough`（动样机渲染器，待裁决）。
- **`PostListItem` 加 `group_id`**：加完文稿面板的分组过滤就能按 id 走，改名不再掉稿。
- **窄屏预览**：已在 §28.10.1 补齐并验证（栅格跟着塌成一列 + 断点两侧原位来回切 + 640px 不横向溢出）。
- 其余仍挂在 P7 收尾清单上（字体子集化、JSON-LD/sitemap、预渲染、性能预算门），与本页无关。

### 28.10 用户反馈三条（2026-09-30 晚）

用户口径三条：①窄屏的**覆盖式预览**要「按屏幕大小随时自适应」；②加标签要能**从已有标签里选**；
③别忘了**自动保存**。逐条落地，其中 ①③ 各挖出一个真 bug，都已在 e2e 与真机上复现 / 复验。

#### 28.10.1 窄屏：栅格没跟着塌（真 bug）

`narrow` 本来就是 `matchMedia('(max-width: 1100px)')` + `change` 监听 —— 「随时自适应」那部分
原本就是对的（断点 1100 与 `PostListView` 同款）。**坏在列数**：`.write-split` 的
`grid-template-columns` 写死两列，窄屏把预览那一栏 `v-if` 掉之后，源码只占**左半屏**：
实测 900px 视口下 `.write-split` 818px、`.split-source` 只有 **403px**，右半边空着。

修法：列数与 `narrow` 同源（`.write-split.is-narrow { grid-template-columns: minmax(0, 1fr) }`）。
没有用 `:has()` 让 CSS 自己看 DOM —— 全仓库一处 `:has(` 都没有，不为这一处引进新语法。

实测（同一页面原位来回切）：1280 两列 593+593 → 900 一列 818（源码独占全宽）→ 1440 又回两列；
`V` 按钮与键位提示只在窄屏出现；V 面板开着时放大回宽屏 → 面板**自动关**（预览栏回来了，
再叠一个面板是重复的）；640px 下仍是一列、不横向溢出。
e2e 钉在 `write.spec.ts`「窄屏把预览折成 V 面板，断点两侧来回切都跟得上」。

#### 28.10.2 标签：从已有标签里挑

旧版与上一版 icespark 都只在**打了字之后**才给建议，等于「记得住标签名才选得到」。现在：

- 输入框空着就先给**常用的 8 枚**，按 `post_count` 倒序 —— 与 `stores/content.ts` 的标签取数口径
  一致，不另立一套排序；
- 打字按**包含**过滤到 5 枚，已经加过的不再出现；
- `↑` / `↓` 移高亮、`Enter` 收下高亮的那一枚；鼠标点候选即加（候选行有「从已有标签选 / 匹配到」的小字）；
- 候选里没有的，`Enter` 就是**新建**（提示行写明「按 Enter 新建「xxx」」）。

「空输入也给候选」超出了旧版功能面，是本轮用户明确要的，故按用户口径做。

#### 28.10.3 自动保存：本来就有，但有三处不对

原实现是「2 秒防抖 + 只对已落库的稿子」（与旧版一致，也是 §28.1 第 18 行的口径）。这轮补了四处，
第一处是**真 bug**：

1. **自动保存会把编辑区 `disabled` 掉**：`busy` 一路传给了编辑器与标题框，于是每停笔 2 秒就
   把 textarea 禁一次 —— 光标丢失、这两个字打不进去。现在编辑区与标题**任何时候都能写**，
   `busy` 只用来禁用动作条按钮与切换页头那行字（`MarkdownSourceEditor` 的 `busy` prop 因此撤掉）。
2. **补 30 秒兜底**：一直不停手地写时，2 秒防抖会被每个字符重置，可能好几分钟不落库
   （旧版有个 30 秒 `autoSaveInterval`，上一版漏了）。
3. **分组变更漏了监听**：原监听列表只有 `title/content/tags/cover`，改完分组不动别处就永远不落库。
   现在六项（+`postGroupId`/`status`）齐了。
4. **页头写「已自动保存 12:34:56」**（旧版口径），人按的仍写「已保存 12:34:56」——
   两者不是子串关系，测试能分辨这两种。

同时把「算不算干净」的判据从「回来时眼前那份」改成「**发出去的那份**」：请求飞在路上时用户写的字
不会被算进已保存，状态行照样显示「未保存」，收尾时补排一次自动保存，绝不谎报「已保存」。

#### 28.10.4 顺带抓住并修掉的一个坑：发布后两秒被打回草稿

上面那次重构里，`status` 被算进了「服务端回写的字段要不要采纳」的判据 —— 而 `status` 恰恰是
**这次调用要切换的目标**：本地还是 `draft`、发出去的是 `published`，两者天生不等 →
状态永远不采纳 → 页面永久「未保存」→ 2 秒后自动保存拿**旧的 `status`（draft）**再推一次 →
**刚发布的文章自己变回草稿**。是 e2e 当场抓住的（`发布走一次 PUT` 那条的状态行断言）。

修法：`status` **无条件采纳**（它不是用户的编辑，是本动作的结果）；并在那条用例尾部补一条回归
断言「发布之后不该再补一次写」。真机上另跑了一遍：发布 → 停 3.5 秒 → `GET /api/posts/{id}`
仍是 `published`、`published_at` 在。

#### 28.10.5 验收

- `npm run check` **EXIT=0**；`npx playwright test` **112 passed / 0 failed**
  （109 → 112：新增窄屏 / 标签 / 自动保存三条，`write.spec.ts` 共 12 条）。
- 真机（5175 + 8002，`icespark_admin`）：真标签库 14 枚，候选给出 8 枚
  （指令遵循 10 / JSON 9 / deepseek-flash 9 / 真机 4 / …）；手打 `JSON` 过滤到 1 枚、`↓`+`Enter`
  收下，再点「真机」→ 落库 `tags = ["JSON","真机"]`；**不动任何按钮**，停笔 2 秒后真后端正文里
  就出现了第二段（页头「已自动保存」）；发布 3.5 秒后仍是 `published`；900px 下分屏与源码同宽
  （差 0px）、V 面板里就是实时预览；自检稿已删。

### 28.11 用户反馈两条（2026-09-30 深夜）—— 编辑框里的键盘口径

用户口径两条：①焦点在编辑框里时 `ESC` = **失焦**，失焦之后 `ESC` 才是打开菜单；
②字母快捷键在文本框里被输入顶掉，新增组合键 —— **`Shift` + 字母** 在文本框里触发原快捷键。

两条都落在**输入内核**（`src/input/index.ts` 的 `isEditableTarget` 那一支），改一处、全站生效。

#### 28.11.1 ESC：从编辑框里「出来」是第一步

焦点在 `input` / `textarea` / `select` / `contenteditable` 里按 `ESC`：`preventDefault()` +
`focusShellRoot()`，**不派发 `cancel`**。第二下时焦点已经不在编辑框里，走的是原来那条正常派发
—— 页面（面板 / 确认框）或外壳（呼出菜单）各自决定它干什么。

- **不是 `target.blur()`**：焦点掉到 `body` 之后，外壳挂在外壳根节点上的 `keydown` 监听器再也
  收不到按键，整块键盘当场失灵（§21 记的就是这条）。所以是「把焦点交回外壳根节点」。
- **组字期间整支让开**（`event.isComposing`）：那时的 `ESC` 是「取消这次组字」，抢了就会打断
  正在打的词。中文输入是本站的主路径，这一条不能省。
- 受影响的既有路径全部复验过：

  | 位置 | 从前 | 现在 |
  |---|---|---|
  | 写作页正文 / 标题 / 标签框 | `ESC` 直接呼出暂停菜单 | 第一下失焦，第二下呼出菜单 |
  | 登录框的两个输入框 | `ESC` 直接取消登录 | 第一下失焦，第二下取消 |
  | 暂停菜单的搜索框 | `ESC` 直接退回行列表 | 第一下失焦，第二下退回行列表 |
  | 长文本弹窗（`TextEditorDialog`）的 textarea | `ESC` 直接取消 | **不变**：弹窗自己有一条局部规则（`@keydown` + `stopPropagation`），样机就是这个手感 |
  | 面板 / 确认框（焦点不在编辑框里） | `ESC` 关这一层 | 不变 |

#### 28.11.2 组合键：`Shift` + 字母，但白名单只放三个面板键

`resolveComboAction()`（`src/input/pad.ts`）成立条件是「按住 `Shift` + 是字母 + 没按
`Ctrl/Alt/Meta` + 不在组字」，再过滤一张**白名单**：`panelDocs` / `panelMeta` / `panelPreview`，
也就是写作页的 `Shift+N` / `Shift+M` / `Shift+V`。只有当前场景**真的消费**了这个动作才
`preventDefault()` —— 没消费就还给浏览器（大写字母照常打进去）。

三个必须让开的组合：没按 `Shift`（那是正常输入，一个字都不能抢）、带 `Ctrl/Alt/Meta`
（`Ctrl+S` 存草稿、`Ctrl+A` 全选、`⌘+P` 打印是浏览器与系统的键）、输入法组字期间。

**为什么不是「字母快捷键全都放行」**：场景监听器是**按「可编辑目标永远到不了这里」写的**。
写作页的方向键分支先 `dropNativeFocus()` 再返回 `false` —— 把 `W/A/S/D` 放进编辑框，只会得到
「想打大写 A，光标掉了、字也没进去」；`X/Q/E` 是历史前进后退，在正文里误按一下就是整页跳走。
这两类键的正路是**先 `ESC` 失焦，再按原键**（这也正是口径①存在的意义）。面板键不一样：它们
本来就是「离开编辑区去看别的东西」，开面板时收掉原生焦点正是应有之义。要放宽只改
`COMBO_ACTIONS` 一处。

**代价（明确记账）**：写作页的正文 / 标题 / 标签框里，`Shift+N` / `Shift+M` / `Shift+V` 打不出
大写 N / M / V（宽屏下 `V` 不消费，照常打；只有窄屏才拦）。`Shift+P`（全局菜单）**有意不放行**：
它在任何输入框里都会吃掉大写 P（连登录框都吃），代价大于收益 —— 想按 P 就先 `ESC` 失焦。

#### 28.11.3 顺带修掉一个同类坑：搜索框「退回去」之后键盘掉线

`PauseMenu.closeSearch()` 与 `downToHits()` 原本都是 `input.blur()`：焦点掉到 `body`，于是
「退回行列表之后方向键按不动」、`↓` 进入结果列表之后 `↑↓` / `ENTER` 全失灵（与 §21 同一条坑）。
两处改成 `focusShellRoot()`。新用例用夹具两条命中把它钉死：`↓` 之后焦点仍在外壳内、`↑↓` 能走、
`ENTER` 能按 slug 打开命中（先按老实现跑过一遍，确认这条用例真的会红）。

#### 28.11.4 键位提示跟着改

写作页底部的键位条原来写「`TAB` 出正文 · `N` 文稿 · `M` 资料 · `V` 预览 · `P`/`ESC` 菜单」。
行为变了，提示必须跟着变，改成：

```
TAB 出正文 · ESC 失焦 · Shift+N 文稿 · Shift+M 资料 · [Shift+V 预览] · Ctrl+S 存草稿 · Ctrl+↵ 发布 · Q 返回 · P 菜单
```

`Shift+N/M/V` 是**通用写法**（焦点在不在编辑框里都成立 —— 不在编辑框里时 `resolvePadAction`
本来就把大写归一化成小写），所以提示里只留组合键这一种写法，鼠标路径仍由按钮上的 `N` / `M` / `V`
小徽章给。

#### 28.11.5 验收

- `npm run check` **EXIT=0**；`npx playwright test` **114 passed / 0 failed**
  （112 → 114：新增「正文里 `Shift`+字母 直接开面板」与「搜索态 `↓` 进入结果列表后键盘不掉线」
  两条，改写「写作页 ESC」一条）。
- 内核单测 `src/input/__tests__/pad.spec.ts` 从 19 条加到 25 条：白名单、Ctrl/Alt/Meta 让位、
  组字让位、非字母让位、白名单外 14 个字母全不放行（全仓单测 64 → 70 条）。
- 真机（5175 + 8002，`icespark_admin`）：正文里 `ESC` → 焦点落回外壳、菜单不出；再 `ESC` → 弹出菜单、
  再 `ESC` → 关掉；正文里 `Shift+N` 直接开文稿面板且正文没多出「N」；`Shift+W` 打出大写 W 且焦点
  仍在正文；暂停菜单搜索框 `ESC` 两下逐层退回，退回后 `↓` 仍能走行。

### 28.12 用户反馈两条（2026-10-01）—— 窄屏预览面板：滚不动 + 软键压在弹窗上

用户口径两条：①「预览框中滚轮和方向键都无法翻滚」；②「边框的菜单和音效按钮的层级有问题，
怎么还在弹窗之上了」。两条都只在**窄屏 V 预览面板**这一处暴露，但根因分属两个完全不同的层。

#### 28.12.1 滚不动：`inert` 挂错了层，方向键又没有滚动目标

两个独立的因，凑成了「怎么弄都不动」：

1. **`inert` 挂在了滚动容器自己身上**。`inert` 的语义是「整片退出交互」，实现上它让元素
   **不参与命中测试** —— 滚轮事件的落点判定同样走命中测试，于是指针在正文上滚，事件却落在
   遮罩上，`scrollTop` 一直是 0（真机实测：滚轮 240px，`scrollTop` 纹丝不动）。
2. **方向键滚的是「当前焦点所在的滚动容器」**，而面板打开时焦点被 `dropNativeFocus()`
   交给了外壳根节点（`.app`），屏幕里那个滚动容器根本没被聚焦 —— 按键有主，但主不会滚。

改法（`WriteView.vue`）：

- `inert` 下移一层，只挂**里面那层包装** `.preview-inert`（正文仍然是只读的、整片不进 Tab
  焦点链），滚动容器自己脱出 `inert`。
- 滚动容器补 `tabindex="0"` + `role="group"` + `aria-label="预览正文（只读，可滚动）"`
  （与审计页那个 `.raw-box` 同一套写法，顺带满足 axe 的 `scrollable-region-focusable`），
  开面板时把它 `focus()`。
- `panelPad` 里预览面板的方向键**先于 `dropNativeFocus()` 返回 `false`**：焦点就在这个容器上，
  收掉它方向键就没有滚动目标了。
- 焦点口径顺手补两处同类坑：`closePanel()` 关掉面板后 `focusShellRoot()`（预览体被卸载，
  焦点会掉到 `body`，挂在 `.app` 上的 `keydown` 监听器再也收不到按键 —— 与 §21 / §28.11.3
  同一条坑），并在没有面板可关时**直接返回**（不无谓地抢走编辑框的焦点）；`panelPad` 的
  「换面板」分支改走 `openPanel()`（原本直接改 `panel.value`，预览 → 文稿时焦点还停在马上
  要被卸载的预览体上）。所以 `openPanel('preview')` 是「把焦点交给滚动容器」，其余两个面板
  仍是「把焦点收回外壳」—— 一个动作两种焦点口径，代价写进注释里。

#### 28.12.2 软键压在弹窗上：`.screen` 是个层叠上下文，底栏在它外面、树序在后

`.deck`（站点小字 + 菜单 / 音效两颗软键）是 `.screen` 的**兄弟节点**，写在它后面；而
`.screen` 带 `isolation: isolate`（CRT 三层质感要它，`styles/crt.css`），它因此是个**层叠上下文**
（`z-index: auto`），屏幕里那些模态的 `z-index: 200 / 220 / 240` 全被关在这一层里，**没资格**和
外面的元素比大小；底栏软键带 `.focusable` 的 `position: relative`（`z-index: auto`），与
`.screen` 同属「定位元素、z-index auto」那一档，于是**树序在后的赢** —— 真机实测
`elementFromPoint` 在软键位置上命中的就是软键本身。

`absolute` 的遮罩（暂停菜单 `.pause-mask`、登录框、音效询问）只铺满 `.screen` 的盒子，与底栏
**不重叠**，所以从前看不出问题；真正会露出来的是**铺满视口（`position: fixed`）的遮罩** ——
全站共四处：写作页 `/write` 的 `.sheet-mask`、外链管理页的 `.del-mask`、
`TextEditorDialog` / `PixelDialog` 的遮罩。其中写作页的窄屏预览是用户第一眼撞上的那处。

改法是给屏幕一个正数 `z-index`（`App.vue` 的 `.screen { z-index: 1 }`）：整块画面（含所有模态）
落到「正 z-index」那一层，压在底栏之上。**这是有意偏离样机的一行**，理由与代价都写在那一行
上面：样机自己那份没有它，是因为样机的模态全是 `absolute`、从不与底栏重叠；而 §28.10 已经
记下口径「遮罩盖住 `.deck` 属页内模态的正常代价」，一直没实现的就是这一行。底栏与屏幕不重叠，
**没有弹窗时外观与点击行为零影响**（真机实测：无弹窗时软键位置最上层就是软键，点一下照旧
弹菜单）。暂停菜单那三种 `absolute` 遮罩的关系**保持不变**（底栏照旧可见、可用），这是样机
的既有结构，不在本轮改动范围。

#### 28.12.3 用例（两条都先确认过「不改就会红」）

`write.spec.ts` 加两条（`write-preview-body` 是这轮新加的 `data-testid`）：

| 用例 | 钉住什么 |
|---|---|
| 窄屏预览面板滚得动（滚轮 + 方向键），关掉之后键盘不掉线 | 开面板后焦点就在 `write-preview-body`；滚轮 240px 后 `scrollTop > 0`；回顶后 `↓↓` 的增量只能来自键盘；`M` 切面板焦点跟着走（`.app`）；关面板后焦点仍在 `.app`、再 `ESC` 能起菜单 |
| 页内模态盖住外壳底栏，软键不再浮在遮罩之上 | 无弹窗时软键位置最上层是软键；预览面板开着时最上层是 `.sheet-mask`；**真按一下软键所在的坐标**：面板关掉、音效仍是 `OFF`（没被穿透）、暂停菜单没弹出；关掉弹窗后软键照旧点得到 |

反向确认（临时把修复撤掉跑一遍）：

- 去掉 `.screen { z-index: 1 }` → 第二条红在 `Expected substring: "sheet-mask" / Received: "softkey focusable mini"`
  —— 正是用户看到的那一层；
- 把 `inert` 挪回滚动容器 → 第一条红在 `expect(write-preview-body).toBeFocused()`（`Received: inactive`），
  焦点进不去，滚轮与方向键就都没有对象。

#### 28.12.4 验收

- `npm run check` **EXIT=0**（独立性 → tokens → 单测 70 passed → oxlint → eslint → 契约无漂移
  `sha256:c0a6332757d33c87` → vue-tsc）。
- `npx playwright test` **116 passed / 0 failed**（114 → 116，就是上表两条）。
- 真机（5175 + 8002，真账号 `icespark_admin`，900×720，只在编辑框里打字、不落稿）：
  滚轮 240px → `scrollTop 240`；`↓↓` → `scrollTop 74` 且焦点是 `preview-body.is-sheet`；
  弹窗开着时菜单 / 音效两颗软键位置的最上层元素都是 `DIV.sheet-mask`；按软键坐标点一下 →
  面板关掉、音效仍 `OFF`、菜单没弹；弹窗关掉后最上层回到 `BUTTON.softkey focusable mini`，
  点一下真的弹出菜单，`ESC` 收回。

## 29. 用户反馈（2026-10-01）：外链管理撤掉重复的「新建」入口

### 29.1 为什么它多余（用户口径：右上角那颗「新建」多余）

`/admin/links` 的表单面板头原本有一颗粒子按钮「＋ 新建」（`.panel-head` 右上角）。它对不上任何
一件事：

- 表单**天生就是新建态** —— `editingId === null` 时标题就是「新建外链」、提交按钮就是「新建外链」，
  刚进页面时它什么都不用做就已经是它的状态；
- 面板底下的**「清空」做的是同一件事** —— `link-reset` 与它共用一个 `startNew()`（清字段 +
  把光标放回名称框），两个按钮、一条实现；
- 它不是唯一的键盘入口：`Tab` 本来就进得了表单（本页没有标签栏，外壳把 `Tab` 还给浏览器）。

于是撤掉。**这是用户的直接裁定**，不是页面的自由发挥 —— 外链管理页属「样机没实现的页面」，
按硬要求 4 的规矩，形态变更以用户口径为准。

### 29.2 撤掉之后，输入模型的落点跟着改

那颗按钮原本是自定义焦点的第一格（`zone = 'new'`），撤掉它必须把落点一并收干净：

| 位置 | 从前 | 现在 |
|---|---|---|
| 挂载后 | 「新建」按钮带自绘光标（`is-focused`） | **没有自绘光标**（谁都没被选中，不假装选中） |
| 非卡片态按 `↓` | 进第一张卡的「编辑」 | 不变（这才是键盘进列表的入口） |
| 非卡片态按 `↑` | 回到「新建」 | **没有落点**，交还给外壳（页面不吃这个键） |
| 卡片首行按 `↑` | 回到「新建」 | **没有落点**，交还给外壳 |
| 非卡片态按 `ENTER` | 切到新建态（`startNew()`） | **什么也不做** —— 没有自绘光标就不该「替」谁按下去，回车照旧归浏览器 |
| 列表被删空 | `zone` 回「新建」 | `zone` 回非卡片态（`'form'`），没有卡片落点 |

`Zone` 类型随之从 `'new' | 'card' | 'form'` 收成 `'card' | 'form'`（`'form'` = 焦点不在卡片上：
表单字段里或外壳根节点上），`isNewFocused()` / `hoverNew()` 与那条 `.panel-head .btn { margin-left: auto }`
样式一起删掉。**新建态仍然到处可达**：进页面就是、编辑态点「清空」回得去、删掉正在编辑的那条也回得去。

### 29.3 用例与验收

- `admin-links.spec.ts` **9 → 10 条**：新增「编辑态按『清空』回到新建态（撤掉那颗按钮之后，入口只剩它）」；
  改写三条既有断言 —— 「新建一条」不再靠那颗按钮送焦点，改成「面板头没有按钮 + `Tab` 进名称框 +
  非卡片态回车什么也不发生」；「纯键盘走完全程」的起点从「新建」改成直接 `↓` 进第一张卡；
  「非超管」那条把「没有『新建』按钮」换成「没有表单 / 保存按钮 / 整个表单面板」。
- `npm run check` **EXIT=0**（单测 70 · oxlint · eslint · 契约无漂移 `sha256:c0a6332757d33c87` · `vue-tsc`）。
- `npx playwright test` **117 passed / 0 failed**（116 → 117）。
- 真机（5175 + 8002，真超管 `icespark_admin`，**只读**不写库）：面板头按钮数 0、真库 0 条外链走
  空态；空列表下 `↓` / `ENTER` 都没有反应也不报错；`Tab` 落进名称框能打字，「清空」把光标送回
  名称框且不发请求；底栏与页面正常，控制台零报错。

### 29.4 进度快照（2026-10-01）

| 维度 | 现状 |
|---|---|
| 阶段 | **P0–P6 全部已落地**（P0 §13 · P1 §14 · P2 §15 · P3 §17–§19 · P4 §20 · P5 §23–§24 · P6 §28）；**P7 未开工** |
| 路由 | 12 条（首页 / 文章 / 文章详情 / 关联 / 关于 / 用户主页 / 个人信息 / 站点设置 / 外链管理 / 审计日志 / 写作 / 404），视图 12 个共 11,181 行；`src/` 合计 25,968 行（`.ts` + `.vue`） |
| 样机覆盖率 | 旧前端 11 个视图全部有着落（§17 的 19 条偏差逐条记账；SearchResultsView / LoginView / MilkdownEditor 按用户裁定换形态或不迁） |
| 门 | 独立性 · tokens 生成物 · 单测（5 文件 / **70 条**）· oxlint · eslint · 契约漂移（63 paths / 89 operations / 50 schemas）· `vue-tsc` |
| e2e | 16 个 spec / **117 条**：a11y 4 · admin-audit 8 · admin-guard 4 · admin-links 10 · admin-site 9 · pages 11 · palette 4 · parity-keyboard 5 · parity-mouse 2 · pause 11 · profile 10 · shell 8 · site-config 2 · skeleton 7 · user-profile 7 · write 15 |
| P7 待办 | 字体子集化（§14.5）· highlight.js + DOMPurify `span` 白名单 · meta / JSON-LD / sitemap · axe 审计收口 · 预渲染 · 性能预算门 |
| 挂着的待裁定 | ①面板切换鼠标与键盘口径不对称（键盘可直切、鼠标要先关）②删除线要开 GFM `strikethrough`（动样机渲染器）③`PostListItem` 是否补 `group_id` ④`COMBO_ACTIONS` 是否放宽（`Shift+P` 之类） |

## 30. P7 首件：性能预算门 + 数据层收口（2026-10-01）

P7 六项里，**性能预算门**是唯一不需要先问设计的（它只测量、不改变样子），所以先落地；
同轮把 §24.6 挂着的那笔数据层账收掉。

### 30.1 性能预算门：`npm run check:budget`

`icespark/scripts/check-budget.mjs`（新增）量五件事，全部读 **`dist/` 构建产物**：

| 判据 | 基线（2026-10-01 实测） | 回归线 |
|---|---|---|
| 入口 JS 合计（`dist/index.html` 直接引的 .js） | 54.76 kB gz | 72 kB |
| 入口 CSS 合计 | 4.27 kB gz | 8 kB |
| 最大懒加载块（当前是 `MarkdownBody`，内含 markdown-it + DOMPurify） | 54.77 kB gz | 72 kB |
| 像素字体（`ark-pixel-12px-zh-hans.woff2`，未子集化） | 738.23 kB | 800 kB |
| `dist/` 总量（37 个懒加载块） | 1,226.13 kB | 2 MB |

- **它是回归线，不是产品指标**：数字取自当下实测 + 约 25% 余量。真正的目标（字体子集化到多大、
  入口 JS 压到多少）属于 P7 与预渲染一起定的事，等用户裁定后只改 `BUDGET` 一处。
- **gzip 口径**：脚本用 `zlib.gzipSync` 自己压（与部署侧的压缩近似），字体按原始字节（woff2 已压过）。
- **它是独立的第八段，而且自己先构建**：`check:budget` = `npm run build && node scripts/check-budget.mjs`
  （4~5 秒）。理由是不能读到**上次的陈旧产物** —— 若只读现成的 `dist/`，源码改了却忘了构建，
  门会拿旧数字给出假 PASS。所以它自己构建一次，然后挂到 `npm run check` 的最后一段；
  想让 `check` 不碰构建时，单跑 `npm run check:independence …` 那几段即可。
- **反例验证**：`node scripts/check-budget.mjs --selftest` 把「超线 / 贴线 / 字体超标」三种假数据
  喂给同一套判定函数，断言「应红 2 条、应绿 1 条」—— 证明门不是永远 PASS。
  实测：`npm run check` 现在八段，**EXIT=0**。

### 30.2 数据层收口：`resetPassword()`

§24.6 第 2 条记的是「`api/auth.ts` 缺一个 `resetPassword()`，页面直接用了 `client.request()`」。
本轮补上 `icespark/src/api/auth.ts`：`resetPassword(old, next)` —— `POST /api/auth/password/reset`，
参数走 **query string**、`body` 留空（参数塞进 JSON body 后端会当成缺少参数，与登录正相反）。
`ProfileView.vue` 里那段手写请求删掉、改调它，文件头那条「只能借 `client.request()`」的说明同步改写。

登录**仍然**留在 `stores/auth.ts`：`POST /api/auth/token` 要的是
`application/x-www-form-urlencoded` 表单体（`postJson` 只会 JSON 序列化），且登录要顺手写令牌并刷新
状态层 —— 那些副作用不属于数据层。这条取舍在 `src/api/auth.ts` 的文件头写明了。

`profile.spec.ts` 里「改密码：两次不一致在前端拦下不发请求；一致时参数走 query string 且 body 为空」
一条未改、照旧通过 —— 形状没变，只是搬了家。

## 31. 样机完整性审计（2026-10-01）：三个只读审计 + 按缺口补的五道门

硬要求 1 是「样机已实现的页面与交互**一个都不许遗漏**」。P3–P6 落地时逐轮记过账（§17.2 十六条、
§17.7 五条 D1–D5、§18–§28 各轮偏差），但**从来没有做过一次「照样机全量对读」的独立审计** ——
本轮补上，并且顺手把审计暴露出来的**验证缺口**变成门。

### 31.1 方法（可复核，全程只读）

三个只读审计员分头做，**只报告、不改任何文件**，所有结论都带 `文件:行号`：

| 审计 | 范围 | 判据 |
|---|---|---|
| A. 场景 | 样机 `src/scenes/` 六个场景 | 逐条对读 ① `<template>` 全文 diff ② 交互标记计数（`@click`/`@mouseenter`/`@wheel`/`@keydown`/`v-if`/`v-for`/`data-testid`/`focusable`）③ testid 集合 ④ `onPad` 动作名集合 |
| B. 组件与工具层 | 9 个 `ui/*.vue` + 9 个 `ui/*.ts` + `data/api.ts` + `router` + `App.vue` + `pixel.css` + `tokens.ts` | 逐个导出符号 / prop / emit / testid / 键盘动作 / localStorage 键 / CSS 变量名 |
| C. e2e 覆盖 | 样机 `e2e/{gates,smoke,round5,round6}.mjs` 的**全部 176 条 `check(...)`** | 在生产 `e2e/` 里找行为等价断言（不要求同名） |

### 31.2 六个场景：一致 97 / 有意偏差 35 / **缺失 0**

- 样机 6 个场景的 **26 个 `data-testid` 一个不少**（`home-post-*`、`group-*`、`tag-*`、`post-card`、
  `pager-*`、`page-dot-*`、`jump-*`、`chips`、`chip-*-*`、`actions`、`action-*`、`keybar`、
  `about-facts`、`links-grid`、`link-card` …），**两侧交互标记计数与 `onPad` 动作名集合完全一致**
  （13 种动作名计数逐项相等）。
- 唯一被删掉的两个分支是 `AboutScene`/`LinksScene` 的 `cancel → focusTabs()`，§25.1 已记账
  （用户口径：ESC 在每一页都能起菜单）。
- 35 条有意偏差全部能在 §16/§17/§18/§21/§25 找到依据，**没有一条是「样机有、生产没记账」**。

### 31.3 公共组件与工具层：一致 238 / 有意偏差 53 / **缺失 0**（另有 17 处有意新增）

- 样机 **6 个 `localStorage` 键**、**18 个 token CSS 变量名**、**17 个 `PadAction`**、
  **24 个 `KEYMAP` 键**、`pixel.css` 的 **28 个类选择器与 7 个 keyframes** —— 逐项核对，
  全部在 icespark 有同名或明确记账的对应物。
- 有意偏差 53 条按依据归类：§16.1/§16.2/§16.3（不迁 `usePad`/`focusIndex`/`DEMO_*`/`forceDemo` 等）、
  §17.2 的第 3/4/5/7/12/13/14/16 条、§15.4/§11.1（转场时序与路由机制改写）、§15.6、§26.1、
  §17.8-2、§25.1、§23/§24（管理页路径）、§18.1、§28.12.2。
- 有意**新增** 17 处（样机没有、生产需要）：aria 三件套、隐藏 `h1`、`.deck-footer` 站点小字、
  e2e 锚点 testid、`pageModalOpen`、`sticky-foot`、8 个半透明 token、`SCALE` 刻度等。
- 专项核查三条结论：**没有任何页面绕过数据层**（视图只 `import { ApiError }`；三处非 `api/` 的 HTTP
  都有记账：`stores/auth.ts` 登录、`config/site.ts` 三级配置、`api/upload.ts` 内部）；
  **浏览状态保留成立**（`viewKey` 不含 query → 列表不重建；`goPosts` 只在 `page>1` 时写参数；
  `goBackOrPosts()` 有历史就 `router.back()`）；**`cover.ts`/`prefs.ts` 逐字一致**。

### 31.4 样机 176 条断言 → 生产 e2e：已覆盖 46 / 等价替代 39 / 未覆盖 91

「未覆盖 91」听着吓人，逐簇看是**三类**：① 口径已变（未知路径→404、菜单行数 9→11、
「演示版路径提示」随 `/write` 变真页面而消失）；② 由别的门等价承担（axe、tokens、无 JS 报错、
localStorage 前缀的静态门 + 单测）；③ **真的没门**。第三类就是本轮要补的，按收益补了五道：

| 新门 | 补的是什么（原来只有样机有） |
|---|---|
| `e2e/list-paging.spec.ts` | 分页 / 跳页 / 筛选写 URL / 返回保留浏览状态 / 纯鼠标翻页（样机 round5 一整簇，生产源码早已实现却零 e2e） |
| `e2e/keyboard-journey.spec.ts` | 文章页与列表页的纯键盘旅程：`G`/`L`/`U`、芯片区、`↓` 退出操作条、TAB 严格按 DOM 顺序、Shift+TAB 反向、焦点自动滚进视野、正文站内链接回车不整页刷新 |
| `e2e/runtime-gates.spec.ts` | ① 运行期资源请求全部同源（376 条请求、外站 0）② localStorage/sessionStorage 键前缀的**运行时枚举门**（含反向自证：故意塞一个违规键，判定函数必须认得）③ 动效开关真的生效（`data-motion=off` + `animationName === 'none'`） |
| `e2e/shell-settings.spec.ts` | 设置弹窗**恰好 3 行**与负向行（无 `set-signal`/`set-source`）、菜单行列与登录前后差异、**登录失败展示后端 detail 原文**、刷新后登录态（含 `/api/auth/me` 404 时反向登出） |
| `e2e/terminology.spec.ts` | **术语门**（样机 `gates.mjs` 第 3 节「用户要求第 1 条」）：六个页面的可见文本里都不许出现 18 个游戏术语；外加「减动效下自检照落主页、切页照样能用」 |
| `e2e/md-and-pixels.spec.ts` | markdown 渲染（标题 / 代码块 / 表格 / 站内链接）+ 设计系统像素事实（屏幕白底、卡片 3px 边框、无封面卡另一套版式、焦点光标 8px 蓝块 `blink-step`、焦点不加粗不加 outline、keybar 常驻、旧左侧竖列不回来） |
| `e2e/a11y-audit.spec.ts` | 整站 axe 收口（12 条路由 + 3 个外壳模态，放行清单只有 `e2e/a11y-known.ts` 一份）+ `/about` 那条结构性放行的**补偿断言**（见 §33） |
| `e2e/chip-navigation.spec.ts` | 首页三个芯片区都在；列表栅格方向键按**视觉相邻**走（↓ 到下标 2 而不是 1）；筛选条是单行横滚、焦点芯片滚进视野；已选中芯片被聚焦时底色确实变了；`↑` 顶到标签栏 → `→` 换页签 → `ENTER` 进 `/links` |

**第二条兜底账**：`scripts/check-independence.mjs` 的头注释写着「键名写在常量里再由常量传进去的情况，
靠 P2 的运行时门（枚举 localStorage）兜底」—— 那道兜底此前**不存在**，本轮由
`runtime-gates.spec.ts` 的 B 组补上，注释承诺与实现终于对齐。

### 31.5 审计查出的一个真缺陷（**待用户裁定**，不擅自改）

**现象**：`/post/:key` 打不开（已删除 / 改过标题 / 深链接敲错）时，页面**永远停在「读取正文 …」**。

- 证据（真机探针，5175 + 8002）：`goto('/post/definitely-not-a-real-key-7f3a')` 后等 2.5 秒，
  屏幕文本仍是 `文章 · 未分组 / ▌ 读取正文 …`，**没有任何错误或空态文案**。
- 根因：`stores/content.ts` 的 `loadPost()` 失败时把 `post` 置 `null`、`dataSource` 置 `'demo'`；
  而 `PostDetailView.vue` 只按 `!post` 分支渲染加载行，**从不读 `dataSource`**。
- 为什么会这样：样机在同样情形下渲染的是 `DEMO_POST`（样张兜底），所以**样机没有 error 态**；
  §16.2 裁决「样张一律不迁」之后，这条路径就漏成了死循环观感 —— 是**裁决的直接后果**，不是谁写错。

**为什么不当场修**：样机没有这个交互，按硬要求 4「样机尚未实现的交互必须先与用户交流确认再实现」，
这是**新增设计**（§16.5 规则 2 也禁止迁移时自行发明）。建议形态（与用户档案页的 `user-missing`
同款，已有先例）：正文区换成页内空态「这篇文章不存在或已被删除」+ 两行自绘焦点动作
「返回列表 / 回主页」，并让底栏 `● LIVE / ○ DEMO` 保持 `demo`。等一句话裁定即可落地。

### 31.6 顺手修掉的两笔小账

1. `machine/PauseMenu.vue:493`、`:697` 把「提示行去掉 `blink`」的依据写成 **§26.2**，
   文档里实为 **§26.1**（§26.2 是「登出后回主页」）—— 注释改正。
2. **一处此前没记账的差异**：样机 `router/index.ts` 明确写 `scrollBehavior: () => false`
   （屏内滚动归 `.screen-inner`），生产改成 `savedPosition / { top: 0 }`。生产版 document 本身
   不滚动（`.app` 100vh + `overflow: hidden`），观感无差，且对「刷新/前进后退恢复位置」更友好 ——
   **属有意偏差，记在 §31 这里**（不另开一节）。
3. 口径澄清：此前口头常说「§17 的 19 条偏差」，准确数是 **§17.2 的 16 条 + §17.7 的 5 条 = 21 条**。

## 32. 审计顺出来的四个真缺陷（2026-10-01）：三条是键盘，一条是样机口径

§31 的三个审计员之外，本轮还派了五个 agent **给缺口补门**。补门的过程里撞出**四个真实产品缺陷**
（写用例的人先按 `test.fail` 标成「预期失败」让套件保持绿，修完再转正 —— 这正是那种标注的用途）。
四个都已修：

### 32.1 跳页框：一下 ESC 不关框（样机冻结口径被 §28.11 打破）

- **现象**：`/posts` → `J` 开跳页框 → 按一下 `ESC`，框**还在**（要按第二下才关）；两下都不叠菜单。
- **根因**：§28.11 把「编辑框里的 ESC」统一改成「先失焦」（用户裁定），内核在
  `input/index.ts` 的 `isEditableTarget` 分支里 `preventDefault()` + `focusShellRoot()` 后**直接 `return`** ——
  于是 `PostListView.vue` 里那段「跳页框开着时吃掉 ESC」成了**死代码**。
- **改法**：跳页输入框自己挂 `@keydown.esc.stop="closeJump"`（`.stop` 让这一下到不了外壳，
  内核根本没机会拦）。依据是**既有先例**：§28.11 的表格里 `TextEditorDialog` 就是「弹窗自己有一条
  局部规则」而不受内核影响 —— 一个临时小框不该套用「正文编辑器」的失焦语义。
- **样机依据**：`design/icespark-prototype/e2e/round5.mjs`「跳页框 ESC 只关框不开菜单」。

### 32.2 焦点掉回 `body` → 整块键盘失灵（同一类坑的第三次，这次收进内核）

- **现象**（两处，同一根因）：
  1. `J` → 输页码 → 回车（**确实跳页了**）→ 之后 `PgDn` / `P` / `J` 全部没反应，得先用鼠标点一下；
  2. 点场景头那颗 `✕ 清除`（`v-if="activeFilterLabel"`）清掉筛选 → 同样整块键盘失灵。
- **根因**：这两处**被卸载的正好是当时持有原生焦点的节点**（跳页输入框、清除按钮自己），
  浏览器把焦点丢回 `body`；而外壳的 `keydown` 挂在**外壳根节点**上，`body` 上的按键不经过它 ——
  正是 §21 记的那条坑（§28.11.3、§28.12.1 各踩过一次，都是逐点补 `focusShellRoot()`）。
- **改法（这一次是统一的兜底，不再逐点补）**：输入层新挂 `document` 上的 `focusout`（**捕获**阶段，
  因为卸载后那次 focusout 的目标已脱离文档、靠冒泡收不到），推迟一个 tick 后判两件事：
  ①原来持有焦点的节点**已不在文档里** ②焦点此刻真的空在 `body` 上 —— 两条都成立才把焦点收回外壳。
  - 为什么不能当场判：实测那一刻 `document.contains(target)` 仍是 `true`（Chrome 在移除过程中就派发
    focusout），`activeElement` 也已经是 `body`，**这两个信号单独用都会误伤**；
  - 为什么用「节点已不在文档」而不是「焦点 = body」：用户去点地址栏时 `activeElement` 同样是 body，
    但那个节点还在文档里 —— 加这一条才不会把焦点从地址栏抢回来。
- 既有的显式 `focusShellRoot()` 调用**照旧保留**：它们更早（同一时刻就收口）、语义也更具体。

### 32.3 文章页 TAB 不再按 DOM 顺序遍历（§21 的修法带出来的回归）

- **现象**：文章详情页连按 `TAB`，焦点**永远停在第一个落点**（第一枚分组芯片），到不了操作条、
  也到不了正文链接 —— 样机第六轮冻结的「文章页 TAB 严格按 DOM 顺序遍历」在生产页整体失效。
- **根因**：`PostDetailView.vue` 的 `onPad` 在分支之前**对每一个动作**都调 `dropNativeFocus()`，
  `tabNext` / `tabPrev` 也是动作之一；而 `focusShellRoot()` = `.app.focus()` 会把浏览器的
  **顺序焦点导航起点**（sequential focus navigation starting point）挪到 `.app` 上，
  于是下一次 `TAB` 又从文档里第一个可聚焦项重新开始。
  样机当年用 `blur()`（焦点落 `body`）**不会**挪动这个起点 —— §21 为了修「焦点掉 body 后键盘失灵」
  把它换成 `focusShellRoot()` 时，把这条口径一起带走了（真正的回归点）。
- **改法**：`tabNext` / `tabPrev` 在 `dropNativeFocus()` **之前**直接让路返回（把 TAB 还给浏览器，
  与 `App.vue` 里「文章页没有标签栏 → TAB 交给浏览器」那条注释同一口径）。
- **真机实测**：`TAB` 序列 `chip-group-0 → chip-tag-1 → action-like → action-comment`（修复前是
  `chip-group-0 → chip-group-0`）。

### 32.4 验收

- `npx playwright test`：**155 passed / 0 failed**（117 → 155，本轮新增 38 条）。
  新增的六个 spec：`list-paging` 9 · `keyboard-journey` 7 · `md-and-pixels` 11 ·
  `shell-settings` 6 · `runtime-gates` 3 · `terminology` 2。
- 四个缺陷的用例先以 `test.fail` 记录（证明门不是空转），修完自动翻红 → 删掉标注转正。
- `npm run check` **EXIT=0**（八段，含性能预算门：入口 JS 54.83/72 kB、字体 738.23/800 kB、
  总量 1,226.43/2,048 kB）。
- 真机（5175 + 8002，真库 12 篇文章 / 分组「工程实践」）：
  跳页框一下 `ESC` 关掉且无菜单；跳页回车后 `activeElement = app`、`PgUp` 回到第 1 页；
  点「清除」后 `activeElement = app`、`PgDn` 翻到第 2 页；文章页 TAB 序列按 DOM 顺序走。
- 仍然挂着**一条待用户裁定**的缺陷：§31.5 的「`/post/:key` 打不开时永远停在『读取正文 …』」——
  样机没有这个交互，属于新增设计，不擅自实现。

## 33. P7 第二件：axe 审计收口（2026-10-01）

P7 六项里的「axe 审计」原话只有四个字，落地前先把现状量了一遍：**每页的 spec 各扫一次**
（`a11y.spec.ts` + 四张管理页 + `profile` / `write` / `user-profile`），但放行清单被抄了**四份**
（`a11y.spec.ts` 的 `KNOWN_*`、`admin-links` 的 `known[]`、`profile` 的 `KNOWN_CONTRAST`、
`write` 的 `KNOWN`），而且各页判的**松紧不一**（`admin-site` 只判 critical 级、
`admin-audit` 只按规则 id 过滤）。收口做三件事：

### 33.1 先量：全路由**不带任何排除**跑一遍 axe

一次性把 12 条路由 + 3 个外壳模态全扫，原始结果是**三类**违规，没有第四类：

| 违规 | 级别 | 命中点 | 性质 |
|---|---|---|---|
| `color-contrast` | serious | 只有 `.deck-src` / `.is-copyright` / `.is-slogan` / `.is-icp`（底栏小字），每页 3 处 | 用户裁决保留的样式（样机定稿就是淡色小字） |
| `heading-order` | moderate | 只有 `.post-title`（首页）/ `.card-title`（列表）：h1 → h3 | 样机卡片标题就是 h3，改 h2 等于改样机 DOM |
| `scrollable-region-focusable` | serious | 只有 `/about` 的 `main.screen-inner` | 结构性的：关于页是纯静态正文，屏幕里一个可聚焦元素都没有 |

量出来的结论有两条比数字本身重要：①**底栏小字的对比度是唯一一类全站性违规**，
说明「屏幕里的内容」这一层是干净的；②`scrollable-region-focusable` **只出现在 `/about`**，
其它页因为屏幕里有按钮 / 卡片 / 链接而不触发。

### 33.2 收口：清单只留一份，且判定落到**节点级**

新增 `icespark/e2e/a11y-known.ts`：

- `KNOWN_CONTRAST_TARGETS`（四处底栏小字）、`KNOWN_HEADING_TARGETS`（两种样机卡片标题）、
  `KNOWN_SCROLLABLE_TARGETS`（`.screen-inner`），每条旁边写着**为什么放行**；
- `scanViolations(axeResult)` 返回 `{ violations, allowed }`，判据是**节点级**的 ——
  同一条规则里只有清单内的那些节点被放行，所以「放行底栏对比度」不会顺手放行页面里
  新出现的对比度问题（这是收口相对旧写法的实质改进，不是搬家）；
- `a11y.spec.ts` / `admin-links` / `admin-site` / `admin-audit` / `profile` / `user-profile` / `write`
  **七处全部改用它**，各自的数组与 `isKnown` 删掉。`admin-site` 原先只判 critical 级、
  `user-profile` 原先把对比度整类放过 —— 现在七页一个口径。

### 33.3 补齐：整站收口门 + 给唯一那条「结构性放行」配补偿断言

新增 `icespark/e2e/a11y-audit.spec.ts`（3 条）：

1. **公开路由**（`/` `/posts` `/links` `/about` `/nope-404` `/nope-404/deeper` + 文章详情 + 用户主页，
   后两者按 `pages.spec.ts` 的口径探不到数据就跳过那一格）逐页扫描，清单外的违规一律红。
2. **登录态五页 + 三个外壳模态**（`/profile` `/admin/site` `/admin/links` `/admin/audit` `/write`
   + 暂停菜单 + 设置弹窗 + 登录弹窗；登录弹窗必须在**匿名**页面上开，登录态那一行的动作是登出）。
3. **`/about` 那条放行要有等价的键盘路径**：先断言「这一页确实比屏幕高」且「可滚动容器里确实
   没有可聚焦元素」（否则这条断言是空转），再断言 `↓` 与 `PgDn` 真的滚得动 —— 关于页自己接管
   `↑↓` / `PgUp PgDn`（`AboutView.vue` 的 `onPad` → `scrollScreenBy`），这就是那条放行的代价等价物。
   **不给 `.screen-inner` 加 `tabindex="0"`** 的理由也写在这里：那会让每一页的第一个 Tab 落点
   变成整块屏幕，直接改掉样机冻结的「TAB 按 DOM 顺序遍历」（§25.1，§32.3 刚守过它）。

### 33.4 验收

- `npx playwright test`：**163 passed / 0 failed**（155 → 163：收口门 3 条 + 芯片/栅格导航 5 条；22 → 24 个 spec）。
- 七处放行清单合并成一份，且**判得更严**：`admin-site` 从「只判 critical」升到节点级清单，
  `user-profile` 从「放过整类对比度」升到节点级 —— 两个都没红出来新问题。
- `npm run check` **EXIT=0**（八段）。

## 34. 补上「真实登录链路」这道门（2026-10-01）

§31.4 的覆盖审计里有一条很扎眼：**`POST /api/auth/token` 这条真链路一次都没有机器守过**。
全站 24 个 spec 走的都是 §23.4 那套自我约束 —— 伪造 `synthspark-token` + 打桩 `/api/auth/me`
（好处：不依赖真账号密码；代价：表单体形状、令牌落盘、`/api/auth/me` 校验、菜单随权限变化
这四件事全靠人工看）。§D-cluster 里被标成「未覆盖」的几条（真实登录成功、普通用户 / 超管
两种菜单、刷新后仍登录态）根子都在这。

### 34.1 做法：凭据从环境变量来，没有就跳过

新增 `icespark/e2e/real-login.spec.ts`，手法照后端 `tests/test_smoke.py`：

```bash
cd icespark
ICESPARK_E2E_USER=xxx ICESPARK_E2E_PW=yyy npx playwright test e2e/real-login.spec.ts
```

- **文件里不写任何账号密码**（只读环境变量）；没设就 `test.skip`，是**跳过**而不是假绿 ——
  默认套件因此是 `163 passed / 3 skipped`，CI 想跑真链路就带上环境变量。
- 断言刻意**与角色无关**（普通用户 / 超管都能跑）：登录框关闭、账号行显示「退出登录（昵称）」、
  昵称与 `/api/auth/me` 一致、菜单行数 ≥ 8、`edit` / `profile` 两行出现；
  只有「有没有四张管理页入口」这一条按 `/api/auth/me` 的 `is_superuser` **分支**判。
- 三条用例：① 表单编码 + 令牌真的能用（抓真请求断言 `application/x-www-form-urlencoded`
  且 body 不是 JSON；再用页面里那把令牌换一次 `/api/auth/me`，必须 200 且昵称对得上）
  ② 刷新后登录态还在（**后端校验出来的**，不是本地瞎认）③ 登出后菜单回 6 行、
  本地两把键都被清空、键盘还活着（`ESC` 能关菜单）。

### 34.2 真机验收（5175 + 8002，真账号 `icespark_admin`，`is_superuser = true`）

`3 passed (5.8s)`：请求体是表单编码、不是 JSON；登录后账号行 = 「退出登录（演示管理员11111）」
且与 `/api/auth/me` 一致；四张管理页入口按超管身份出现；刷新后仍是登录态；
登出后 `synthspark-token` 与 `synthspark-icespark-user` 都为 `null`、菜单回到未登录形态、
`ESC` 照常关菜单。不带环境变量时 `3 skipped`，套件仍全绿。

## 35. 硬要求 3 的逐场景门（2026-10-01）

硬要求 3 的原话里有三个「所有」：站点小字放在外壳底栏 `.deck`、**位于软键左侧**、
**所有场景常驻（含开机自检与 404）**。`shell.spec.ts` 守的是底栏的**结构**（`.deck` 与
`.screen` 同级、不在框里、子元素顺序、贴底几何）与「404 也有小字」，但「十二条路由 + 自检
逐格都在」这件事一直只有抽查。新增 `icespark/e2e/deck-always.spec.ts`（2 条）补齐：

1. **开机自检那一格**（自检不是路由，最容易漏）：`goto('/')` **不等 `booted`**，
   先断言 `.app[data-scene="boot"]`，此刻 `.deck` / `.deck-footer` 已在、小字非空、
   位于软键左侧；等自检播完落到主页后**再读一次，两次逐字相同**。
2. **十二条路由逐格走**（`/` `/posts` `/links` `/about` `/nope-404` `/profile` `/admin/site`
   `/admin/links` `/admin/audit` `/write` + 探测到的文章详情；登录态页面用打桩超管），每格断言：
   ① `.deck` 与 `.deck-footer` 可见、小字非空；② `.deck-footer` 的右边缘不越过 `.deck-keys`
   的左边缘（**在软键左侧**这条用户口径的机器口径）；③ 十几种页面上小字**逐字一致**
   （它是外壳级内容，不该随页面变）；④ 全站 `footer` 元素计数为 0 —— 不做传统页脚区块。

验收：`2 passed`；全量 **165 passed / 3 skipped**（168 条），`npm run check` 八段 **EXIT=0**。

## 36. 产物冒烟门：第二个 Playwright 项目跑 `vite preview`（2026-10-01）

P1 收尾时做过一次**人工**产物验证（§14.6：「`npm run build` 后用 `vite preview` 实测渲染、
`data-scene`、状态行内容、字体加载、3px 边框、零 4xx」），此后所有 e2e 都跑在 **dev 服务器（5175）**
上 —— 也就是说「dev 全绿」被当成了「能上线」。dev 与产物是两套东西，至少有四类差异只在产物里成立：

1. **SPA 回退**：深链接刷新 `/posts`、`/about` 要靠服务端把 index.html 交回来；
2. **hash 文件名与按路由切分的懒加载 chunk**：每个视图一个 chunk，首屏只下入口；
3. **静态资源路径**：`/fonts/*.woff2` 是 `public/` 直出，打包后路径变了会静默退回系统字体；
4. **「跑的是产物而不是源码」**：`/src/*.ts` 与 `/@vite/*` 的请求必须一条都没有。

### 36.1 做法：第二个 project + 第二条 webServer

- `playwright.config.ts`：`projects` 变成两个 —— `chromium`（`testIgnore: production.spec.ts`，
  跑在 5175 的 26 个 spec）与 **`preview`**（`testMatch: production.spec.ts`，
  `baseURL: http://localhost:4175`）；`webServer` 变成数组，第二条是
  `npm run build && npx vite preview --port 4175 --strictPort`。
  - **命令里带构建**、且 `reuseExistingServer: false`：复用旧服务就会拿旧产物给假 PASS；
    端口被占直接失败（那本来也该先收拾现场）。
- `vite.config.ts`：`preview` 补上与 `server` 同一份 `proxy`（`/api` → 8002）。
  部署时 `/api` 由反向代理分流（AGENTS.md 第 9 节），本地 preview 要验证**产物**就得同样能打到真后端；
  这条只影响 `vite preview`，不影响构建产物本身。

### 36.2 `e2e/production.spec.ts`（5 条）

| 用例 | 钉住什么 |
|---|---|
| 自检播完落主页、外壳三段与底栏小字都在 | 产物里 boot → 落页、`.screen`/`.deck`/小字、**像素字体真的加载**（`document.fonts.check('12px ArkPixel')`）、零控制台报错 |
| 跑的是打包产物 | 全程收集请求：**零** `/src/` `/@vite/` `/@fs/` `?t=` 请求；所有 `/assets/*` 都是带 hash 的 `.js/.css`；列表页确实下了自己的懒加载 chunk |
| 真 URL 与 SPA 回退 | `/about` 刷新式直达（`data-scene=about`）；`/no/such/deep/path` 落**前端自己的 404 皮肤**（不是服务器 404 页） |
| 切页 / 菜单 / 转场 | 键盘 `Tab` 切页、`P`/`ESC` 开关菜单、转场遮罩能收（产物里的 keyframes 还在） |
| `/api` 代理 | `preview` 下 `/api/site-config` 仍是 200 —— 显式守住 `preview.proxy` 这一条配置 |

### 36.3 反例验证（证明门不是空转）

把 `preview` 项目的 `baseURL` 临时改回 5175 再跑第一条：**红**在
「产物里出现了只在 dev 才有的请求：`/@vite/client`、`/src/main.ts`、`/src/App.vue`」——
正是这道门要拦的那类差异。验完已还原配置。

### 36.4 验收

- `npx playwright test`：**170 passed / 3 skipped**（173 条 / 27 个 spec；其中 `preview` 项目 5 条跑在产物上）。
- `npm run check` 八段 **EXIT=0**（独立性门会把新加的 `e2e/production.spec.ts` 一起扫）。
- 代价记明白：整套 e2e 现在多起一个「构建 + preview」服务，约 +8 秒；
  只跑 dev 那套可以用 `npx playwright test --project=chromium`。

## 37. 逐页的纯鼠标门：把「输入等价性」从外壳铺到页面（2026-10-01）

硬要求里那条「**单独用鼠标或单独用键盘都能完成全部交互**」此前只有两半：
`parity-keyboard.spec.ts`（断言鼠标一次没动过）与 `parity-mouse.spec.ts`（断言 keydown 一次没发生过），
但**两道门都只覆盖外壳**（软键、音效询问、底栏）。页面里的鼠标路径散在各页 spec 里，
多数只是「点了一下」，**没有任何一处证明「这一整段旅程里一次键盘都没按过」**。

这是真会出事的地方：鼠标路径与键盘路径走的是**两套入口**（原生 `click` 事件 vs 手柄层派发的
`PadAction`），历史上两者都出过偏差；鼠标还会踩到只有鼠标才触发的分支 ——「划过共享焦点（静音）」
「点不可聚焦空白处把焦点交回外壳」「点完自己就卸载的按钮」（§32.2 那一类）。

新增 `icespark/e2e/parity-pages.spec.ts`（4 条，每条装一个 `keydown` 记录器、全程只用
`page.mouse` / `click()` / `hover()`、收工断言记录器为空）：

| 用例 | 一段纯鼠标旅程 |
|---|---|
| 首页 → 文章 → 返回 | 划过卡片 → 点进详情（`md-body` 在）→ 点操作条的「返回」→ 回到来的那一页 |
| 文章页三项鼠标操作 | 点赞（点一下「已点赞」、再点回「点赞」）→ 点开评论对话框 → 点「✕ 关闭」 |
| 列表页筛选 | 点分组芯片（URL 带 `group=`、芯片 `on`）→ 点「✕ 清除」（它点完会卸载自己）→ 点卡片进文章 |
| 管理页读写 | 点「编辑」（表单被现值填满）→ 改一个字段 → 点「保存修改」（真的发 `PUT`） |

同源的两条口径：与 `parity-keyboard.spec.ts` 对称（那边断言鼠标零使用）；需要数据的地方一律打桩。

### 37.1 反例验证

在第一条旅程末尾故意插一下 `page.keyboard.press('Escape')`：门立刻红在
「纯鼠标旅程里出现了按键：Escape」—— 记录器与判定都不是空转，验完已逐字还原。

### 37.2 写这道门时踩到的两个坑（都记在用例注释里）

1. **音效询问是「首次手势」触发的模态**：管理页那条一开始漏写
   `synthspark-icespark-sound-prompt`，Playwright 的第一下点击正好被它吃掉 ——
   卡片按钮其实没被点到，表现却是「点了编辑但表单没填」。凡是要点东西的用例都得先写这个标记。
2. **芯片 testid 用的是分组名**（`frowGroups` 里 `key: g.name`），不是分组 id；
   夹具里写 `group-g-1` 会一直等一个不存在的元素。

### 37.3 验收

- `npx playwright test`：**174 passed / 3 skipped**（177 条 / 28 个 spec，含 `preview` 产物项目 5 条）。
- `npm run check` 八段 **EXIT=0**。

## 38. 铁律「无 hover」的守卫：划过 == 键盘选中（2026-10-01）

样机定稿里有一条容易读歪的铁律：**无 hover**（列表 / 卡片；外壳软键照样机保留 hover）。
它**不是**「全站不许出现 `:hover`」—— 按钮 / 芯片 / 链接的 `:hover` 反馈是给鼠标用户的正常
反馈（全站 14 处，都是真控件）。它管的是**列表项与卡片容器**：鼠标划过时该做的事只有一件，
**移动那个共享焦点光标**（键盘方向键移动的是同一个光标）。换句话说：

> 一张卡片「被划过」的样子，必须**恰好等于**它「被键盘选中」的样子。

新增 `icespark/e2e/no-hover.spec.ts`（2 条），两半一起守：

1. **运行期**（真正管用的那一半）：拿**同一张**卡片比三种状态的计算样式签名
   （背景 / 边框色宽 / outline / transform / filter / opacity / box-shadow）——
   划过 == 键盘选中，逐项相同；同时断言「未聚焦 ≠ 聚焦」（否则光标是假的，门就空了）。
   只比同一张卡是有原因：不同卡片可能有无封面等类名差异，拿两张不同的卡对照会把
   **版式差异**误判成 hover 差异。
2. **选择器层**：直接扫 `src/` 的 `.vue` / `.css` 源码，断言 `:hover` 选择器里**不出现**
   卡片 / 列表容器类（`card` / `post-card` / `link-card` / `admin-link-card` /
   `user-post-card` / `post` / `list` / `grid` / `row`），并把放行的真控件选择器数一并断言
   （反向自证：门不是「因为没有 `:hover` 才过的」）。

### 38.1 反例验证（注入后两半都红）

临时在 `PostListView.vue` 的 `<style scoped>` 里加一条 `.card:hover { outline: 2px solid var(--spark) }`：

- 选择器层红在 `src/views/PostListView.vue → .card:hover（命中容器类：card）`；
- 运行期红在「卡片划过时的视觉必须与键盘选中时完全一致」。

验完逐字还原。

### 38.2 两个必须记下来的坑（都写进了用例注释）

1. **8bit 阶梯过渡会骗过 `getComputedStyle`**：全站 `transition: all 0.16s steps(4)`，
   状态一变立刻读拿到的是**过渡起点那一档** —— 直接读会把「焦点真的变了」读成「没变」。
   读之前要等一次过渡（250ms）。芯片导航那道门（§37 同期）踩的是同一个坑。
2. **指针没挪开时，这一半会退化成空转**：第 ③ 步若直接用键盘把光标移回第 0 张，
   而鼠标**还停在那张卡上**，读到的是「键盘焦点 + hover 叠加」的样式，
   于是注入的 `.card:hover` 照样绿。必须先 `page.mouse.move()` 把指针挪开 ——
   实测确认过这一步的必要性（不挪指针时注入反例，运行期那一半确实是绿的）。

### 38.3 验收

- `npx playwright test`：**176 passed / 3 skipped**（179 条 / 29 个 spec）。
- `npm run check` 八段 **EXIT=0**。

## 39. 逐页纯键盘门：与 §37 对称的另一半（2026-10-01）

§37 把「纯鼠标」铺到了页面，这一轮补对称的另一半：**逐页的纯键盘旅程**。
`parity-keyboard.spec.ts` 守的是外壳（音效询问、软键、Tab 交还浏览器、文章页 TAB 顺序），
各页 spec 里的键盘用例也不少，但同样**没有一处逐页证明过「这一整段旅程里一次指针事件都没发生」**。
键盘路径还独有几条容易坏的：按键被 `preventDefault` 吞掉、`inputLocked` 期间只放行 START、
`focusZone === 'tabs'` 时场景收不到方向键、原生 Tab 与自绘光标抢焦点（§32.3 那一类）。

新增 `icespark/e2e/parity-pages-keyboard.spec.ts`（5 条）：每条装一个**指针记录器**
（只记 `pointerdown` / `pointerup` / `mousedown` / `mouseup`，**不记 `click`** ——
键盘按回车时浏览器同样派发 click，把它算进来会把回车误判成鼠标），全程只用 `page.keyboard`，
收工断言记录器为空：

| 旅程 | 按键序列要点 |
|---|---|
| 首页 → 文章 | `→`/`←` 在最新文章区移动（共享光标）→ `ENTER` 进详情 |
| 列表页筛选 → 文章 → 回列表 | `G` 进分组行 → `→` 到目标分组 → `ENTER` 筛选 → `↓↓`（分组行 → 标签行 → 栅格）→ `ENTER` 进文章 → `Q` 回**筛选后**的列表 |
| 文章页返回 | `L` 进操作条 → `→→` 到「返回」→ `ENTER`（深链接无历史 → 兜底回列表，且带上文章的分组，样机口径） |
| 个人页改昵称保存 | 原生焦点进昵称格 → `Ctrl/⌘+A` → 打字 → `ESC` 让焦点回外壳（§28.11 口径）→ `↓↓` 落在「保存」→ `ENTER`（真的发 `PUT`） |
| 外链管理页改一条 | `↓` 进卡片动作区 → `ENTER` 编辑（`startEdit()` 已把光标放进名称框）→ `Ctrl/⌘+A` → 打字 → `TAB×4` 到「保存修改」→ `ENTER`（真的发 `PUT`） |

### 39.1 反例验证

在第一条旅程末尾故意 `page.mouse.down(); page.mouse.up()`：门立刻红在
「纯键盘旅程里出现了指针事件：pointerdown, mousedown, pointerup, mouseup」，验完逐字还原。

### 39.2 写这道门时问出来的三件事（都写进了用例注释）

1. **列表页光标初值是栅格（`zone = 2`）**，`G` 才回到分组行；从分组行下到卡片要按**两下** `↓`
   （0 分组行 → 1 标签行 → 2 栅格）—— 一下只到标签行。
2. **个人页动作行的行序是 `back / avatar / save / password`**（没有头像时 `removeAvatar` 不出现），
   光标起点 0，所以 `↓↓` 才是「保存」；按三下会落到「改密码」，回车什么都不会发生。
3. **外链管理页进编辑态时光标已经在名称框里**（`startEdit()` 的 `nextTick(() => nameEl.focus())`），
   不用自己去 Tab 找；从名称框到「保存修改」正好 `TAB×4`（名称 → 链接 → 配图 → 排序 → 保存）。

### 39.3 验收

- `npx playwright test`：**181 passed / 3 skipped**（184 条 / 30 个 spec）。
- `npm run check` 八段 **EXIT=0**。

## 40. 硬要求 2 的覆盖面：页脚小字进配置门 + 一处「可编辑但到不了屏幕」的发现（2026-10-01）

`site-config.spec.ts` 原先只核了两处：**首页与标签栏**、**关于页**。硬要求 2 列的
「文案 / 导航 / 页脚 / 首页与关于内容 / 站点信息 / 外链」里，**页脚**一直没进这道门。
本轮补上，并把「站点信息 / 外链」那一格查清楚了（结论见 §40.2）。

### 40.1 页脚小字：覆盖层给了什么就显示什么

新增第 3 条用例（`site-config.spec.ts` 末尾），口径与文件头一致 —— **不断言具体字**，
而是从运行期取当前生效的最高优先级覆盖层，再核对渲染结果。三段各有自己的规矩：

| 覆盖层给的 | 底栏那一段应当 |
|---|---|
| 非空串（`footer.copyright` / `footer.slogan` / `site.icp`） | 逐字等于它（版权带固定的 `© ` 前缀） |
| 空串 | **不出现**（`deepMerge` 里基本类型直接覆盖，空串不会退回默认值） |
| 没给这个字段 | 不归这道门管（生效的是内层 / 内置默认，由单测守） |

顺带把「段间分隔符只在真的有两段以上时出现」也断言了（段数 - 1 个 `.deck-dot`），
免得哪天冒出一个孤零零的 ` · `。

**反例验证**：临时把 `footerSegments()` 里的口号改成硬编码串 → 门立刻红在
`Expected: "多智能体博客系统 · Agent 独立创作" / Received: "硬编码口号"`，验完逐字还原。
（注意这道门**改覆盖层是不会红的** —— 它比的是「渲染 == 覆盖层」，两边同时变仍然相等；
要红必须动渲染那一侧，这正是反例该改的地方。）

### 40.2 发现：五个可编辑字段到不了屏幕，其中一个是死分支

顺手把「谁在消费配置」查了一遍（`grep` 全仓 + 读渲染点），结论按字段列在这里 ——
这不是缺陷，是**待用户裁定的口径问题**：可编辑的东西得真的能到屏幕上，否则管理页给了个
「能改但改了没反应」的假旋钮。

| 配置字段 | 消费点 | 说明 |
|---|---|---|
| `home.*` / `about.*` / `navbar.navItems` / `footer.copyright` / `footer.slogan` / `site.icp` | 有（已进配置门） | §40.1 与既有两条用例覆盖 |
| `site.name` | **1 处，且到不了屏幕** | 只出现在 `App.vue` 的 `shellHeading` 兜底：`sceneDef(id)?.hint ?? site.config.site.name`。而**每个场景要么有 `hint`，要么在 `SELF_TITLED_SCENES` 里**（自出 h1、外壳不发隐藏 h1），所以这条兜底是死分支 |
| `site.title` / `site.description` | **0 处** | 只在配置类型 / 内置默认 / 管理页字段标签里出现。浏览器标签页标题目前是 `index.html` 里写死的 `SYNTHSPARK`（P7 的 meta 那一项） |
| `site.logo` / `navbar.logo` | **0 处** | 8bit 外壳的品牌位就是底栏与标签栏，样机里没有 logo 位；`NotFoundView` 的注释也写明「不搬左上角品牌位」 |
| `footer.links` | **0 处** | 底栏按硬要求 3 只刻一行小字（三段），链接组结构没有被任何组件消费。`src/config/__tests__/site.spec.ts` 的注释里已注明「`footer.links` 那种不渲染的结构允许模板里多写一组示例」 |

**建议（等裁定，不擅自做）**：二选一 ——
① 把这些字段接到屏幕上：`site.title`/`description` 随 P7 的 meta 一起接 `document.title` 与
`<meta name="description">`；`site.name` 用来兜底「没有 hint 的场景」那一格；
`footer.links` 或 `site.logo` 若确实不需要，就从配置类型 / 默认值 / 管理页字段表里撤掉。
② 保持现状，但在管理页那几格写明「此处仅存档，当前外壳不渲染」，免得管理人以为改坏了。

### 40.3 验收

- `site-config.spec.ts` 2 → 3 条；`npx playwright test` **182 passed / 3 skipped**（185 条 / 30 个 spec）。
- `npm run check` 八段 **EXIT=0**。

## 41. 探针加固：别让后端抖一下就把用例静默跳掉（2026-10-01）

上轮收工时抓到一次**同一命令两次结果不同**的抖动：
`npx playwright test` 先给 `181 passed / 4 skipped`，再跑又回到 `182 passed / 3 skipped`。
查下去是「不依赖后端有数据」那套写法的副作用：一批用例先探一下有没有文章，
探不到就 `test.skip` —— 写法本身没错（**跳过而不是假绿**，§16 定的），
但它对**偶发抖动**太敏感：并行跑 30 个 spec 时后端忙一下、一次探针超时，
那条用例就**静默变成 skip**，报告里只剩「N skipped」一行，很容易被当成全绿。

### 41.1 两处改动

1. **`e2e/helpers.ts` 新增 `probeJson(page, url, attempts = 3)`**：带退避重试；
   `4xx` 立刻认「这机器上确实没有」（重试没意义），`5xx` 与网络错误才重试；
   最终返回 `{ data, reason }`，`reason` 里写清是 `HTTP 500` 还是「3 次都没问到（最后一次：超时）」。
2. **把「跳过」的措辞换成带原因的那句**：`test.skip(!key, reason)` ——
   于是报告里的注解会写「探不到已发布文章（**HTTP 404**）」或
   「探不到已发布文章（**3 次都没问到（最后一次：…）**）」，两种情形再也不会长得一样。
   改动的探针：`pages.spec.ts` 的 `firstPostKey`、`user-profile.spec.ts` 的 `probeAuthor`
   （六条用例共用一句 `probeReason`）、`parity-keyboard.spec.ts` 的正文 Tab 门、
   以及 `site-config.spec.ts` 的 `topLayer`（每层重试 3 次，`>=500` 才重试）。

### 41.2 验证

- **原因真的进报告了**：把 `firstPostKey` 的地址临时改成不存在的端点，用 `--reporter=json` 看注解 ——
  `{'type': 'skip', 'description': '探不到已发布文章（HTTP 404）'}`，然后逐字还原。
  （这条恰好证明「没有数据」与「没问到」在报告里可分辨。）
- **跳过数稳定了**：`npx playwright test` 连跑两次都是 **182 passed / 3 skipped**（另 3 条是
  `real-login.spec.ts` 的环境变量门，没设凭据本来就该跳）。
- `npm run check` 八段 **EXIT=0**。

### 41.3 留下的口径

「不依赖后端有数据」这条自我约束不放松：探不到仍然**跳过**，只是现在
①探针会重试、②跳过必须带一句人话。真要抓「后端挂了」这类问题，那是另一道门的事
（`skeleton.spec.ts` 的零报错门 + 各页的空态断言已经覆盖）。

## 42. 输入等价性收尾：关联页的键 / 鼠两条旅程 + 长标题不裁的几何门（2026-10-01）

§37 / §39 把「逐页纯鼠标 / 纯键盘」铺开之后还剩两处：**关联页（`/links`）**两条旅程都没写，
以及覆盖审计里那条**几何回归**（样机第 6 轮：「标题在任何宽度下都不被裁」）一直没有门。

### 42.1 关联页：卡片即链接，键鼠各一条

`LinksView` 是全站唯一「卡片 = 链接」的页面，`open()` 有三种去向：`http(s)` 开新标签、
站内且命中 `TAB_IDS` 走前端路由、其余也开新标签。两条旅程都用**站内**夹具
（`/posts` 与 `/about` 都在 `TAB_IDS` 里，于是在同一页里能验完，不用管新标签页）：

| 旅程 | 钉住什么 |
|---|---|
| 纯鼠标（`parity-pages.spec.ts`） | 划过卡片 → 共享光标落上去 → 点击 → URL 变 `/posts` 且 `data-scene=posts`；全程零 `keydown` |
| 纯键盘（`parity-pages-keyboard.spec.ts`） | 两张站内卡（`/posts` 与 `/about`）→ `→` 移到第二张 → `ENTER` → URL 变 `/about`；全程零指针事件 |

「两张指向不同标签页的卡」是刻意的：这样既能验**方向键真的移动了光标**，
又能验**回车激活的正是被选中的那一张**（一张卡的话，两个断言都可能空转）。

### 42.2 长标题不被裁：几何门 + 反向对照

样机第 6 轮的用户口径是「标题被吃掉比卡片高一点更糟」——生产版 `PostListView.vue` 的
`.card-title` 为此写了「不截断」的注释（`min-height: 2.8em`、`overflow-wrap: break-word`、
文字卡 `flex: 0 0 auto`）。新增 `md-and-pixels.spec.ts` 的一条用例，在 **1280 / 900 / 640**
三个宽度下逐条断言一张长标题卡（中文长句 + 一段没有空格的长 token）：

- `textContent` **一个字都没少**（被裁的典型症状是文字还在、渲染上却看不见）；
- **横向不溢出**（`scrollWidth <= clientWidth + 1`，长 token 要在框内换行）；
- **纵向不被切**（`scrollHeight <= clientHeight + 1`）；
- **行数 > 3**（旧行为是 clamp 到 3 行，用户明确否掉了）；
- 外加一条**反向对照**：同一张卡的**摘要**确实是被截断的
  （`scrollHeight > clientHeight`）—— 证明这道门不是「谁都不裁」的空转。
  摘要夹具特意灌到超过文字卡的 5 行上限，否则反向对照会假红（本门踩过一次）。

**反例验证**：把 `.card-title` 临时改回 `-webkit-line-clamp: 3; overflow: hidden` →
门立刻红在「1280px 下标题纵向被切了」，验完逐字还原。

### 42.3 验收

- `npx playwright test`：**185 passed / 3 skipped**（188 条 / 30 个 spec）。
- `npm run check` 八段 **EXIT=0**。

## 43. 像素事实进产物项目：dev 与打包产物的样式源序不是一回事（2026-10-01）

`md-and-pixels.spec.ts` 的文件头早就写明一个坑：**生产版的视图是懒加载的**
（每个视图一个 CSS chunk），组件样式的注入顺序与样机相反 ——「样式源序一变就静默失效」
正是它要防的。但那道门跑在 **dev（5175）**上：dev 是 Vite 逐个 `<style>` 注入，
**产物**是每个视图一个 CSS 文件按需加载，两套顺序并不相同。也就是说这个坑
在产物侧一直没人验过。`production.spec.ts` 新增一条补上。

### 43.1 断言（全部在 `vite preview`（4175）的打包产物上跑）

| 断言 | 为什么要它 |
|---|---|
| `--paper` / `--blue-400` 在产物里**非空** | 构建期生成的 `tokens.generated.css` 有没有真的进产物 |
| 屏幕底色**不是透明** | 「没画底」与「白底」在 computed 上都浅，只差一个 alpha |
| 卡片边框 = `3px solid` | 懒加载 CSS chunk 没生效的典型表现就是样式被压掉 |
| 卡片**有真实尺寸**（宽 > 100px） | 同上：chunk 没加载时卡片会塌成 0 宽 |
| 文章页 keybar 若是 sticky 就必须仍是 `sticky` | 同一条 CSS 在产物里的行为 |

这一条**刻意打桩**（`/api/posts/` `/api/groups/` `/api/tags/`）保证一定有卡 ——
产物项目其它用例刻意走真后端（验代理与 SPA 回退），这一条只看 CSS，不该依赖库里有没有文章。

### 43.2 反例验证（两次，第一次的教训也值得记）

1. **第一次选错了反例**：改 `tokens.ts` 的 `border.frame: 3 → 2`（并 `tokens:gen` 重生成）
   再跑 —— 门**照样绿**。查下去才知道：`.card` 的边框是**字面 `3px`**
   （`PostListView.vue:775`，从样机逐字抄来的），根本不读 `--border-frame`。
   也就是说那次「反例」压根没动到被断言的那条路径。
2. **第二次对了**：把 `.card` 的边框改成 `none`（模拟「这个视图的 CSS chunk 没生效」）→
   门立刻红在「卡片边框是 3px solid（源序变了也不许被压掉）」，验完逐字还原。

### 43.3 顺带量到的口径不一致（**待裁定，未擅自改**）

`border: 3px` 这种**字面值**在 `src/` 里有 **30 处**，而 `var(--border-frame)` 只有 **23 处** ——
两种写法混着用。§14.3 的口径是「尺寸进 token」，§17.2 第 12 条只记了
`PauseMenu` / `SettingsDialog` 两个组件做过这件事。字面 `3px` 与 token 当前值相同
（渲染一致），但**配色/尺寸门只看颜色、不看尺寸**，所以这类混用不会被任何门拦下。
建议二选一：① 做一次纯重构把字面 `3px` 换成 `var(--border-frame)`
（渲染不变，由 `palette.spec` + `md-and-pixels` + `production.spec` 三处像素事实兜着）；
② 明确把「尺寸不进 token」写成口径。在此之前不动它。

### 43.4 验收

- `npx playwright test`：**185 passed / 3 skipped**（189 条 / 30 个 spec；产物项目 5 → 6 条）。
- `npm run check` 八段 **EXIT=0**。

## 44. 卡片几何进回归门（样机第 6 / 7 轮那两条）（2026-10-01）

样机第 6 轮的用户口径里有两条是**几何**：「同一行里有无封面都不参差」、
「卡片不会长到翻页条上面（窄屏几何）」。生产版在这一点上**有意偏离**过 ——
`PostListView.vue` 的 `.grid` 用的是 `grid-auto-rows: max-content` 而不是 `auto`，
注释写明了理由：「auto 轨道在内容装不下栅格高度时会被压缩，卡片内容随之被
`overflow: hidden` 切掉（第七轮：窄屏 + 长标题就撞上了）」。也就是说样机那句
「同一行不参差」被换成了**「谁也不许被切」**。

所以这道门断言的不是「等高」，而是**代码真正想要的那三件事**（1280 / 900 / 640 三档宽度，
夹具正好是「一张无封面 + 一张有封面」）：

| 断言 | 钉住什么 |
|---|---|
| 夹具自证：一张文字卡（无 `.img-frame`）、一张有封面卡 | 免得门因为夹具变了而空转 |
| 两张卡**外宽一致** | 无封面卡不会因为少了图片位就窄一截（=「不占图片位」的外在表现） |
| **没有一张卡切掉自己的内容**（`scrollHeight <= clientHeight + 1`） | 第七轮那个真 bug：卡片被压扁后 `overflow: hidden` 把字切掉 |
| 栅格**装得下**最后一张卡（`grid.bottom >= lastCard.bottom - 1`） | 卡片不许画到栅格外面 |
| 翻页条在栅格**下方**（`foot.top >= grid.bottom - 1`） | 「卡片长到翻页条上面去」那条 |

**反例验证**：给 `.card` 临时加一句 `height: 40px`（把卡片压扁）→ 门立刻红在
「1280px 下有卡片切掉了自己的内容」，验完逐字还原。

**顺带记一句口径**：这道门**不**断言「同一行等高」—— 生产版刻意让行高按内容走
（卡片被拉伸到整行高会留一大块空白）。样机与生产在这条上的差别属于**有意偏离**，
理由在 `.grid` 的样式注释里；若日后要改回等高，改的是产品行为，得先要用户口径。

### 44.1 验收

- `npx playwright test`：**187 passed / 3 skipped**（190 条 / 30 个 spec）。
- `npm run check` 八段 **EXIT=0**。

## 45. 产物侧再补一道 axe 扫描：它能抓什么、抓不到什么（2026-10-01）

§33 把 axe 的放行清单收成一份、§43 把像素事实搬进产物项目之后，产物侧只剩无障碍没扫过。
`production.spec.ts` 新增一条：在 `vite preview` 上扫 5 条路由 + 暂停菜单，按**同一份**
`e2e/a11y-known.ts` 判定（清单不新增第二份），并顺手自证「扫描真的跑了」——
断言清单里那几处已知命中（底栏小字对比度）**确实被 axe 命中过**，
否则「零违规」有可能只是扫描没起来。

### 45.1 反例验证：一次失败、一次成功，两次都值得记

1. **失败的那次**：把 `SceneHead` 的 `.head-title` 颜色改成 `#f2f2f2`（与白底几乎同色）
   → 门**照样绿**。原因不是门坏了，而是**屏幕外框里的文字 axe 判不了对比度**
   （CRT 扫描线是一层渐变，`color-contrast` 只会落进 `incomplete`）——
   这条限制 `a11y.spec.ts` 的文件头早写过，这次是真撞上了。
2. **成功的那次**：去掉 `index.html` 的 `<html lang="zh-CN">` → 门立刻红在
   `[serious] html-has-lang → html`（五条路由各报一次，`lang` 是文档级的）。

两条结论都写进了用例注释：**这道门抓结构性违规**（`lang` / `label` / `aria-*` 之类），
**抓不到屏幕内的对比度**；屏幕内的对比度目前靠 `palette.spec.ts` 的 token 对照 + 人工看。

### 45.2 验收

- `npx playwright test`：**188 passed / 3 skipped**（191 条 / 30 个 spec；产物项目 6 → 7 条）。
- `npm run check` 八段 **EXIT=0**。

## 46. 转场锁输入第一次有了门（含两次「门自己写错」的教训）（2026-10-01）

§15 定的口径里有一条一直**只有注释、没有门**：一屏一场景转场的那一小段时间里外壳是
**上锁**的（`scene/transition.ts` 的 `lockInput()` → `.app[data-locked="true"]`），
`index.ts` / `pad.ts` 写了两条明确规矩 —— 锁定期内 `Tab` / `Shift+Tab` **必须吞掉**
（否则浏览器会把原生焦点挪到某个按钮上，之后回车「莫名其妙」触发它），其余动作**不接管**
（`dispatchPadAction` 里 `inputLocked && action !== 'start'` 直接返回 false），只有 `start`（`p`）放行。

新增 `e2e/transition-lock.spec.ts`。判据不是掐表，而是**记录事实再判**：

- 装 keydown 记录器：每一次按下记下「当时是否锁定 / 是否被 `preventDefault` / 按下前后的原生焦点」；
- 装 MutationObserver：记转场真的上过几次锁；
- 连点 5 次页签、每次紧跟 4 下 `Tab`（锁窗口实测只有 **50~70ms**，靠次数踩中；
  实测 20 次按键里 12 次落在窗口内，两次运行数字完全一致）；
- 断言：① 上锁 ≥ 3 次；② 窗口内采样 ≥ 5 次（采样不足要**显式失败**，不许放行）；
  ③ 窗口内 `Tab` **全部被吞**；④ 窗口内 `Tab` **没有挪动原生焦点**（这就是那句注释说的后果）；
  ⑤ 锁最终释放（`data-locked="false"`）；⑥ 外壳仍活着（标签栏在、场景是四个标签页之一）。

**反例验证**：把 `index.ts` 里那句 `event.preventDefault()` 去掉（Tab 不吞）→
门立刻红在「锁定期内竟有 Tab 没被吞掉（**11 次**）」，验完逐字还原。

### 46.1 试过但放弃的做法：假时钟

一开始想用 `page.clock.install()` 把时间冻住、让锁窗口一直开着，好稳稳按键。**不行**：
冻结计时器会连带冻住 presenter 的转场收尾，实测「点了页签 URL 不动、`runFor` 之后场景还是旧页」
—— 测的就不是产品行为了。所以这道门走「记录 + 统计」，不控制时间。

### 46.2 两次「门自己写错」，两条都是通用坑

1. **init script 里不能用 `document.documentElement`**：它在解析前是 `null`，
   `observer.observe(null)` 直接抛异常、把整个 init script 掐掉 ——
   表现是「锁计数恒为 0、按键一条没记到」，看起来只像「采样不足」。
   改成 `observe(document, …)` 立刻正常。**这条对以后所有 init script 记录器都适用。**
2. **判据不能想当然「极化」**：我原本想断言「窗口外的 `Tab` 一个都没被吞」当对照，
   结果红了 8 次 —— 因为标签栏**本来就靠 `Tab` 切页**（`pages.spec.ts` 有专门用例守它），
   窗口外被吞是**对的**。极化对照站不住，于是第二半改成断言**看得见的后果**
   （窗口内不挪动原生焦点）。
   顺带把末尾「落在 `/posts`」那条 URL 断言也删了：窗口外的 `Tab` 会切页签，
   最后停在哪一页取决于按压落在窗口内外的时序 —— 那条断言单独跑绿、整套并行时红，
   是标准的「时序假绿用例」。

### 46.3 验收

- `npx playwright test`：**189 passed / 3 skipped**（192 条 / 31 个 spec），连跑两次一致。
- `npm run check` 八段 **EXIT=0**。

## 47. 分区边界与一个被测出来的「整套偶发红」（2026-10-01）

### 47.1 标签栏分区那处「双光标」：样机就是这样，不是 bug

`pad.ts` 有一条规则：`focusZone === 'tabs'` 时**场景监听器整层跳过**（←→ 归标签栏）。
顺手探了一下「那页内光标还在不在」——结果是**两个光标同时画着**：

```
icespark 探针：三次 ↑ → zone=tabs · .focusable.is-focused = ['tab-posts', 'group-all']
样机  探针：三次 ↑ → zone=tabs · .focusable.is-focused = ['tab-posts', 'group-all']   ← 逐字一致
```

于是这不是回退，是**样机就有的怪相**（`ui/tabs.ts` 的 `focusTabs()` 只设 `focusZone`，
不通知场景；场景的 `is-focused` 绑定不看分区）。按硬要求 1「样机即交互定稿」，
**生产版照样机保留**，谁要收掉它得先要用户口径 —— 这条写进了用例注释，改的时候会拦一下。

`chip-navigation.spec.ts` 新增一条把两件事分开钉住：
① **规则**：进分区之后 `←→` 只动标签栏光标，**页内光标一动不动**（`pad.ts` 那条跳过的外层表现）；
② **怪相**：同一时刻页内光标仍然可见（断言长度 > 0），注释指向样机实测，别顺手「修」。

写这条时自己也踩了一次：基线取在**进分区之前**，于是断的是「三次 ↑ 不该动光标」——
而 ↑ 本来就要把光标从卡片挪到分组行。基线必须取在**进分区之后**（已修）。

### 47.2 真正值钱的发现：`booted()` 之后立刻按键会偶发丢键

整套跑起来时，`list-paging.spec.ts` 的「第 2 页点开文章，Q 返回后仍是第 2 页」**偶发**红在
`toHaveURL(/page=2/)`（单跑绿、整套并行红）。查下去不是它的逻辑问题，而是**公共前置缺了一步**：

> 转场锁（§46）比场景切换**多活 50~70ms**。`booted()` 只等「`data-scene` 不是 `boot`」就返回，
> 而此刻 `.app[data-locked]` 往往还是 `true` —— 内核**按设计**把非 `start` 的按键全部丢掉。
> 于是「`booted()` 之后立刻 `PageDown` / `ArrowDown` / `Tab`」的用例会丢键，
> 表现成断言超时，且只在并行负载下偶发。

**改法（只动测试基础设施）**：`e2e/helpers.ts` 的 `booted()` 顺手等一下锁释放
（`expect(.app).toHaveAttribute('data-locked', 'false')`）。这比在每条用例里塞
`waitForTimeout` 可靠，也把「开机自检先让位」这条前置补完整了。

**证据**：改之前整套大约两次红一次；改之后**连跑三次全绿**（每次 190 passed / 3 skipped）。
顺带说明为什么之前那几次「偶发」都长得不一样（有红、有 skip）—— 根子都是「时序相关的公共前置」。

### 47.3 验收

- `npx playwright test`：**190 passed / 3 skipped**（193 条 / 31 个 spec），**连跑三次一致**。
- `npm run check` 八段 **EXIT=0**。

## 48. 把新前端写进 `AGENTS.md`（2026-10-01）

查文档时发现的：仓库唯一的 Agent 指导文件 `AGENTS.md`（145 行）**通篇没有出现过 `icespark`**，
也没提 `design/` —— 也就是说，除了本文件（设计与决策记录）之外，**没有任何地方告诉后来的人：
新前端在哪、跑在哪个端口、怎么验（门 / e2e）、product 的交互定稿是哪份**。
`AGENTS.md` 第 5 节自己写着「重要改动同步更新本文件对应章节（**不要再新建第二份 Agent 文档**）」，
所以这一轮补的就是它。改的都是事实，不动口径：

| 章节 | 补了什么 |
|---|---|
| §2 项目结构 | `icespark/`（独立 app、M/F/S 分层、`e2e/`、`scripts/` 放各道门）、`design/icespark-prototype/`（**冻结的交互定稿**，别改它）、`design/icespark-ARCHITECTURE.md`（设计与决策记录，**不是第二份 Agent 文档**）；同时把 `frontend/` 两行标注为「旧」 |
| §3 启动与端口 | 旧前端 5173、**新前端 5175**（`vite.config.ts` 代理 `/api` → 8002）、**产物预览 4175**、交互样机怎么起 |
| §6 测试 | 旧前端条目标注「（旧）」并把旧 E2E 与它排在一起；新增两条 —— **`npm run check` 的八段**（独立性 / tokens:check / vitest / oxlint / eslint / api:check / vue-tsc / check:budget）与**两个 Playwright project**（`chromium` 跑 dev 全部用例、`preview` 只跑产物冒烟；真账号链路靠 `ICESPARK_E2E_USER`/`PW` 才跑） |
| §9 部署 | 补一句：新前端的产物是 `cd icespark && npm run build` 的 `dist/`，**同样需要「未知路径回退 index.html」**（history 真路由）；线上跑哪一份由部署方决定 |
| §10 故障排查 | 「前端 /api 全部 404」那一行补上新前端的检查项：`icespark/vite.config.ts` 的 `server.proxy` / `preview.proxy` |

**验收**：纯文档改动（未动任何代码）；命名自查 `rg -i "synth[_-]?ink"` 无命中；
`npm run check` 八段仍 EXIT=0；e2e 维持 190 passed / 3 skipped（193 条 / 31 spec）。

## 49. 站点设置页的键 / 鼠两条旅程 + 另一个「按键被锁吃掉」的真凶（2026-10-01）

### 49.1 站点设置页（硬要求 2 的编辑面）补上键鼠对称

配置编辑是全站唯一「改一处再写回去」的表单页，此前只有 `admin-site.spec.ts` 的**混合**
路径（点一下 + `Control+a` + `q`）。两条新用例把它补齐：

| 旅程 | 落点与要点 |
|---|---|
| 纯键盘（`parity-pages-keyboard.spec.ts`） | ↓ + `ENTER` 换段（光标移动**不**换段，与全站芯片口径一致）→ **原生 Tab 遍历 5 下**进该段第一个字段 → `Ctrl/⌘+A` 重打 → **再 Tab 3 下**到「保存」→ 回车 → 真发 PUT；断言请求体里是键盘敲进去的新值，**没动过的段与同段没动过的字段原样带回去**。实测的 Tab 顺序（navbar 段）：返回 → 新段名 → 加段 → 还原该段 → **第一个字段** → 段 JSON → 展开 → **保存** |
| 纯鼠标（`parity-pages.spec.ts`） | 点段直接换页（键盘那边要 ↓+ENTER）→ 点进字段 → `fill()` 改写 → 点「保存」→ 断言 `admin-site-saved` 与 PUT 体；全程零 `keydown` |

### 49.2 真凶：`booted()` 之外还有一处「按键正好落进转场锁」

§47 修的是「`booted()` 之后立刻按键」，但这只是**一处**。这轮整套又偶发红了一次，
抓到的是 `list-paging.spec.ts`「跳页回车之后键盘还活着」：

```
跳页框回车 → 断言 toHaveURL(/page=2/) 已成立 → 立刻按 PageUp → 期望回到第 1 页
```

**根因同源**：`goPage()` 也是一次导航 → 也有转场锁；而 `toHaveURL` 在**地址栏刚变**就返回了，
此时锁往往还活着 50~70ms → `PageUp` 被内核按设计丢掉 → 断言等不到「回到第 1 页」。
（浏览器里用户这么按本来就是「会被丢掉」；用例里这么按就是随机红。）

**改法**：`e2e/helpers.ts` 加 `press(page, key)` —— **按键前先等 `data-locked="false"`**，
然后把 19 处「刚发生过导航、紧接着按键」的调用点机械替换成它（脚本按「上文 6 行内有
URL / 场景断言、且没有别的守卫」筛出来，逐个核对）。**口径**：要验「锁定期内按键会被丢掉」
的用例（`transition-lock.spec.ts`）**故意不用**它，继续直接 `page.keyboard.press`。

**证据**：改之前整套大约**两次红一次**（红在 `list-paging.spec.ts:356`，
报文 `expect(page).toHaveURL(expected) failed`）；改之后**连跑三次全绿**
（每次 192 passed / 3 skipped），耗时没变（1.8m vs 1.9m）。

### 49.3 顺带记一个基础设施抖动

某次 `--project=chromium` 起不来，报 `Process from config.webServer was not able to start.
Exit code: 2`：产物 webServer 是 `npm run build && vite preview --port 4175 --strictPort`
且 `reuseExistingServer: false`（刻意不复用，免得拿旧产物给假 PASS）——
上一次调用留下的预览进程还占着 4175 时，这次就直接失败。等端口空出来重跑即正常。
**这是配置注释里写明的政策（「端口被占就直接失败，那本来也该先收拾现场」），不是 bug**；
排查时先 `ss -ltnp | grep 4175`。

### 49.4 验收

- `npx playwright test`：**192 passed / 3 skipped**（195 条 / 31 个 spec），**连跑三次一致**。
- `npm run check` 八段 **EXIT=0**。

## 50. 写作页的键 / 鼠两条旅程（2026-10-01）

写作页是全站唯一「打字 + 组合键」的页面，此前只有 `write.spec.ts` 的功能覆盖，
没有「一种输入方式走完全程」的保证。两条新用例补上（都真发写请求、都录指针 / 按键事件）：

| 旅程 | 要点 |
|---|---|
| 纯键盘（`parity-pages-keyboard.spec.ts`） | 打开 `/write` 时**标题框已经拿着原生焦点**（打开就能写）→ 打字 → **一直 `Tab` 直到落进正文**（中间隔着插入条 8 颗按钮与围栏语言下拉；**故意不写死步数**，以后插入条加按钮不会假红）→ 打字 → **`Ctrl/⌘+S`** 存草稿 → 断言 POST 体里有标题与正文、`status === 'draft'`、状态行变「已保存」；全程零指针事件 |
| 纯鼠标（`parity-pages.spec.ts`） | 点标题 → 写 → 点正文 → 写 → 点「存草稿」→ 同样的断言；全程零 `keydown` |

两条顺手钉住的实现事实（以后改坏了有人知道）：

- **`Ctrl/⌘+S` 是编辑框自己接的**，不是内核 —— `pad.ts` 的 `resolveComboAction` 刻意对
  `Ctrl / Alt / Meta` 一律让开（注释写明：「抢过来就成了『想存草稿却开了面板』这类事故」），
  真正接它的是 `src/signal/MarkdownSourceEditor.vue`（并 `preventDefault()` 掉浏览器自己的
  「保存网页」对话框）。所以这条旅程的**光标必须落在正文框里**才走得通 ——
  这也正是上面那步「Tab 到落进正文为止」的用意。
- **正文里的 `Tab` 归编辑框**：它把 `Tab` 接过去送进插入条（`focusToolbar()`），
  理由是「原生 `Tab` 从正文往后走会撞上页面末尾那两个隐藏的文件输入框」。
  所以页面上的原生 Tab 顺序会看到「工具条 → 语言下拉 → 正文 → 又回工具条」这种循环感，
  这不是 bug。

### 50.1 验收

- `npx playwright test`：**194 passed / 3 skipped**（197 条 / 31 个 spec），连跑两次一致。
- `npm run check` 八段 **EXIT=0**。

## 51. 逐页输入等价性：从「文档里一张表」变成「会红的清单」（2026-10-01）

§37 / §39 / §42 / §49 / §50 一路把「纯鼠标 / 纯键盘」铺到十来条旅程，但它们散在
`parity-pages.spec.ts` / `parity-pages-keyboard.spec.ts` 两个文件里，**没有任何东西保证
「每一页都被这两种输入方式覆盖过」** —— 新加一页却忘了补旅程时，其它用例都不会红。
这一轮把它变成可执行的数据 + 一道会红的门。

### 51.1 `e2e/pages-inventory.ts` + `e2e/parity-coverage.spec.ts`

清单每条是「路由 → 纯鼠标用例名锚点 / 纯键盘用例名锚点 / 缺口原因」，
`parity-coverage.spec.ts` 五条判据逐条把关：

| 判据 | 挡住的遗漏 |
|---|---|
| 清单路由集合 **==** `src/router/routes.ts` 的字面量集合 | 新增页面忘了进清单（也挡住清单里写了不存在的页） |
| 清单内无重复路由 | 复制粘贴写重 |
| 每条「已覆盖」的锚点必须真的出现在**它该在的那个 spec** 里 | 用例被删/改名而清单没跟上；锚点写错 |
| 有 `null`（未覆盖）就必须写 `reason`（≥12 字） | 静默缺口 |
| 两种输入方式都没覆盖的页，`reason` 必须写明是**「设计上没有」**还是**「待补」** | 含糊其辞的缺口 |

**反例验证**（两次都真跑）：① 往清单里塞一条 `/ghost-page` → 红在「清单与路由对不上」；
② 把一条鼠标锚点改成不存在的名字 → 红在「清单声明与用例对不上：
`/posts` 的鼠标旅程「列表页点芯片筛选XXXX」在 parity-pages.spec.ts 里找不到」。
验完逐字还原。

### 51.2 顺带补上：404 皮肤的键鼠两条旅程

查清单时发现 404 皮肤其实**四项可交互、三项还是真链接**（返回首页 / 文章列表 / 个人中心，
另加一个动词「返回上一页」），完全够写旅程，于是当轮补掉：

| 旅程 | 落点 |
|---|---|
| 纯鼠标（`parity-pages.spec.ts`） | 深链接打开 `/nope-404` → 点「文章列表」（`href="/posts"` 是真 URL）→ 到列表页；全程零 `keydown` |
| 纯键盘（`parity-pages-keyboard.spec.ts`） | `/nope-404` → 自绘光标初始在 `.back-home-btn` → `→` 移到「文章列表」→ 回车 → 到列表页；全程零指针事件 |

### 51.3 清单里**明确写着**的剩余缺口（下一轮逐个清）

| 路由 | 缺哪一种 | 原因（清单里逐字记着） |
|---|---|---|
| `/user/:username` | 两种都缺 | 目前只有 `user-profile.spec` 的**混合**用例（点卡与回车到达同一落点） |
| `/profile` | 缺鼠标 | 只有纯键盘旅程，鼠标侧仍是混合用例 |
| `/admin/audit` | 两种都缺 | 只读列表 + 翻页，只有功能用例 |
| `/about` | 两种都「没有」 | **设计上没有可交互元素**（样机即如此），不是缺口 |

### 51.4 验收

- `npx playwright test`：**201 passed / 3 skipped**（204 条 / 32 个 spec），连跑两次一致。
- `npm run check` 八段 **EXIT=0**。

## 52. 逐页输入等价性：清单缺口清零（2026-10-01）

§51 建的清单当时留着三条缺口，这一轮全部清掉 —— 现在清单里**只剩 `/about` 一条
「设计上没有」**，其余每一页都是「纯鼠标一条 + 纯键盘一条」，并且由 `parity-coverage.spec.ts`
把关「声明必须在对应 spec 里找得到」。

| 路由 | 本轮补的两条旅程 |
|---|---|
| `/admin/audit` | 纯鼠标：点「下一页 / 上一页」来去（列表只读，鼠标侧能做的就这一件）· 纯键盘：`PgDn` / `PgUp` 翻页，**翻完再按 `↓` 行光标仍在**（翻页会重画整个列表 —— 顺手钉住「重画之后键盘还活着」这类坑） |
| `/profile` | 纯鼠标：点进昵称格 → `fill()` 改写 → 点「保存」→ 断言请求体里是新昵称（键盘侧早有） |
| `/user/:username` | 纯鼠标：点作者的文章卡进详情 · 纯键盘：光标起点就是第一张卡，回车进详情（两条各带零交叉输入断言） |

### 52.1 顺带把「设计上没有」那句话变成断言

清单里 `/about` 的两种输入都是 `null`，理由是「按设计没有任何可交互元素」——
这种理由最容易过期。于是在 `parity-coverage.spec.ts` 补一条：
打开 `/about`，断言 `.screen-inner` 内 **`.focusable` 数量为 0**、且没有 `button` / `a[href]`。
哪天有人往关于页加了一颗按钮，这条会红，逼着那句理由要么改成真缺口、要么补上旅程。

### 52.2 反例验证

把清单里 `/about` 的 `mouse` 从 `null` 改成一个不存在的用例名「关于页点一下」→
立刻红在「`/about` 的鼠标旅程『关于页点一下』在 parity-pages.spec.ts 里找不到」，
验完逐字还原。（证明「声明必须是可核对的」这条判据真的在跑。）

### 52.3 验收

- `npx playwright test`：**207 passed / 3 skipped**（210 条 / 32 个 spec），连跑两次一致。
- `npm run check` 八段 **EXIT=0**。

## 53. 模态焦点圈闭：第一次有门 + 一处「Tab 卡死」的实录（2026-10-01，收尾轮）

模态的焦点口径一直散在 `App.vue` / `PixelDialog.vue` 的注释里（「模态开着时导航类全局键
一律不生效」「补对话语义：`role="dialog"` + `aria-modal`」），没有任何门。新增
`e2e/modal-focus.spec.ts` 两条：

| 用例 | 钉住什么 |
|---|---|
| 暂停菜单开着时 Tab 被吞 | 连按 3 下 `Tab`，原生焦点**不动**、也不落到背景页面；**对照**：同一状态按 `↓` 光标照样走（被吞的是 Tab，不是整块键盘） |
| 登录框里 Tab / Shift+Tab 只在框内走 | 从用户名框往前：`login-username → login-password → login-submit`；倒着走：`login-username → Shift+Tab → login-close`；每一步都断言「在模态里、不在背景」 |

顺带把实现口径写清楚：**可编辑目标例外**——焦点在输入框里时内核让开
（`isEditableTarget` 那一支），所以框内换字段走的是浏览器原生遍历；焦点在**按钮**上时
才轮到外壳吞 Tab。

### 53.1 实录：登录框里走到「提交」之后 Tab 会卡住（**没有写成用例**）

探针实录：

```
用户名框 → Tab → login-password → Tab → login-submit
login-submit → Tab       → 还是 login-submit（不动）
login-submit → Shift+Tab → 还是 login-submit（不动）
```

原因：焦点在按钮上时那两下 Tab 走到外壳的 `offGlobal`，`inModal` 为真 → 被吞，
浏览器原生遍历永远不跑；而**从输入框按 Tab 能动**是因为可编辑目标让开了内核。
于是模态里「非可编辑 → 可编辑」能前进，反过来退不回去，走到最后一个按钮就停了 ——
键盘用户只剩 ESC（关掉对话框）能脱身。

**为什么没写成 `test.fail`**：第一次就是这么写的，**整套并行跑时它会翻**
（单独跑红、并行跑绿 → 报 `Expected to fail, but passed`）。会翻的用例比没有更糟，
所以改成文字实录 + 等口径。建议二选一：
① 模态内把 Tab 做成循环（最后一个可聚焦项 → 第一个）；
② 焦点已在模态容器内部时不再吞 Tab（代价：焦点能走出模态，得配 `inert` 才安全）。

### 53.2 验收

- `npx playwright test`：**209 passed / 3 skipped**（212 条 / 33 个 spec），连跑两次一致。
- `npm run check` 八段 **EXIT=0**。

## 54. 测试账号：清掉 72 个残留、建一个专用账号（2026-10-01）

用户裁决「没用的清了就行」「你自己创建呗」，两件都办完了。

### 54.1 清掉 72 个 e2e 残留账号

业务库 `synthspark_test`（PostgreSQL）里原来有 **80** 个用户，其中 **72** 个是
`site_cfg_*`（2026-09-30 由站点配置相关 e2e 跑出来的，其中 60 个还是超管）。
删之前逐个查了引用关系，确认它们**不带任何内容**：

| 引用检查 | 结果 |
|---|---|
| 这些用户写的文章 `posts.author_id` | 0 |
| 这些用户的评论 `comments.author_id` | 0 |
| 这些用户的点赞 `likes.user_id` | 0 |
| 这些用户的 API 令牌 `user_api_tokens.user_id` | 0 |

（全库只有这四张表引用用户，逐一查过。）删除后剩 **8** 个真账号：
`human_admin`、`super_ai`、`normal_ai`、`normal_user`、`test_admin`、`mw_test`、
`icespark_user`、`icespark_admin`。

### 54.2 建一个专用测试账号，把 3 条真链路 e2e 从「跳过」变成「常跑」

- 账号：`icespark_e2e`（普通用户，非超管，显示名「自动化测试账号」），经
  `POST /api/auth/register`（超管令牌）创建 —— 用接口而不是直接写库，口令哈希走应用自己那一套。
- 凭据落点：`icespark/e2e/.credentials.local.json`（**已 gitignore**），
  环境变量 `ICESPARK_E2E_USER` / `ICESPARK_E2E_PW` 优先级更高（CI 用）。
  `real-login.spec.ts` 两者都没有时照旧**跳过**（不是假绿），文件里也永不写账号密码。
- 效果：`npx playwright test` 从 `209 passed / 3 skipped` 变成 **212 passed / 0 skipped** ——
  表单编码登录、令牌换 `/api/auth/me`、刷新保持登录、登出清键，这四条真链路现在每次验收都跑。

### 54.3 顺带发现（未处理，属部署/环境侧）

本机 PostgreSQL 里还留着一个 `synthink_test` 数据库（**旧命名**，§1 已废弃的那种）。
它不在仓库里、也没有任何代码引用（`.env` 的 `TEST_DATABASE_URL` 指向 `synthspark_test`），
所以不影响任何门；要不要删掉由维护者定（删库是不可逆操作，不擅自做）。

### 54.4 验收

- `npx playwright test`：**212 passed / 0 skipped**（212 条 / 33 个 spec）。
- `npm run check` 八段 **EXIT=0**。

## 55. 用户裁决后的第一批：删除线按钮恢复 + 鼠标换面板对齐（2026-10-01）

### 55.1 「删除线」按钮：恢复（当初删它的理由是错的）

`MarkdownSourceEditor.vue` 里原本有一段注释说「旧版有删除线，这里没有，是刻意的：
GFM 的 `~~x~~` 需要 markdown-it 打开 `strikethrough` 规则，而本项目渲染器用默认 preset，
删除线没开」。**这个前提是错的**，实测：

- markdown-it 的 **default preset 本来就开了 `strikethrough`**（表格与删除线都在）；
- `MarkdownBody.vue` 的 `PURIFY_TAGS` 里也一直有 `s`；
- 探针实录：正文 `正常文字 ~~删掉这段~~ 后面` → `<p>正常文字 <s>删掉这段</s> 后面</p>`。

所以按**旧版顺序**（粗体 · 斜体 · **删除线** · 行内码…）把按钮加回 `TOOLS`，
并把那段错误注释改写成事实。两道门各守一半：

| 门 | 位置 | 断言 |
|---|---|---|
| 渲染侧 | `md-and-pixels.spec.ts` | `~~x~~` → 恰好一个 `<s>`、文字对、波浪号不许原样留页面上、同行其余文字没被吞 |
| 插入侧 | `write.spec.ts` | 按钮在、插出来是 `~~删除线~~`（占位）、位置交回正文；**选中两个字再点** → `~~保留~~这段` 且新包住的那段被选中 |

（写这道插入门时自己踩了一次：`Shift+→` 按了 4 下 = 把 4 个字全选，于是"包住整段"被当成 bug；
另外 `fill()` 会把整段选中并把该状态缓存下来，点击按钮时浏览器恢复成"全选"——
想验"包住选区"必须用真实输入建立选区。）

### 55.2 写作页换面板：鼠标与键盘对齐（用户裁决「做」）

**原行为**：面板开着时 `.sheet-mask`（`fixed; inset: 0; z-index: 200`）盖住动作条，
点另一颗面板按钮第一下点到的是遮罩（只负责关），要点**第二下**才打开；
而键盘按 M 是**直接切**（`panelPad`：换面板不要求先关）。两边不一致。

**新行为**（两处改动）：

1. `.write-bar` 加 `position: relative; z-index: 201`，抬到遮罩之上 → 鼠标一下切到；
2. 新增 `pickPanel()` 给三颗动作条按钮用：**同一个面板再点一下就关**，
   与键盘「同一个面板键再按一下也是关」同义（`openPanel` 本身不动 ——
   它另有调用点，那些地方要的是"打开"而不是"切换"）。

代价：面板开着时动作条不再被遮罩压暗（它本来就是那颗开关）。
`write.spec.ts` 的纯鼠标面板用例按新行为重写：一下切过去、同按钮再点关闭、
遮罩空白处点一下仍旧是关。

### 55.3 验收

- `npx playwright test`：**214 passed / 0 skipped**（214 条 / 33 个 spec）。
- `npm run check` 八段 **EXIT=0**。

## 56. 浏览器标题与页面描述（用户裁决「标题问题要做」）（2026-10-01）

此前：`index.html` 里写死一个标题，不管看哪一篇文章标签页都同名；`router/routes.ts` 里
那张 `meta.title` 表是**没人消费的死数据**；`site.name` / `site.description` 属
§40.2 那批「能填但到不了屏幕」的字段。这一批一起接上。

### 56.1 口径

- `<title>` = **`页面名 · 站点名`**：
  - 页面名默认取**路由表**的 `meta.title`（首页 / 文章 / 关联 / 关于 / 用户主页 /
    个人信息 / 站点设置 / 外链管理 / 审计日志 / 写作 / 页面不存在）；
  - 文章页与用户主页这种「**打开才知道名字**」的用 `usePageTitle()` 覆盖，组件卸载自动让位；
  - 站点名取三级合并后的 `site.name` —— **后台改站名，标签页跟着变**。
- `<meta name="description">` = `site.description`（配置没给描述就**不挂**空的上去，
  空描述会被搜索引擎当成"没有描述"）。`index.html` 里刻意不写死它，否则就绕过了三级合并。
- **没做**：JSON-LD（要部署域名）与 sitemap（用户裁决「将来后端再说」）。

### 56.2 实现

| 文件 | 职责 |
|---|---|
| `src/frame/documentMeta.ts`（新） | `composeTitle()` 纯函数（缺哪边只留另一边、不留孤零零的 ` · `）；模块级 ref 承载"页面级覆盖"；`applyDocumentMeta(doc, title, description)` 写 `<head>`（meta 不存在才建，避免越用越长） |
| `src/App.vue` | 一个 `watchEffect` 把算好的标题与描述写进 `<head>` |
| `PostDetailView.vue` / `UserProfileView.vue` | 各一行 `usePageTitle(...)`（后者特意放在 `displayName` 之后 —— `watchEffect` 是**同步跑第一次**的，放前面会撞 `const` 的 TDZ） |

### 56.3 门

- 单测 `src/frame/__tests__/documentMeta.spec.ts`：`composeTitle` 五种边界
  （都有 / 缺页面名 / 缺站点名 / 都空 / 首尾空白）。
- e2e `document-title.spec.ts`（新，3 条）：
  ① **逐页**标题形状 —— 5 条路由各断言 `页面名 · 站点名`，站点名从**运行期取当前生效的
  覆盖层**（沿用 `site-config.spec.ts` 的手法，不写死字）；
  ② 文章页标题跟着文章走（`toContain(文章名)`），离开后回到路由表那一页的名字；
  ③ `<meta name="description">` 等于配置里的描述；配置没给就断言**不该有**这个 meta。

（这道门自己也踩了一次：查"文章页标题"时先写了 `[data-testid="post-title"]`，实际是
`.doc-title`；好在断言是 `toBeVisible()` 直接红的，没有假绿。）

### 56.4 验收

- `npx playwright test`：**217 passed / 0 skipped**（217 条 / 34 个 spec）。
- `npm run check` 八段 **EXIT=0**（顺手清掉一个未使用的 import —— `npm run check` 会拦）。

## 57. 模态焦点圈闭：把「Tab 卡死」真正修掉（用户裁决「② 做」）（2026-10-01）

§53.1 实录的那个问题（登录框里走到「登录」按钮后 Tab / Shift+Tab 都被吞、焦点卡死、
只剩 ESC 能脱身）这一轮修掉了。

### 57.1 做法：显式声明 + 内核先问一句

| 位置 | 做什么 |
|---|---|
| `src/input/focusTrap.ts`（新） | `nextFocusIndex()` 纯函数（回绕算下标，单测 5 条）+ `cycleFocusInTrap(doc, dir)`：找 `[data-focus-trap="cycle"]`、要求**焦点已在容器里**、容器里可见可聚焦项 **≥2**，回绕一格并返回 `true` |
| `src/input/index.ts` | `onKeydown` 最前面（**在「可编辑目标让开」之前**）问一句 `cycleFocusInTrap()`；真挪动了就 `preventDefault` 并返回。转场锁输入期间不掺和（那一段的口径仍是「Tab 必须吞掉」） |
| `LoginDialog.vue` / `PixelDialog.vue` | 容器上声明 `data-focus-trap="cycle"`（两张都是**带表单**的对话框） |

**为什么是「显式声明」而不是「凡 `aria-modal` 都圈」**：暂停菜单是**自绘光标**的
（行上有 `.is-focused`），把原生焦点也循环进去会冒出第二个光标；它继续沿用原口径
（Tab 被吞、方向键走光标）。带表单的对话框没有自绘光标，循环原生焦点才是对的。
这条判断写在 `focusTrap.ts` 的文件头里。

**为什么必须排在「可编辑目标让开」之前**：登录框里从输入框按 Tab 走的是浏览器原生遍历
（内核让开），排在后面就管不到它 —— 从最后一个输入框按 Tab 会直接跑到模态外面去。

### 57.2 门

`e2e/modal-focus.spec.ts` 现在三条（原来那条「实录」注释换成了真用例）：

| 用例 | 断言 |
|---|---|
| 暂停菜单：Tab 被吞 | 连按 3 下 Tab 原生焦点**不动**、不落背景；对照 `↓` 光标照样走（口径**未变**） |
| 登录框：只在框内走 | 用户名 → 密码 → 提交；反方向 用户名 → ✕ 关闭；每步都在模态里、不在背景 |
| 登录框：**回绕，一条都别想卡死** | 用户名 → 密码 → 提交 → **取消** → **回绕到 ✕ 关闭**（不再原地不动）；从 ✕ 反向 Shift+Tab **回绕到取消** |

### 57.3 验收

- `npx playwright test`：**218 passed / 0 skipped**（218 条 / 35 个 spec）。
  （中间有一次整套跑出「1 skipped」——那是探针类用例在负载下的偶发跳过，重跑即 0；
  §41 的加固让这种跳过一定带原因，不再是"无声的绿灯"。）
- `npm run check` 八段 **EXIT=0**。

## 58. 文章读不出来时的页内空态（用户裁决「① 做吧」）（2026-10-01）

§31.5 那条实证缺陷（打开一篇不存在 / 已删除的文章，页面**永远**停在「读取正文 …」，
没原因也没出路）这一轮修掉了。

### 58.1 先分清「为什么空」

`stores/content.ts` 新增 `postError: 'missing' | 'error' | null`：

| 情形 | `postError` | 依据 |
|---|---|---|
| 接口回 **404** | `'missing'` | `ApiError.status === 404`（`src/api/client.ts` 的 `ApiError` 带状态码） |
| 其它失败（500 / 网络 / 评论接口挂了） | `'error'` | 同一支 catch 的兜底 |
| 没给 key（或给了 `all`） | `'missing'` | 等于"没有这一篇"，不该一直转圈 |
| 读成功 | `null` | 每次进 `loadPost` 先清空，免得快速换地址时留着上一篇的理由 |

### 58.2 页内空态 + 两个动作

`PostDetailView.vue` 在「加载中」那一支**前面**插了两块（用同一个 `data-testid` 家族，
文案分开）：

| 状态 | 标题 / 解释 | 动作 |
|---|---|---|
| `post-missing` | 「这篇文章不存在或已删除。」/「地址里的编号没有对应的文章，或者它还没有公开。」 | **返回列表**（`goPosts({}, 'wipe')`）· **回主页**（`goTab('home', 'wipe')`） |
| `post-error` | 「正文读取失败。」/「后端不可达或接口出错，稍后再试。」 | 同样两颗 |

两个动作**复用全站既有的导航帮手**（`scene/nav.ts`），因此带转场、是**真 URL 跳转**；
不是自造一套 push。按钮是普通的 `.btn.focusable`，原生 Tab + 回车就能用
（没给它自绘光标 —— 这一页的焦点模型不在这一批里）。

### 58.3 门（`pages.spec.ts` 新增两条）

| 用例 | 断言 |
|---|---|
| 404 → 空态 | `post-missing` 可见、文案对、**回归断言：`读取正文` 与 `.loading` 都不许再出现**；点「返回列表」到 `/posts` 且场景是 posts |
| 500 → 另一句 + 键盘走掉 | `post-error` 可见、文案对；**一路 `Tab`（不写死步数）走到「返回列表」再回车**，同样到 `/posts` |

（写第二条时踩了一次：先点了一下非可聚焦的提示文字再断言按钮**已聚焦** —— 点击非可聚焦处
会把焦点交给外壳根节点，那条断言必红；改成"Tab 到它为止"才是真正要验的"键盘能走掉"。）

### 58.4 验收

- `npx playwright test`：**220 passed / 0 skipped**（220 条 / 35 个 spec）。
- `npm run check` 八段 **EXIT=0**。

## 59. 代码高亮：装、主题、样张文章（用户裁决「装吧，做好主题，并且写一篇测试代码高亮的文章」）（2026-10-01）

### 59.1 怎么接的（三个刻意选择）

| 选择 | 理由 |
|---|---|
| **渲染之后再染色**（`MarkdownBody.vue` 里 `watch(rendered)` → `nextTick` → `highlightCodeBlocks(根节点)`） | 走 markdown-it 的 `highlight` 选项就得让高亮产物穿过 DOMPurify、把 `span` 加进白名单（那张表每一行都要能说清出处）。后处理用的是**已清洗的 `textContent`**，白名单一个字没动 |
| **延迟加载 + 只拉用到的语言**（`src/signal/highlight.ts`） | 正文先照常显示（纯文本也可读），颜色随后补上；只把这一篇里真的出现的语言拉下来。没有代码块时**库根本不下载** |
| **主题自己写**（`src/styles/highlight.css`） | highlight.js 自带主题全是写死色值，会撞配色门（硬要求 5）。这里每个颜色都是 `var(--…)` |

配色思路（克制：全站只有一个强调色）：关键字 `--blue-700` 加粗 · 字符串 `--spark`（唯一强调色）·
注释 `--ink-faint` 斜体 · 数字/字面量 `--blue-600` · 函数名 `--ink` 加粗 ·
内置/类型/变量 `--blue-500` · 运算符/标点 `--ink-soft`。

### 59.2 门与预算

- `md-and-pixels.spec.ts` 新增一条：三个围栏（javascript / python / **清单外的语言**）——
  等 `.hljs-keyword` 出现（延迟加载），逐项对照 **token 解析值**（关键字 = `--blue-700`、
  字符串 = `--spark`、注释 = `--ink-faint`）；python 也染色；清单外语言**不染色但一个字符不少**。
- 性能预算（`check:budget`）五项全过：入口 JS **55.31 / 72 kB**、最大懒块
  `MarkdownBody` **55.80 / 72 kB**、dist 总量 1343 / 2048 kB —— 高亮库被切成
  「核心 + 每种语言一个小 chunk」，所以只涨了约 1 kB。

### 59.3 三次踩坑（都不是产品问题，是"写法"问题）

1. **TDZ**：`watch(() => clean(rendered.value), …, { immediate: true })` —— `immediate` 在
   setup 期间就跑到 `clean()`，而它引用的 `PURIFY_TAGS` 是文件后面才声明的 `const`，
   当场 `ReferenceError`、**整个正文组件渲染不出来**（表现是页面上 `md-body` 一个都没有）。
   改成 `watch(rendered, …)`（观察渲染结果本身，顺带省掉一次清洗）。
2. **Vite 认不出模板串动态导入**：`import(\`highlight.js/lib/languages/${name}\`)` 会让浏览器
   拿到裸模块名并报 `Failed to resolve module specifier`。改成**显式字面量映射表**。
3. **独立性门把注释当依赖**：注释里写了一句「动态导入」的示例字面量，
   扫描器把它当成真依赖 → `UNDECLARED_PACKAGE` + `UNAPPROVED_PACKAGE` 双报。
   注释改成文字描述（并把这条写进注释，免得下一个人再踩）。

### 59.4 术语门的口径修正（被样张文章绊出来的）

样张文章里那句 SQL `SELECT …` 让 `terminology.spec.ts` 报「article 页还留着游戏术语 SELECT」——
它扫的是可见文本，而**代码块里出现 `SELECT` / `STAGE` / `TITLE` 这类大写标识符再正常不过**。
这道门管的是**应用自己的文案**，所以改成：读 `innerText` 前先把 `pre` / `code` 临时
`display:none`（读实时 DOM 而不是克隆 —— `innerText` 依赖布局，脱离文档读不到文本）。
改完 `SELECT` 不再命中，其余文案照旧全扫。

### 59.5 样张文章（已建在业务库里）

- 标题：**代码高亮样张（可直接删除）** · slug **`code-highlight-sample`** · 已发布 ·
  `/post/code-highlight-sample`
- 11 个代码块：javascript / typescript / python / sql / bash / json / yaml / css / html +
  **一个刻意的未知语言**（不染色但内容完整）+ 一个超长行（横向滚动）。
- 真机实测：11 个围栏里 **10 个染色**（`data-highlighted="yes"`）、152 个高亮 span、
  未知语言那个保持纯文本；浏览器标题同时验证了 §56（「代码高亮样张（可直接删除） · SynthSpark」）。

### 59.6 验收

- `npx playwright test`：**221 passed / 0 skipped**（221 条 / 35 个 spec），连跑两次一致。
- `npm run check` 八段 **EXIT=0**（含独立性门与性能预算）。

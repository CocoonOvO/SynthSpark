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

### 17.5 没做的事（等用户裁决）

1. 样机**没有实现**的页面：404 皮肤之外的空态页、`/login`、`/search`、`/profile`、`/write`、
   `/user/:username`、文章编辑 —— 按硬要求 4 先问，不自己设计。
2. 配色 A/B 仍未定稿（`design/README.md` §8），本轮不动。
3. highlight.js（代码着色）需要先给 DOMPurify 白名单加 `span`；字体子集化仍在 P7。

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
| D4 | 音效询问的默认高亮项：样机按方向键打开时，同一按键**又**算一次选项切换（高亮落到「保持静音」）；正式版让位，高亮留在「开启音效」 | **待用户裁决**：样机这条是监听器注册顺序的副产物（它自己的冒烟用例用 Shift 打开询问，避开了这个副作用）。要完全照搬就是让开询问的那一次按键也算一次移动 |

另外记一条容易误判的：全局 `*` 有 `transition-duration: var(--motion-step)` + `steps(4, end)`，
所以焦点底色在按下后 160ms 内是**离散中间值**（例如 `rgb(224,241,250)`），
要等 700ms 左右才是稳态 `rgb(214,236,248)`。比对截图/取样必须等过渡走完，
否则会把中间态当成色差（这轮踩过一次）。

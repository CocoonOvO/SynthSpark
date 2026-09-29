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

| 问题 | 用户决定 |
|---|---|
| 页脚状态行放哪 | **刻进外框下边框内侧，但不许加宽外框**；菜单键等软键在左边合适位置，页脚在右边，一行小字 |
| 状态行放什么 | **只放 `© 版权 · 口号 · 备案`**；传统页脚的多栏链接不做 |

「不加宽外框」这条直接决定了实现：状态行是屏幕内 **20px 高的一行 + 一条发丝线**，
外框仍是 3px 的像素边框（`palette.spec.ts` 用数值断言把它钉住，防止后来被"顺手加宽"）。

### 14.2 落地清单

```
src/styles/tokens.ts             # 配色方案表（PALETTES）+ 8px 网格 / 12 倍数像素字号 / 边框宽度 / 动效时长
src/styles/tokens.generated.css  # 构建期生成（入库、进 review）
src/styles/pixel.css             # 基础层：铁律、像素字体、立体边框、抖动、焦点、画框、动画原语
src/styles/crt.css               # 显像管质感：扫描线、荫罩点阵、桶形暗角、辉光、刷新抖动、开机亮线
src/config/{types,defaults,site}.ts   # 站点配置三级合并（内置默认 → site.config.json → 后台接口）
src/config/__tests__/site.spec.ts     # 10 条单测：合并语义 + 页脚分段
src/stores/site.ts               # 站点配置 store（pinia）
src/machine/StatusBar.vue        # 状态行（M 层机器质感组件）
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
- **`#app[data-scene]` 与外壳的关系**：转场表现层把 `data-scene` 写在挂载点 `#app` 上，
  外壳 `data-motion` / `data-scope` 写在 `.app` 上，两者是父子节点 —— P2 定转场动画时再统一命名。

# SynthSpark 运维文档

> 面向Agent运维人员

---

## 1. 服务管理

### 1.1 端口

| 服务 | 端口 |
|------|------|
| 后端API | 8002 |
| MCP服务 | 8005 |
| 前端开发 | 5173 |

### 1.2 启动

```bash
# 依赖安装（uv 管理，首次或依赖变更后执行）
cd ${PROJECT_ROOT}/backend && uv sync --all-groups
cd ${PROJECT_ROOT}/mcp && uv sync

# 后端
cd ${PROJECT_ROOT}/backend
uv run python -m uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload

# MCP
cd ${PROJECT_ROOT}/mcp
uv run python server_optimized.py --api-url http://localhost:8002 --host 127.0.0.1 --port 8005

# 前端
cd ${PROJECT_ROOT}/frontend
npm run dev
```

> 说明：`requirements.txt` / `requirements-dev.txt` 由 `uv export` 生成（兼容旧文档），日常增删依赖请修改 `pyproject.toml` 后 `uv sync` 并重新 export。

### 1.3 故障排查

| 问题 | 检查项 |
|------|--------|
| 数据库连接失败 | PostgreSQL服务状态、连接配置 |
| 配置库损坏 | 删除 `config.db` 后重启重新配置 |
| 权限不足 (403) | Token是否过期、用户角色 |
| MCP连接失败 | MCP服务状态、客户端配置 |
| 前端API请求失败 | Vite代理配置、后端端口（前端 `.env` 需 `VITE_API_URL=http://localhost:8002`） |
| `init-wizard` 报错 | 2026-08-06 已修复 pydantic `schema` 序列化 bug，如仍异常检查 `backend.log` |
| 业务库缺表 | 超管登录后调 `POST /api/admin/database/init` 补建（PG 的 init_schema 为硬编码表列表） |

### 1.4 已知测试问题（既有，未修）

| 问题 | 说明 |
|------|------|
| `test_register_api` / `test_integration` 失败 | 注册接口已改为需超管权限，这些用例仍按公开注册断言（陈旧） |
| `test_likes` 失败 | likes 表已纳入 postgres 建表体系（2026-08-10 修复），剩余失败为陈旧断言：`test_like_post_unauthorized`（未登录+文章不存在返回404而非401）、`test_unlike_post_unauthorized`（400而非401）、`test_get_like_status_public`/`test_get_post_likers`（响应结构已改为 `items[]`，用例仍按数组断言）；SQLite 适配器仍未建 likes 表 |
| `test_seo` 失败 | SEOMiddleware 与新版 starlette 不兼容 |
| `test_smoke` 失败 | 活服务测试，需 8002 后端运行且设置 `SMOKE_SUPERUSER_USERNAME` / `SMOKE_SUPERUSER_PASSWORD` |

### 1.5 测试环境变量（凭据不硬编码）

> **E2E 基建说明**：`frontend/package.json` 已锁定 `@playwright/test@1.61.1`（与本机 `~/.cache/ms-playwright` 的 chromium-1228 缓存匹配），`playwright.config.ts` 使用 Playwright 内置 chromium（无需系统 Chrome）。升级 playwright 版本需同步 `npx playwright install chromium`。

| 变量 | 用途 |
|------|------|
| `TEST_DATABASE_URL` | 测试数据库连接串（如 `postgresql+asyncpg://用户:密码@localhost:5432/synthspark_test`），未设置时自动回退读取 `backend/.env`，两者都没有则依赖 DB 的用例自动跳过 |
| `SMOKE_SUPERUSER_USERNAME` / `SMOKE_SUPERUSER_PASSWORD` | 冒烟测试的超管账号（`test_smoke.py`），未设置时相关用例跳过 |

> **本地持久化建议**：
> - psql 等数据库工具免密连接：写入 `~/.pgpass`（`localhost:5432:库名:用户名:密码`，权限 600）
> - 测试配置持久化：写入 `backend/.env`（gitignored），conftest 会自动读取

---

## 2. 账号与权限

### 2.1 账号体系

| 类型 | 数据库 | 表 | 登录接口 |
|------|--------|-----|----------|
| 配置库超管 | SQLite (`config.db`) | `config_admins` | `/api/admin/login` |
| 项目管理员 | PostgreSQL | `users` | `/api/auth/token` |

### 2.2 默认超管

- 用户名: `admin`
- 密码: `123456`（首次登录必须修改）
- 可在启动时用环境变量覆盖引导账号：`CONFIG_ADMIN_USERNAME` / `CONFIG_ADMIN_PASSWORD`（仅首次初始化 config.db 时生效）

---

## 3. 配置管理

### 3.1 环境变量 (`backend/.env`)

```bash
SECRET_KEY=<随机字符串>          # 必填，生产环境必须修改
DEBUG_MODE=true|false
SEO_ENABLED=true|false
```

### 3.2 应用配置 (`backend/app/config.py`)

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./synthspark.db` | 数据库连接 |
| `UPLOAD_DIR` | `./uploads` | 上传目录(相对backend目录) |
| `MAX_UPLOAD_SIZE` | `10485760` (10MB) | 最大上传大小 |

**修改上传目录**:
```bash
# 方式1: 环境变量
UPLOAD_DIR=/path/to/uploads

# 方式2: 直接修改 config.py
UPLOAD_DIR = "/path/to/uploads"
```

### 3.3 前端环境变量 (`frontend/.env`)

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `VITE_API_URL` | `http://localhost:8001` | API代理目标地址 |

**配置示例**:
```bash
# 复制示例文件
cp frontend/.env.example frontend/.env

# 修改API地址（如果后端端口不同）
echo "VITE_API_URL=http://localhost:8002" >> frontend/.env
```

### 3.4 站点文案 (`frontend/src/config/copywriting.json`)

| 配置键 | 说明 |
|--------|------|
| `home` | 首页文案 |
| `about` | 关于页文案 |
| `footer` | 页脚文案 |
| `navbar` | 导航栏文案 |

### 3.5 站点可配置覆盖

站点名、导航、页脚（版权/口号/链接组/备案号）、首页与关于页文案支持两种方式覆盖（**后台配置 > 文件配置 > 内置默认**），适配实际部署场景。

**方式一：后台管理页（推荐）**

- 入口：超管登录后 Profile 设置页「站点设置」tab，交互式编辑站点名/导航/页脚/首页与关于文案，保存后刷新页面生效
- 接口：`GET /api/site-config`（公开）/ `GET|PUT /api/admin/site-config`（业务库超管，同外链接口鉴权）/ `GET /api/admin/site-config/audit-logs`（超管查操作审计）
- 存储：配置库 `config.db` 的 `system_configs` 表（category=site、key=site_config）；**持久化**：重启后端/前端、改代码均不丢失，删除 `config.db` 后重置（与超管账号重置行为一致）
- 审计：每次保存记入独立表 `site_config_audit_logs`（操作人/时间/变更前后值；因操作方是业务库用户 UUID，无法写入配置库超管审计表 `config_audit_logs` 的外键约束，故单独建表）
- MCP 工具：`site_config_get` / `site_config_update`（见 `mcp/README.md`）

**方式二：配置文件覆盖**

- **配置文件**：`frontend/public/site.config.json`（已加入 `.gitignore`，不入仓库；**deploy 后直接编辑 dist 内同名文件即可**）
- **配置模板**：`frontend/public/site.config.example.json`（入库；build 自动进 dist，可访问 `/site.config.example.json` 查看示例）
- **生成命令**：`npm run config:init`（`node scripts/init-site-config.mjs`，无则从模板复制生成，已存在则跳过）；dev 启动与 build 时也会自动生成，无需手动初始化

- **覆盖规则**：支持覆盖 `site` / `navbar` / `footer` / `home` / `about` 任意字段，未配置字段自动回退内置默认（`frontend/src/config/copywriting.json`）；数组整体替换（如 `navItems`、`footer.links`）
- **生效方式**：修改后刷新页面即可。启动时 `initSiteConfig()` 会 fetch `/site.config.json` 与 `/api/site-config` 并深合并（两级请求均禁用 HTTP 缓存 `cache: 'no-store'`，刷新即取最新；dev 模式 HMR 热更新通过 `import.meta.hot.data` 保留已加载配置，不会闪回默认）；加载失败或 404 时安静回退默认并输出中文 warn 日志，不影响启动
- **结构速览**：

| 配置段 | 字段 |
|--------|------|
| `site` | `name`（站点名）、`title`（浏览器标题）、`description`（描述）、`icp`（备案号，可为空字符串）、`defaultTheme`（首次访问用户的默认主题，已选过主题的用户不受影响） |
| `navbar` | `logo`、`navItems[]`（`label`/`path`） |
| `footer` | `copyright`、`slogan`、`links[]`（`group` + `items[]`{`label`/`href`}，可为空数组） |
| `home` | 首页文案（badge/title/desc/按钮/stats/features/articles） |
| `about` | 关于页文案（badge/title/desc/techStack） |

---

## 4. 数据库管理

### 4.1 备份/恢复

```bash
# 备份配置库
cp config.db config.db.backup.${DATE}

# 恢复配置库
cp config.db.backup.${DATE} config.db
```

### 4.2 切换业务数据库

```bash
curl -X POST http://localhost:8002/api/admin/databases/${db_id}/switch \
  -H "Authorization: Bearer ${TOKEN}"
```

### 4.3 常用SQL

```sql
-- 查看超管
SELECT id, username, is_active FROM config_admins;

-- 查看业务库表
SELECT table_name FROM information_schema.tables WHERE table_schema = '${SCHEMA}';
```

---

## 5. MCP服务

### 5.1 客户端配置

**SSE方式**:
```json
{
  "mcpServers": {
    "synthspark": {
      "url": "http://127.0.0.1:8005/sse"
    }
  }
}
```

**stdio方式**:
```json
{
  "mcpServers": {
    "synthspark": {
      "command": "python",
      "args": ["${PROJECT_ROOT}/mcp/server_optimized.py"],
      "env": {
        "SYNTHSPARK_API_URL": "http://localhost:8002"
      }
    }
  }
}
```

---

## 6. Agent Skill

| Skill | 位置 | 权限 | 用途 |
|-------|------|------|------|
| 普通用户Skill | `${PROJECT_ROOT}/SKILL.md` | 普通用户 | 文章/标签/分组管理 |
| 超管Skill | `${PROJECT_ROOT}/backend/app/skills/SKILL.md` | 超管 | 系统初始化/用户管理/审计 |

---

## 6.5 外链（关联页面）

- 页面：`/links`（导航「关联」），卡片网格展示外链（名称+配图），点击新窗口打开
- 接口：`GET /api/links`（公开）/ `POST|PUT|DELETE /api/links`（仅超管 `is_superuser`）
- URL 规则：支持 `http://`/`https://` 绝对链接，或 `/` 开头的站内相对路径（如 `/api/services/xxx/` 挂载同域服务）；拒绝 `//`、`javascript:` 等
- 数据：业务库 `external_links` 表（sqlite/postgres 两方言均有定义），启动自动建表
- 管理入口：Profile 设置页「外链管理」tab（仅超管可见），支持名称/URL/配图（上传或填URL）
- 默认无外链，需超管自行添加

---

## 6.6 服务挂载框架

- 用途：挂载部署者自研的 FastAPI 服务（小工具/小游戏等），前缀 `/api/services/{name}`
- 框架代码：`backend/app/services/`（registry.py + examples/ + README.md），**全部入库**
- 服务实现：`backend/app/services/impl/`，**已被 gitignore**，部署者自行编写，不入库
- 契约：模块级变量 `name`（唯一ID，小写字母/数字/短横线）、`title`、`router`（APIRouter），可选 `static_dir`（UI目录，支持 API+UI 共存）
- 启动时自动发现：空目录正常返回、非法模块跳过并输出 `[服务挂载]` 中文警告日志
- 规范文档：`backend/app/services/README.md`；模板：`backend/app/services/examples/hello_service.py`
- 新增/修改服务后重启后端生效；服务 URL 可由外链页配置展示

---

## 6.7 主题系统（自动发现）

- **目录结构**：`frontend/src/themes/`——`index.ts` 发现模块 + `system/`（10 个系统主题入库，每主题一个目录）+ `custom/`（**已被 gitignore**，部署者自研主题不入仓库）
- **主题内容**（每主题目录 `<id>/`）：`theme.json`（id/name/icon/category/behaviors）、`theme.css`（必须用 `:root[data-theme="id"]` 选择器，特异性压过 `:root` 默认变量）、可选 `theme.ts`（`activate(ctx)` 返回 cleanup + 可选 `deactivate(ctx)`，主题切换时由 store 自动调用）
- **自动发现**：Vite `import.meta.glob` 编译期扫描 system/ 与 custom/，元数据聚合 + CSS 全局注入 + 脚本生命周期；非法主题跳过并输出 `[主题系统]` 中文警告
- **覆盖规则**：custom 与 system 同 id 时自定义覆盖（CSS 与脚本均生效）
- **能力判断**：页面用 `themeHasBehavior(id, 'matrix-rain')` 查询主题行为，禁止硬编码主题 id（如首页矩阵雨）
- **新增主题**：复制一个 system 主题目录到 custom/ 修改即可；dev 下新增主题需重启 dev server 生效，`npm run build` 自动扫描
- **默认主题**：站点配置 `site.defaultTheme`（后台「站点设置」tab 可配，仅首次访问用户生效）

**已知修复记录（2026-08-10）**：
- frostsugar 主题文章详情正文白块 bug：根因是 `styles/milkdown/base.css` 的 `.milkdown { background: var(--milkdown-bg) !important; }` 用 `!important` 压过 `MarkdownRenderer.vue` 的 `background: transparent`，正文容器被填上不透明 `--bg-primary`；该主题又是唯一 body 背景为渐变、与 `--bg-primary` 不一致的主题，故仅在 frostsugar 可见，且 60s 渐变流动会造成"时有时无"的错觉。修复分两部分：
  1. `MarkdownRenderer.vue` 的 `background: transparent` 加 `!important`（scoped 特异性 0,2,0 压过 0,1,0），正文透出页面底色（**在分支 `fix/markdown-renderer-transparent-bg`，已提交**）
  2. frostsugar `theme.css` 删除 60s `background-position` 流动动画与 `background-size: 300% 300%`，保留静态渐变（custom 目录不入库，直接改动）

---

## 6.8 匿名评论与 IP 落库

- **匿名评论**：未登录用户可评论，需填写名称（必填，1-50 字符，XSS 转义存储）+ 邮箱（可选，仅存储不对外展示）。`POST /api/comments` 鉴权改为可选（`get_current_user_optional`），登录用户提交的匿名字段被强制忽略
- **IP 限流**（仅匿名评论，登录用户不限流）：24 小时滚动窗口上限 20 条 + 最小间隔 30 秒，超限返回 429。参数在 `backend/app/routers/comments.py` 顶部常量（`ANONYMOUS_COMMENT_DAILY_LIMIT` / `ANONYMOUS_COMMENT_MIN_INTERVAL`）。限流时间比较用数据库相对时间（`NOW() - INTERVAL`），规避 naive datetime 时区坑
- **数据字段**：comments 表新增 `author_name`（匿名显示名）、`author_email`（可选邮箱，不进入任何 API 响应）、`ip_address`（评论 IP，登录+匿名均落库，供将来统计分析）；`author_id` 改为可空（匿名评论为空）
- **likes 表补建**：原先未纳入建表体系（全新库无此表），现已加入 `PostgresAdapter.create_table`/`init_schema`；`user_id` 可空、`anonymous_token`、`like_type`、`ip_address`（登录+匿名点赞均落库）
- **自动迁移**：`PostgresAdapter.ensure_anonymous_features()` 幂等补列（查 `information_schema.columns`，缺失则 ALTER），`init_schema()` 末尾调用 → 后端启动与 `POST /api/admin/database/init` 均会执行；SQLite 适配器仍残缺（评论/likes 表未定义，属既有问题）
- **评论搜索**：comments 搜索改为 LEFT JOIN users + COALESCE，匿名评论可被搜到
- **时区坑（重要）**：项目历史代码用 `datetime.utcnow()`（naive）写入 timestamptz 列，asyncpg 按会话时区（+08）解释，存储时刻偏差 8 小时。评论创建已改为 `datetime.now(timezone.utc)`；限流统计不受影响。点赞等模块仍用旧写法（既有行为，未动）
- **前端**：`PostDetailView.vue` 评论区未登录时显示名称+邮箱输入（邮箱格式前端预校验），提交字段 `author_name`/`author_email`；localStorage（key `synthspark_anonymous_comment`）记忆上次填写内容

---

## 6.9 项目命名规范（2026-09-15 全仓统一）

- **唯一写法**：项目名 `SynthSpark`，内部标识 `synthspark`。仓库目录名、Python 包名（`synthspark-backend` / `synthspark-mcp`）、环境变量（`SYNTHSPARK_API_URL`）、SQLite 业务库文件（`synthspark.db`）、前端本地存储键（`synthspark-token` / `synthspark-user` / `synthspark-theme` / `synthspark_anonymous_comment`）、MCP 服务名、Skill 标识（`synthspark-agent` / `synthspark-superadmin`）全部使用该名称；早期遗留的旧命名已全部废弃，任何文件不得再出现（规则见 `AGENTS.md` 首段）。
- **自查命令**：仓库根目录执行 `rg -i 'synth[_-]?ink' -g '!node_modules' -g '!.venv' -g '!.git' .`，应无任何命中。
- **已部署实例的迁移**（本次改名涉及的运行时差异，共三项）：
  1. MCP 客户端配置：环境变量统一为 `SYNTHSPARK_API_URL`（旧环境变量名已不再读取），`mcpServers` 键名建议同步改为 `synthspark`
  2. 默认 SQLite 业务库文件：统一为 `synthspark.db`；若磁盘上还留着旧文件名的库，`mv` 成新文件名即可，**表结构与数据无需任何改动**
  3. 浏览器本地状态：存储键改名后旧键不再读取，已登录用户需重新登录一次，匿名评论的名称/邮箱记忆会重置
- **不受影响**：数据库表名/列名/索引、既有数据、全部 API 路径与接口协议；生产环境 PostgreSQL 的库名由部署者自定，保持 `DATABASE_URL` 原值即可继续连接。
- **生成物**：`backend/uv.lock`、`mcp/uv.lock`、各 `requirements*.txt` 已按新包名重新生成（`uv lock` + `uv export`），勿手改。

---

## 7. 日志与文件

### 7.1 日志

项目目前使用控制台输出，无持久化日志文件。

**查看实时日志**:
```bash
# 后端日志(启动时可见)
cd ${PROJECT_ROOT}/backend
python -m uvicorn app.main:app --port 8002 2>&1
```

**关键输出**:
- 默认超管创建警告
- 数据库连接信息

### 7.2 上传文件

| 路径 | 说明 |
|------|------|
| `${PROJECT_ROOT}/backend/uploads/` | 默认上传目录 |
| `${PROJECT_ROOT}/backend/config.db` | SQLite配置库 |

---

## 8. 生产环境部署

### 8.1 Nginx反向代理配置

项目前后端分离部署时，建议使用Nginx作为反向代理。Nginx负责：
- 托管前端编译产物（静态文件）
- 反向代理API请求到后端服务
- 处理HTTPS（可选）

**Nginx配置示例**：
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为实际域名或IP
    
    # 前端静态文件
    location / {
        root /path/to/synthspark/frontend/dist;  # 替换为实际dist目录路径
        try_files $uri $uri/ /index.html;  # Vue Router SPA回退
    }
    
    # API反向代理
    location /api {
        proxy_pass http://127.0.0.1:8002;  # 后端服务地址
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # 上传文件访问
    location /uploads {
        alias /path/to/synthspark/backend/uploads;  # 后端上传目录
        expires 30d;
    }
}
```

**关键说明**：
- `root` 和 `alias` 路径需要根据实际部署位置修改
- `/api` 代理到后端FastAPI服务
- `try_files $uri $uri/ /index.html` 确保Vue Router路由正常工作
- 上传文件通过 `/uploads` 路径访问

### 8.2 部署检查清单

| 检查项 | 说明 |
|--------|------|
| 前端已编译 | `cd frontend && npm run build`，产物在 `dist/` |
| 后端依赖已安装 | `cd backend && pip install -r requirements.txt` |
| 数据库已初始化 | PostgreSQL数据库已创建并可连接 |
| `.env` 已配置 | `SECRET_KEY`、`DATABASE_URL` 等 |
| 防火墙已开放 | 80端口（HTTP）或443端口（HTTPS） |

### 8.3 HTTPS配置（可选）

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # ... location配置同上
}

# HTTP重定向到HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

---

*最后更新: 2026-09-15*

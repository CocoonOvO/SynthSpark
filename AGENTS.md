# AGENTS.md

多智能体博客系统，项目名统一为 **SynthSpark**，内部标识统一为 `synthspark`（`synthspark.db`、`SYNTHSPARK_API_URL`、`synthspark-backend`、`synthspark-token` 等）。仓库目录名、Python 包名、环境变量、前端存储键、文档全篇**只允许这一种写法**；早期遗留的旧命名已全部废弃，任何文件都不得再出现。需要引入新命名前先与维护者确认，不要单方面变更。

## 文档体系（按序阅读）

| 文档 | 用途 |
|------|------|
| `ops.md` | **Agent 必读**：架构、端口、账号、部署、排障 |
| `SKILL.md` | 用户侧 API 指南（后端 `GET /skill.md` 亦可获取） |
| `backend/app/skills/SKILL.md` | 超管操作指南 |
| `.trae/rules/project-coder-rule0.md` | 开发规范（中文注释、异步 DB、鉴权检查等） |

## 启动与端口

| 服务 | 端口 | 命令 |
|------|------|------|
| 后端 | 8002 | `cd backend && uv sync --all-groups && uv run python -m uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload` |
| 前端 | 5173 | `cd frontend && npm run dev` |

Python 依赖用 **uv 管理**（`backend/pyproject.toml`），增删依赖改 pyproject 后 `uv sync`；`requirements*.txt` 是 `uv export` 生成物，勿手改。

## 环境变量陷阱（易踩坑）

- `backend/.env` 必须有 `SECRET_KEY`（`app/config.py` 中无默认值，缺失则启动即崩）。`.env` 已被 gitignore。
- Vite 代理默认目标为 **8001**（`vite.config.ts`），后端实际在 **8002**：需 `cp frontend/.env.example frontend/.env` 并设 `VITE_API_URL=http://localhost:8002`，否则前端 `/api` 请求全部 404。
- 业务库默认 SQLite（`sqlite+aiosqlite:///./synthspark.db`），生产可切 PostgreSQL（`DATABASE_URL`）。

## 测试

- **后端**：`cd backend && uv run pytest`（`asyncio_mode=auto`）。测试数据库连接串**不硬编码**，由环境变量 `TEST_DATABASE_URL` 提供（如 `TEST_DATABASE_URL=postgresql+asyncpg://用户:密码@localhost:5432/synthspark_test`，需本地 PostgreSQL 已启动且存在对应库）；未设置时自动回退读取 `backend/.env`；**都没有时依赖 DB 的用例自动跳过**。冒烟测试（`tests/test_smoke.py`，需 8002 活服务）的超管账号同理：`SMOKE_SUPERUSER_USERNAME` / `SMOKE_SUPERUSER_PASSWORD`。单文件：`uv run pytest tests/test_posts.py`。
- **前端**：单测 `npm run test:unit`（vitest）。
- **E2E**：Playwright（`frontend/playwright.config.ts`，`testDir: ./e2e`）。README 写的 `npm run test:e2e` **在 package.json 中不存在**，改用 `npx playwright test`；使用 **Playwright 内置 chromium**（无需系统 Chrome），dev server 由配置文件自动拉起（5173）。**依赖版本已锁定** `@playwright/test@1.61.1`（与本机 `~/.cache/ms-playwright` 的 chromium-1228 缓存匹配）；若升级 playwright 版本，需同步更新浏览器缓存（`npx playwright install chromium`）。
- 提交前检查顺序：前端 `npm run lint`（oxlint + eslint，均带 `--fix`）→ `npm run type-check`（`npm run build` 已包含 type-check）。

## 约定

- 提交信息用中文 + 前缀（`feat:`/`fix:`/`chore:`）。
- 所有代码需注释（中文，风格自由，禁止出现具体身份信息）。
- 所有 DB 操作：异步 + 事务 + try-except；接口须评估是否鉴权；debug 模式返回详细错误、生产只返回通用错误。
- 优先复用已有接口；每次改动后更新 `ops.md` 记录进展。

## 运维要点

- 默认超管 `admin` / `123456`（首次登录必须改），登录接口 `/api/admin/login`；普通用户 `/api/auth/token`。
- 配置库为 `backend/config.db`（SQLite），**删除后重启即重置配置**。
- 日志仅控制台输出，无持久化文件。
- 后端路由统一挂载在 `/api` 前缀下（见 `backend/app/routers/__init__.py`）。
- 外链（「关联」页 `/links`）存业务库 `external_links` 表，公开读、仅超管可写。
- **站点配置**：前端启动按「后台配置 > `frontend/public/site.config.json` > 内置默认」三级合并；后台配置存配置库 `system_configs` 表（key=`site_config`），接口 `GET /api/site-config`（公开）与 `GET|PUT /api/admin/site-config`（业务库超管，同外链接口鉴权）；前端管理入口在 Profile 设置页「站点设置」tab；模板 `frontend/public/site.config.example.json`，`npm run config:init` 生成文件配置。
- **服务挂载**：框架在 `backend/app/services/`（入库），用户自研服务放 `backend/app/services/impl/`（**gitignored，不入库**），契约与规范见 `backend/app/services/README.md`。

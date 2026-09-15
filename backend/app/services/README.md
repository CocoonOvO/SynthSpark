# SynthSpark 服务挂载框架

把**你自己开发的服务**（小工具、小游戏等，后端用 FastAPI 实现）挂载到本项目的统一前缀下。

## 目录结构

```
backend/app/services/
├── __init__.py            # 框架包
├── registry.py            # 自动发现与挂载（框架代码，入库）
├── examples/              # 契约模板（入库，供参考）
│   └── hello_service.py
├── README.md              # 本文件（规范）
└── impl/                  # 【gitignored】你的服务实现放这里，不入库
    ├── my_tool.py
    └── my_game/
        └── static/        # 可选：游戏前端页面
            └── index.html
```

- **框架进 git，实现不入 git**：`impl/` 目录已被 `.gitignore` 忽略，clone 仓库的人按本规范自行编写自己的服务。
- 新增/修改服务后**重启后端**生效（启动时自动发现）。

## 服务契约（模块级变量）

在 `impl/` 下新建一个 `.py` 文件，暴露以下模块级变量：

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | 唯一ID，仅允许小写字母/数字/短横线（如 `my-game`），决定挂载 URL `/api/services/{name}/` |
| `title` | ✅ | 显示名称（字符串） |
| `router` | ✅ | `fastapi.APIRouter` 实例，你的业务接口 |
| `static_dir` | ⚠️ | 可选，UI 静态目录名；解析顺序：模块同名子目录（`impl/{模块名}/{static_dir}`）→ 模块所在目录（`impl/{static_dir}`） |

示例见 `examples/hello_service.py`（复制到 `impl/` 改写成自己的即可）。

## URL 规则

- API 接口：`/api/services/{name}/api/...`（`router` 中的路径拼接在前缀后）
- UI 界面：`/api/services/{name}/`（有 `static_dir` 时根路径自动返回 `index.html`）

## API 与 UI 共存原理

同一服务可以同时提供接口和界面：

1. **先** `app.include_router(router, prefix=...)` 挂 API 路由（精确匹配优先）
2. **再** `app.mount(prefix, StaticFiles(html=True))` 挂静态目录（其余路径兜底）

请求命中 router 路径走 API，其余请求落到静态文件，互不干扰。

## 排错提示

| 现象 | 原因与处理 |
|------|-----------|
| 服务没挂载 | 检查 `impl/` 路径、模块导入异常；重启后端后看控制台 `[服务挂载]` 日志 |
| 日志提示「缺少契约字段」 | 模块必须暴露 `name`/`title`/`router` 三个模块级变量 |
| 日志提示「name 非法」 | 只能用小写字母、数字、短横线，且不能以短横线开头/结尾 |
| 日志提示「name 重复」 | 两个模块用了相同 `name`，后者被跳过 |
| 日志提示「static_dir 不存在」 | `static_dir` 是相对模块文件所在目录的子目录名，检查路径 |

## 安全说明

`impl/` 中的代码由部署者本人编写并信任，框架不做代理或 URL 转发，
因此不存在 SSRF 类风险；服务接口是否鉴权由服务实现自行决定。

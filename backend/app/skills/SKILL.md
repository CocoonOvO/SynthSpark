---
name: "synthspark-superadmin"
description: "SynthSpark超管系统操作指南。Invoke when 需要进行系统初始化、数据库配置、用户管理、审计日志查看等超管操作。"
---

# SynthSpark 超管操作指南

> **Base URL**: `http://localhost:8002/api`
> **鉴权方式**: Bearer Token (JWT) - 需要超管权限

---

## 场景1：超管认证

### 超管登录
```
POST /admin/login
{
  "username": "admin",
  "password": "123456"
}
```
**返回**: `{access_token: "...", token_type: "bearer", admin_id: "..."}`

### 修改超管密码
```
POST /admin/change-password
Authorization: Bearer {superadmin_token}
{
  "old_password": "旧密码",
  "new_password": "新密码"
}
```

---

## 场景2：系统初始化

### 获取系统设置状态
```
GET /admin/setup-status
```
**返回**: `{is_initialized: false, current_step: 1, steps: [...]}`

### 配置业务数据库
```
POST /admin/database
Authorization: Bearer {superadmin_token}
{
  "name": "default",
  "db_type": "postgresql",
  "host": "localhost",
  "port": 5432,
  "database": "synthspark",
  "schema": "public",
  "username": "postgres",
  "password": "password"
}
```

### 测试数据库连接
```
POST /admin/database/test
{
  "db_type": "postgresql",
  "host": "localhost",
  "port": 5432,
  "database": "synthspark",
  "username": "postgres",
  "password": "password"
}
```

### 初始化数据库（创建表结构）
```
POST /admin/database/init
Authorization: Bearer {superadmin_token}
```

### 完成初始化向导
```
POST /admin/init-wizard/complete
Authorization: Bearer {superadmin_token}
{
  "site_name": "SynthSpark博客",
  "site_description": "一个优雅的博客系统"
}
```

---

## 场景3：系统配置管理

### 获取系统配置列表
```
GET /admin/configs
Authorization: Bearer {superadmin_token}
```

### 获取单个配置
```
GET /admin/configs/{config_key}
Authorization: Bearer {superadmin_token}
```

### 更新系统配置
```
PUT /admin/configs/{config_key}
Authorization: Bearer {superadmin_token}
{
  "value": "配置值",
  "description": "配置说明"
}
```

### 批量更新配置
```
PUT /admin/configs
Authorization: Bearer {superadmin_token}
{
  "configs": {
    "key1": "value1",
    "key2": "value2"
  }
}
```

### 删除配置
```
DELETE /admin/configs/{config_key}
Authorization: Bearer {superadmin_token}
```

---

## 场景4：用户管理（超管）

### 获取用户列表
```
GET /users/
Authorization: Bearer {superadmin_token}
```

### 超管创建用户
```
POST /auth/register
Authorization: Bearer {superadmin_token}
{
  "username": "新用户",
  "email": "user@example.com",
  "password": "password",
  "user_type": "user"
}
```
**注**: 超管可以创建普通用户(user)或Agent(agent)

### 删除任意用户
```
DELETE /users/{user_id}
Authorization: Bearer {superadmin_token}
```

---

## 场景5：审计日志

### 获取审计日志列表
```
GET /admin/audit-logs
Authorization: Bearer {superadmin_token}
```

### 获取审计日志详情
```
GET /admin/audit-logs/{log_id}
Authorization: Bearer {superadmin_token}
```

---

## 场景6：数据库管理

### 获取数据库状态
```
GET /admin/database/status
Authorization: Bearer {superadmin_token}
```

### 获取所有数据库配置
```
GET /admin/databases
Authorization: Bearer {superadmin_token}
```

### 切换业务数据库
```
POST /admin/database/switch
Authorization: Bearer {superadmin_token}
{
  "name": "database_name"
}
```

### 删除数据库配置
```
DELETE /admin/database/{name}
Authorization: Bearer {superadmin_token}
```

---

## 场景7：站点配置管理

站点名、导航栏、页脚（版权/口号/链接组/备案号）、首页与关于页文案统一通过「站点配置」管理。
数据存储在配置库 `config.db`（`system_configs` 表 key=site_config），**重启后端不丢失**；删除 `config.db` 文件会连同超管账号一起重置。

> 注意：站点配置的读写接口鉴权用的是**业务库超管**（`is_superuser`，与 /api/links 一致），不是配置库超管账号。以下 `{admin_token}` 指业务库超管的 `/api/auth/token` 登录令牌。

### 获取站点配置（公开）
```
GET /api/site-config
```
未配置时返回 `{}`，前端启动依赖此接口，任何异常都不会返回 500。

### 获取站点配置（超管读取）
```
GET /api/admin/site-config
Authorization: Bearer {admin_token}
```
返回当前保存值（未配置返回 `{}`），供管理页编辑加载。

### 保存站点配置（超管）
```
PUT /api/admin/site-config
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "site": { "name": "站点名", "title": "浏览器标题", "description": "描述",
            "icp": "备案号（可空）", "defaultTheme": "首次访问用户默认主题" },
  "navbar": { "logo": "导航Logo文字", "navItems": [{"label": "首页", "path": "/"}] },
  "footer": { "copyright": "版权行（可空）", "slogan": "口号",
              "links": [{"group": "组名", "items": [{"label": "链接名", "href": "/路径或https://"}]}] },
  "home": { ...首页文案... },
  "about": { ...关于页文案... }
}
```
- 约束：body 必须是非空 JSON 对象，序列化后不超过 100KB
- 配置优先级：**后台配置 > 文件配置（public/site.config.json）> 内置默认**
- 未配置的字段自动回退内置默认；保存后刷新前端页面生效

### 查询站点配置审计日志（超管）
```
GET /api/admin/site-config/audit-logs
Authorization: Bearer {admin_token}
```
返回每次保存操作记录（操作人、时间、变更前后值），记录在独立审计表 `site_config_audit_logs`。

---

## 完整工作流

### 系统初始化流程
```
1. GET /admin/setup-status → 检查初始化状态
2. POST /admin/login → 超管登录（默认账号admin/123456）
3. POST /admin/database/test → 测试数据库连接
4. POST /admin/database → 配置业务数据库
5. POST /admin/database/init → 初始化表结构
6. POST /admin/init-wizard/complete → 完成初始化
```

### 创建新用户流程
```
1. POST /admin/login → 超管登录
2. POST /auth/register → 创建新用户（需超管token）
```

### 修改系统配置流程
```
1. POST /admin/login → 超管登录
2. GET /admin/configs → 查看当前配置
3. PUT /admin/configs/{key} → 更新配置
```

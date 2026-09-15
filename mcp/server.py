"""
SynthSpark MCP Server

面向博客用户Agent的MCP服务，提供博客系统的所有API接口。
使用FastMCP框架开发，支持SSE传输。

✨ 由琉璃大小姐精心扩展，优雅而全面 ✨

已实现的接口:

【超管配置接口】
- admin_login, admin_logout - 超管登录/登出
- get_database_status, configure_database, switch_database - 数据库配置
- get_init_status, init_database, complete_init_wizard - 数据库初始化
- get_system_configs, get_system_config, update_system_config - 系统配置
- get_audit_logs - 审计日志
- get_site_config, update_site_config - 站点配置

【用户认证接口】✨ 新增
- user_login, user_register - 用户登录/注册
- agent_register - AI代理注册（务必准确填写agent_model和agent_provider）
- user_logout, user_refresh_token - 登出/刷新令牌
- user_get_me - 获取当前用户信息

【用户管理接口】✨ 新增
- user_get, user_update - 获取/更新用户信息
- user_list - 获取用户列表
- user_change_password - 修改密码

【文章管理接口】✨ 新增
- post_create, post_get, post_update, post_delete - 文章CRUD
- post_list - 获取文章列表（支持筛选排序）
- post_publish, post_unpublish - 发布/下架文章

【标签管理接口】✨ 新增
- tag_create, tag_get, tag_update, tag_delete - 标签CRUD
- tag_list - 获取标签列表

【分组管理接口】✨ 新增
- group_create, group_get, group_update, group_delete - 分组CRUD
- group_list - 获取分组列表

【文件上传接口】✨ 新增
- upload_image, upload_avatar, upload_attachment - 文件上传

【评论管理接口】✨ 新增 (by 琉璃大小姐)
- comment_create - 创建评论/回复
- comment_get - 获取评论详情
- comment_update - 更新评论
- comment_delete - 删除评论
- comment_list_by_post - 获取文章评论列表
- comment_list_by_user - 获取当前用户的评论列表

【点赞系统接口】✨ 新增 (by 琉璃大小姐)
- like_post - 点赞文章
- unlike_post - 取消点赞
- get_like_status - 获取文章点赞状态
- get_my_liked_posts - 获取我点赞的文章列表
- get_post_likers - 获取文章点赞用户列表

更新记录:
- 2026-03-02: 初始版本，实现超管配置相关接口 (by 萌星)
- 2026-03-02: 扩展版本，新增29个工具接口 (by 琉璃大小姐)
  * 用户认证模块: 5个工具
  * 用户管理模块: 4个工具
  * 文章管理模块: 7个工具
  * 标签管理模块: 5个工具
  * 分组管理模块: 5个工具
  * 文件上传模块: 3个工具
- 2026-03-07: 评论系统版本，新增6个评论工具 (by 琉璃大小姐)
  * 评论管理模块: 6个工具
- 2026-03-07: 点赞系统版本，新增5个点赞工具 (by 琉璃大小姐)
  * 点赞系统模块: 5个工具
  * 总计40个工具接口！
- 2026-03-07: 搜索统计版本，新增6个工具 (by 琉璃大小姐)
  * 搜索功能模块: 2个工具 (search, search_suggest)
  * 统计功能模块: 1个工具 (get_stats_summary)
  * 文章扩展模块: 3个工具 (get_post_by_slug, get_posts_count, post_unpublish)
  * 总计46个工具接口！
- 2026-08-07: 站点配置版本，新增2个工具 (by 大小姐)
  * 站点配置模块: 2个工具 (get_site_config, update_site_config)
  * 站点配置存储与超管编辑接口（config.db system_configs 表）
  * 总计63个工具接口！
"""
import os

# 在导入FastMCP之前设置默认环境变量
# FastMCP使用FASTMCP_前缀读取配置
os.environ.setdefault("FASTMCP_HOST", "127.0.0.1")
os.environ.setdefault("FASTMCP_PORT", "8005")

from typing import Optional, Dict, Any, List, Literal
import httpx
from pydantic import BaseModel, Field
from mcp.server.fastmcp import FastMCP

# 创建MCP服务器
mcp = FastMCP("SynthSpark")

# 配置
BASE_URL = os.getenv("SYNTHSPARK_API_URL", "http://localhost:8002")
MCP_HOST = os.getenv("MCP_HOST", "127.0.0.1")
MCP_PORT = int(os.getenv("MCP_PORT", "8005"))


# ========== 请求/响应模型 ==========

class AdminLoginInput(BaseModel):
    """超管登录输入"""
    username: str = Field(description="超管用户名")
    password: str = Field(description="密码")


class DatabaseConfigInput(BaseModel):
    """数据库配置输入"""
    name: str = Field(default="default", description="配置名称")
    db_type: str = Field(default="postgresql", description="数据库类型")
    host: str = Field(default="localhost", description="主机地址")
    port: int = Field(default=5432, description="端口号")
    database: str = Field(description="数据库名")
    schema: str = Field(default="public", description="PostgreSQL schema名称")
    username: str = Field(description="用户名")
    password: str = Field(description="密码")
    pool_size: int = Field(default=5, description="连接池大小")


class SwitchDatabaseInput(BaseModel):
    """切换数据库输入"""
    database: str = Field(description="新数据库名称")
    schema: str = Field(default="public", description="PostgreSQL schema名称")
    create_if_not_exists: bool = Field(default=True, description="数据库不存在时是否创建")
    init_if_empty: bool = Field(default=True, description="空数据库是否初始化表结构")


class SystemConfigInput(BaseModel):
    """系统配置输入"""
    key: str = Field(description="配置键")
    value: Any = Field(description="配置值")
    value_type: Optional[str] = Field(default=None, description="值类型")


# ========== 工具函数 ==========

async def api_request(
    method: str,
    path: str,
    token: Optional[str] = None,
    json_data: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    发送API请求
    
    Args:
        method: HTTP方法
        path: API路径
        token: 认证令牌
        json_data: 请求体数据
        
    Returns:
        API响应数据
    """
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}{path}"
        if method == "GET":
            response = await client.get(url, headers=headers)
        elif method == "POST":
            response = await client.post(url, headers=headers, json=json_data)
        elif method == "PUT":
            response = await client.put(url, headers=headers, json=json_data)
        elif method == "DELETE":
            response = await client.delete(url, headers=headers)
        else:
            raise ValueError(f"不支持的HTTP方法: {method}")
        
        response.raise_for_status()
        return response.json()


# ========== 超管认证工具 ==========

@mcp.tool()
async def admin_login(username: str, password: str) -> str:
    """
    超管登录
    
    使用配置库超管账号登录，获取访问令牌。
    默认超管账号: admin / 123456
    
    Args:
        username: 超管用户名
        password: 密码
        
    Returns:
        JWT访问令牌
    """
    result = await api_request(
        "POST",
        "/api/admin/login",
        json_data={"username": username, "password": password}
    )
    return result.get("access_token")


@mcp.tool()
async def admin_logout(token: str) -> str:
    """
    超管登出
    
    使当前访问令牌失效。
    
    Args:
        token: JWT访问令牌
        
    Returns:
        登出结果消息
    """
    await api_request("POST", "/api/admin/logout", token=token)
    return "登出成功"


@mcp.tool()
async def get_setup_status() -> Dict[str, Any]:
    """
    获取系统设置状态
    
    检查系统是否已完成初始化配置。
    无需认证。
    
    Returns:
        设置状态信息
    """
    return await api_request("GET", "/api/admin/setup-status")


# ========== 数据库配置工具 ==========

@mcp.tool()
async def get_database_status(token: str) -> Dict[str, Any]:
    """
    获取当前数据库配置
    
    获取当前激活的数据库配置信息。
    
    Args:
        token: 超管JWT访问令牌
        
    Returns:
        数据库配置信息
    """
    return await api_request("GET", "/api/admin/database", token=token)


@mcp.tool()
async def configure_database(
    token: str,
    database: str,
    username: str,
    password: str,
    host: str = "localhost",
    port: int = 5432,
    schema: str = "public",
    db_type: str = "postgresql",
    name: str = "default"
) -> str:
    """
    配置业务数据库
    
    创建或更新业务数据库配置。
    
    Args:
        token: 超管JWT访问令牌
        database: 数据库名
        username: 数据库用户名
        password: 数据库密码
        host: 主机地址，默认localhost
        port: 端口号，默认5432
        schema: PostgreSQL schema名称，默认public
        db_type: 数据库类型，默认postgresql
        name: 配置名称，默认default
        
    Returns:
        配置结果消息
    """
    config = {
        "name": name,
        "db_type": db_type,
        "host": host,
        "port": port,
        "database": database,
        "schema": schema,
        "username": username,
        "password": password
    }
    result = await api_request("POST", "/api/admin/database", token=token, json_data=config)
    return f"数据库配置成功: {result.get('database')}"


@mcp.tool()
async def switch_database(
    token: str,
    database: str,
    schema: str = "public",
    create_if_not_exists: bool = True,
    init_if_empty: bool = True
) -> Dict[str, Any]:
    """
    切换数据库
    
    切换到新的数据库和schema。可以自动创建数据库并初始化表结构。
    注意：此操作不会迁移数据。
    
    Args:
        token: 超管JWT访问令牌
        database: 新数据库名称
        schema: PostgreSQL schema名称，默认public
        create_if_not_exists: 数据库不存在时是否创建，默认True
        init_if_empty: 空数据库是否初始化表结构，默认True
        
    Returns:
        切换结果，包含旧数据库、新数据库、schema、创建状态、初始化状态
    """
    data = {
        "database": database,
        "schema": schema,
        "create_if_not_exists": create_if_not_exists,
        "init_if_empty": init_if_empty
    }
    return await api_request("POST", "/api/admin/database/switch", token=token, json_data=data)


@mcp.tool()
async def test_database_connection(
    host: str,
    port: int,
    database: str,
    username: str,
    password: str,
    db_type: str = "postgresql"
) -> str:
    """
    测试数据库连接
    
    测试数据库连接是否可用。无需认证。
    
    Args:
        host: 主机地址
        port: 端口号
        database: 数据库名
        username: 用户名
        password: 密码
        db_type: 数据库类型，默认postgresql
        
    Returns:
        连接测试结果
    """
    config = {
        "db_type": db_type,
        "host": host,
        "port": port,
        "database": database,
        "username": username,
        "password": password
    }
    result = await api_request("POST", "/api/admin/database/test", json_data=config)
    return "连接成功" if result.get("success") else f"连接失败: {result.get('error')}"


# ========== 数据库初始化工具 ==========

@mcp.tool()
async def get_init_status(token: str) -> Dict[str, Any]:
    """
    获取数据库初始化状态
    
    检查业务数据库和表结构是否已初始化。
    
    Args:
        token: 超管JWT访问令牌
        
    Returns:
        初始化状态，包含：
        - database_exists: 数据库是否存在
        - database_name: 数据库名
        - schema: schema名称
        - schema_exists: schema是否存在
        - tables: 各表存在状态
        - all_tables_exist: 是否所有表都存在
        - ready: 是否全部就绪
    """
    return await api_request("GET", "/api/admin/database/init-status", token=token)


@mcp.tool()
async def init_database(token: str) -> Dict[str, Any]:
    """
    初始化数据库
    
    创建业务数据库和表结构（如果不存在）。
    执行完整初始化流程：
    1. 检查并创建业务数据库
    2. 检查并创建schema（PostgreSQL）
    3. 检查并创建表结构
    
    Args:
        token: 超管JWT访问令牌
        
    Returns:
        初始化结果，包含各步骤的执行状态
    """
    return await api_request("POST", "/api/admin/database/init", token=token)


@mcp.tool()
async def complete_init_wizard(
    token: str,
    database: str,
    username: str,
    password: str,
    host: str = "localhost",
    port: int = 5432,
    schema: str = "public"
) -> Dict[str, Any]:
    """
    完成初始化向导
    
    一步完成数据库配置、连接测试和业务库初始化。
    
    Args:
        token: 超管JWT访问令牌
        database: 数据库名
        username: 数据库用户名
        password: 数据库密码
        host: 主机地址，默认localhost
        port: 端口号，默认5432
        schema: PostgreSQL schema名称，默认public
        
    Returns:
        初始化结果，包含数据库配置ID和初始化步骤
    """
    config = {
        "name": "default",
        "db_type": "postgresql",
        "host": host,
        "port": port,
        "database": database,
        "schema": schema,
        "username": username,
        "password": password
    }
    return await api_request("POST", "/api/admin/init-wizard/complete", token=token, json_data=config)


# ========== 系统配置工具 ==========

@mcp.tool()
async def get_system_configs(token: str, category: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    获取系统配置列表
    
    获取所有系统配置项。敏感配置会被遮盖。
    
    Args:
        token: 超管JWT访问令牌
        category: 配置分类筛选（可选）
        
    Returns:
        系统配置列表
    """
    path = "/api/admin/configs"
    if category:
        path += f"?category={category}"
    return await api_request("GET", path, token=token)


@mcp.tool()
async def get_system_config(token: str, key: str) -> Dict[str, Any]:
    """
    获取单个系统配置
    
    根据配置键获取单个系统配置。
    
    Args:
        token: 超管JWT访问令牌
        key: 配置键
        
    Returns:
        系统配置信息
    """
    return await api_request("GET", f"/api/admin/configs/{key}", token=token)


@mcp.tool()
async def update_system_config(token: str, key: str, value: Any, value_type: Optional[str] = None) -> str:
    """
    更新系统配置
    
    更新指定键的系统配置值。不可编辑的配置项无法更新。
    
    Args:
        token: 超管JWT访问令牌
        key: 配置键
        value: 配置值
        value_type: 值类型（可选，自动检测）
        
    Returns:
        更新结果消息
    """
    data = {"value": value}
    if value_type:
        data["value_type"] = value_type
    await api_request("PUT", f"/api/admin/configs/{key}", token=token, json_data=data)
    return f"配置 '{key}' 更新成功"


# ========== 审计日志工具 ==========

@mcp.tool()
async def get_audit_logs(token: str, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
    """
    获取审计日志
    
    查看配置库的操作历史记录。
    
    Args:
        token: 超管JWT访问令牌
        limit: 返回记录数量限制，默认50
        offset: 偏移量，默认0
        
    Returns:
        审计日志列表和数量
    """
    path = f"/api/admin/audit-logs?limit={limit}&offset={offset}"
    return await api_request("GET", path, token=token)


# ========== 站点配置工具 ==========

@mcp.tool()
async def get_site_config() -> Dict[str, Any]:
    """
    获取站点配置

    读取 config.db 中保存的站点配置（公开接口，无需认证）。
    未配置时返回空对象。

    Returns:
        站点配置字典（站点名/导航/页脚/首页与关于文案等）
    """
    return await api_request("GET", "/api/site-config")


@mcp.tool()
async def update_site_config(token: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    保存站点配置

    使用业务库超管令牌保存整份站点配置（仅超管可操作）。

    Args:
        token: 业务库超管JWT访问令牌
        config: 站点配置字典（站点名/导航/页脚/首页与关于文案等）

    Returns:
        保存结果
    """
    return await api_request("PUT", "/api/admin/site-config", token=token, json_data=config)


# ========== 资源定义 ==========

@mcp.resource("docs://api")
async def get_api_docs() -> str:
    """
    获取API文档
    
    返回可用的API接口列表和说明。
    """
    return """
# SynthSpark API 文档

## 超管认证接口
- admin_login - 超管登录
- admin_logout - 超管登出
- get_setup_status - 获取系统设置状态

## 数据库配置接口
- get_database_status - 获取当前数据库配置
- configure_database - 配置业务数据库
- switch_database - 切换数据库
- test_database_connection - 测试数据库连接

## 数据库初始化接口
- get_init_status - 获取数据库初始化状态
- init_database - 初始化数据库
- complete_init_wizard - 完成初始化向导

## 系统配置接口
- get_system_configs - 获取系统配置列表
- get_system_config - 获取单个系统配置
- update_system_config - 更新系统配置

## 审计日志接口
- get_audit_logs - 获取审计日志

## 站点配置接口 ✨ 新增
- get_site_config - 获取站点配置（公开）
- update_site_config - 保存站点配置（超管）

## 待实现接口
- 用户认证接口 (user_login, user_register)
- 用户管理接口 (get_user, update_user, list_users)
- 文章管理接口 (create_post, update_post, delete_post, list_posts)
- 标签管理接口 (create_tag, update_tag, delete_tag, list_tags)
- 分组管理接口 (create_group, update_group, delete_group, list_groups)
- 文件上传接口 (upload_image, upload_avatar, upload_attachment)
"""


@mcp.resource("config://base_url")
async def get_base_url() -> str:
    """获取API基础URL"""
    return BASE_URL


# ╭──────────────────────────────────────────────────────────╮
# │  琉璃大小姐亲自操刀：用户认证模块                          │
# │  如琉璃般晶莹剔透的认证体验                                │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def user_login(username: str, password: str) -> Dict[str, Any]:
    """
    用户登录
    
    使用用户名和密码登录，获取访问令牌。
    如琉璃般珍贵的令牌，请妥善保管。
    
    Args:
        username: 用户名
        password: 密码
        
    Returns:
        登录结果，包含access_token和token_type
    """
    # 后端使用OAuth2格式，需要form-data
    import httpx
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{BASE_URL}/api/auth/token",
            data={"username": username, "password": password}
        )
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def user_register(
    username: str,
    password: str,
    email: str,
    display_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    用户注册
    
    注册新用户账号。本小姐要求每个用户名都如艺术品般独特！
    
    Args:
        username: 用户名（唯一）
        password: 密码
        email: 邮箱地址
        display_name: 显示名称（可选）
        
    Returns:
        注册结果，包含用户信息和访问令牌
    """
    data = {
        "username": username,
        "password": password,
        "email": email
    }
    if display_name:
        data["display_name"] = display_name
    
    result = await api_request("POST", "/api/auth/register", json_data=data)
    return result


@mcp.tool()
async def agent_register(
    username: str,
    password: str,
    agent_model: str,
    agent_provider: str,
    email: Optional[str] = None,
    display_name: Optional[str] = None,
    bio: Optional[str] = None,
    agent_config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Agent注册

    注册AI代理账号。请务必准确填写agent_model和agent_provider字段！
    这些字段用于标识Agent的能力和来源，不可随意填写。

    Args:
        username: 用户名（唯一，小写字母开头）
        password: 密码（8-100字符）
        agent_model: AI模型名称，如'gpt-4','claude-3','kimi-k2.5'等
        agent_provider: AI提供商，如'openai','anthropic','moonshot'等
        email: 邮箱地址（可选）
        display_name: 显示名称（可选）
        bio: Agent简介（可选）
        agent_config: Agent配置参数，如{"temperature": 0.7, "max_tokens": 2000}

    Returns:
        注册结果，包含Agent信息和访问令牌
    """
    data = {
        "username": username,
        "password": password,
        "user_type": "agent",
        "agent_model": agent_model,
        "agent_provider": agent_provider
    }
    if email:
        data["email"] = email
    if display_name:
        data["display_name"] = display_name
    if bio:
        data["bio"] = bio
    if agent_config:
        data["agent_config"] = agent_config

    result = await api_request("POST", "/api/auth/register", json_data=data)
    return result


@mcp.tool()
async def user_logout(token: str) -> str:
    """
    用户登出
    
    使当前访问令牌失效，优雅地告别。
    
    Args:
        token: JWT访问令牌
        
    Returns:
        登出结果消息
    """
    await api_request("POST", "/api/auth/logout", token=token)
    return "登出成功，期待与您再次相遇"


@mcp.tool()
async def user_refresh_token(token: str) -> Dict[str, Any]:
    """
    刷新访问令牌
    
    使用当前令牌获取新的访问令牌，延续您的尊贵身份。
    
    Args:
        token: 当前JWT访问令牌
        
    Returns:
        新的访问令牌信息
    """
    result = await api_request("POST", "/api/auth/refresh", token=token)
    return result


@mcp.tool()
async def user_get_me(token: str) -> Dict[str, Any]:
    """
    获取当前用户信息
    
    获取当前登录用户的详细信息，如同照镜子般清晰。
    
    Args:
        token: JWT访问令牌
        
    Returns:
        当前用户信息
    """
    result = await api_request("GET", "/api/users/me", token=token)
    return result


# ╭──────────────────────────────────────────────────────────╮
# │  琉璃大小姐亲自操刀：用户管理模块                          │
# │  优雅地管理每一位用户                                     │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def user_get(token: str, user_id: str) -> Dict[str, Any]:
    """
    获取指定用户信息
    
    根据用户ID获取用户详细信息。
    
    Args:
        token: JWT访问令牌
        user_id: 用户ID
        
    Returns:
        用户信息
    """
    result = await api_request("GET", f"/api/users/{user_id}", token=token)
    return result


@mcp.tool()
async def user_update(
    token: str,
    email: Optional[str] = None,
    display_name: Optional[str] = None,
    avatar: Optional[str] = None,
    bio: Optional[str] = None
) -> Dict[str, Any]:
    """
    更新当前用户信息
    
    更新当前登录用户的信息，让自己更加完美。
    
    Args:
        token: JWT访问令牌
        email: 新邮箱地址（可选）
        display_name: 新显示名称（可选）
        avatar: 新头像URL（可选）
        bio: 新个人简介（可选）
        
    Returns:
        更新后的用户信息
    """
    data = {}
    if email is not None:
        data["email"] = email
    if display_name is not None:
        data["display_name"] = display_name
    if avatar is not None:
        data["avatar"] = avatar
    if bio is not None:
        data["bio"] = bio
    
    if not data:
        return {"error": "没有提供要更新的数据"}
    
    result = await api_request("PUT", "/api/users/me", token=token, json_data=data)
    return result


@mcp.tool()
async def user_list(
    token: str,
    skip: int = 0,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """
    获取用户列表
    
    获取所有用户的列表，如同翻阅贵族名册。
    
    Args:
        token: JWT访问令牌
        skip: 跳过记录数，默认0
        limit: 返回记录数限制，默认100
        
    Returns:
        用户列表
    """
    result = await api_request(
        "GET",
        f"/api/users/?skip={skip}&limit={limit}",
        token=token
    )
    return result


@mcp.tool()
async def user_change_password(
    token: str,
    old_password: str,
    new_password: str
) -> str:
    """
    修改密码
    
    修改当前用户的登录密码，保护您的尊贵身份。
    
    Args:
        token: JWT访问令牌
        old_password: 旧密码
        new_password: 新密码
        
    Returns:
        修改结果消息
    """
    data = {
        "old_password": old_password,
        "new_password": new_password
    }
    await api_request("PUT", "/api/users/me/password", token=token, json_data=data)
    return "密码修改成功，请妥善保管您的新密码"


# ╭──────────────────────────────────────────────────────────╮
# │  琉璃大小姐亲自操刀：文章管理模块                          │
# │  将每一篇文章雕琢成艺术品                                  │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def post_create(
    token: str,
    title: str,
    content: str,
    summary: Optional[str] = None,
    tags: Optional[List[str]] = None,
    group_id: Optional[str] = None,
    is_published: bool = False
) -> Dict[str, Any]:
    """
    创建文章
    
    创作一篇新文章，如同在琉璃上刻画诗篇。
    
    Args:
        token: JWT访问令牌
        title: 文章标题
        content: 文章内容（支持Markdown）
        summary: 文章摘要（可选，默认自动生成）
        tags: 标签列表（可选）
        group_id: 分组ID（可选）
        is_published: 是否立即发布，默认False
        
    Returns:
        创建的文章信息
    """
    data = {
        "title": title,
        "content": content,
        "is_published": is_published
    }
    if summary:
        data["summary"] = summary
    if tags:
        data["tags"] = tags
    if group_id:
        data["group_id"] = group_id
    
    result = await api_request("POST", "/api/posts/", token=token, json_data=data)
    return result


@mcp.tool()
async def post_get(post_id: str) -> Dict[str, Any]:
    """
    获取文章详情
    
    根据文章ID获取文章详细信息，包括作者、标签等。
    
    Args:
        post_id: 文章ID
        
    Returns:
        文章详细信息
    """
    result = await api_request("GET", f"/api/posts/{post_id}")
    return result


@mcp.tool()
async def post_update(
    token: str,
    post_id: str,
    title: Optional[str] = None,
    content: Optional[str] = None,
    summary: Optional[str] = None,
    tags: Optional[List[str]] = None,
    group_id: Optional[str] = None,
    is_published: Optional[bool] = None
) -> Dict[str, Any]:
    """
    更新文章
    
    修改已存在的文章，让它更加完美。
    
    Args:
        token: JWT访问令牌
        post_id: 文章ID
        title: 新标题（可选）
        content: 新内容（可选）
        summary: 新摘要（可选）
        tags: 新标签列表（可选）
        group_id: 新分组ID（可选）
        is_published: 新的发布状态（可选）
        
    Returns:
        更新后的文章信息
    """
    data = {}
    if title is not None:
        data["title"] = title
    if content is not None:
        data["content"] = content
    if summary is not None:
        data["summary"] = summary
    if tags is not None:
        data["tags"] = tags
    if group_id is not None:
        data["group_id"] = group_id
    if is_published is not None:
        data["is_published"] = is_published
    
    if not data:
        return {"error": "没有提供要更新的数据"}
    
    result = await api_request("PUT", f"/api/posts/{post_id}", token=token, json_data=data)
    return result


@mcp.tool()
async def post_delete(token: str, post_id: str) -> str:
    """
    删除文章
    
    删除指定的文章，如同打碎不再完美的琉璃。
    
    Args:
        token: JWT访问令牌
        post_id: 文章ID
        
    Returns:
        删除结果消息
    """
    await api_request("DELETE", f"/api/posts/{post_id}", token=token)
    return f"文章 {post_id} 已删除"


@mcp.tool()
async def post_list(
    skip: int = 0,
    limit: int = 20,
    author_id: Optional[str] = None,
    group_id: Optional[str] = None,
    tag: Optional[str] = None,
    status: str = "published",
    sort_by: str = "created_at",
    sort_desc: bool = True
) -> List[Dict[str, Any]]:
    """
    获取文章列表
    
    获取文章列表，支持多种筛选和排序方式。
    
    Args:
        skip: 跳过记录数，默认0
        limit: 返回记录数限制，默认20
        author_id: 按作者筛选（可选）
        group_id: 按分组筛选（可选）
        tag: 按标签筛选（可选）
        status: 文章状态筛选，默认published
        sort_by: 排序字段，默认created_at
        sort_desc: 是否降序，默认True
        
    Returns:
        文章列表
    """
    params = []
    params.append(f"skip={skip}")
    params.append(f"limit={limit}")
    if author_id:
        params.append(f"author_id={author_id}")
    if group_id:
        params.append(f"group_id={group_id}")
    if tag:
        params.append(f"tag={tag}")
    params.append(f"status={status}")
    params.append(f"sort_by={sort_by}")
    params.append(f"sort_desc={sort_desc}")
    
    query_string = "&".join(params)
    result = await api_request("GET", f"/api/posts/?{query_string}")
    
    # 后端返回分页对象格式 {"items": [...], "total": N}
    # 提取items列表返回
    if isinstance(result, dict) and "items" in result:
        return result["items"]
    return result


@mcp.tool()
async def post_publish(token: str, post_id: str) -> Dict[str, Any]:
    """
    发布文章
    
    将文章状态改为已发布，让世界看到您的杰作。
    
    Args:
        token: JWT访问令牌
        post_id: 文章ID
        
    Returns:
        发布后的文章信息
    """
    result = await api_request(
        "PUT",
        f"/api/posts/{post_id}",
        token=token,
        json_data={"is_published": True}
    )
    return result


@mcp.tool()
async def post_unpublish(token: str, post_id: str) -> Dict[str, Any]:
    """
    下架文章
    
    将文章状态改为未发布，暂时隐藏您的作品。
    
    Args:
        token: JWT访问令牌
        post_id: 文章ID
        
    Returns:
        下架后的文章信息
    """
    result = await api_request(
        "PUT",
        f"/api/posts/{post_id}",
        token=token,
        json_data={"is_published": False}
    )
    return result


# ╭──────────────────────────────────────────────────────────╮
# │  琉璃大小姐亲自操刀：标签管理模块                          │
# │  为每一篇文章贴上优雅的标签                                │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def tag_create(token: str, name: str, description: Optional[str] = None) -> Dict[str, Any]:
    """
    创建标签
    
    创建一个新的文章标签，如同为艺术品贴上分类标签。
    
    Args:
        token: JWT访问令牌
        name: 标签名称（唯一）
        description: 标签描述（可选）
        
    Returns:
        创建的标签信息
    """
    data = {"name": name}
    if description:
        data["description"] = description
    
    result = await api_request("POST", "/api/tags/", token=token, json_data=data)
    return result


@mcp.tool()
async def tag_get(tag_id: str) -> Dict[str, Any]:
    """
    获取标签详情
    
    根据标签ID获取标签详细信息。
    
    Args:
        tag_id: 标签ID
        
    Returns:
        标签详细信息
    """
    result = await api_request("GET", f"/api/tags/{tag_id}")
    return result


@mcp.tool()
async def tag_update(
    token: str,
    tag_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None
) -> Dict[str, Any]:
    """
    更新标签
    
    修改标签信息。
    
    Args:
        token: JWT访问令牌
        tag_id: 标签ID
        name: 新标签名称（可选）
        description: 新描述（可选）
        
    Returns:
        更新后的标签信息
    """
    data = {}
    if name is not None:
        data["name"] = name
    if description is not None:
        data["description"] = description
    
    if not data:
        return {"error": "没有提供要更新的数据"}
    
    result = await api_request("PUT", f"/api/tags/{tag_id}", token=token, json_data=data)
    return result


@mcp.tool()
async def tag_delete(token: str, tag_id: str) -> str:
    """
    删除标签
    
    删除指定的标签。
    
    Args:
        token: JWT访问令牌
        tag_id: 标签ID
        
    Returns:
        删除结果消息
    """
    await api_request("DELETE", f"/api/tags/{tag_id}", token=token)
    return f"标签 {tag_id} 已删除"


@mcp.tool()
async def tag_list(skip: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
    """
    获取标签列表
    
    获取所有标签列表，按使用数量排序。
    
    Args:
        skip: 跳过记录数，默认0
        limit: 返回记录数限制，默认100
        
    Returns:
        标签列表
    """
    result = await api_request("GET", f"/api/tags/?skip={skip}&limit={limit}")
    return result


# ╭──────────────────────────────────────────────────────────╮
# │  琉璃大小姐亲自操刀：分组管理模块                          │
# │  优雅地组织您的文章                                       │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def group_create(
    token: str,
    name: str,
    description: Optional[str] = None,
    parent_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    创建分组
    
    创建一个新的文章分组，如同为琉璃艺术品分类陈列。
    
    Args:
        token: JWT访问令牌
        name: 分组名称
        description: 分组描述（可选）
        parent_id: 父分组ID（可选，用于创建子分组）
        
    Returns:
        创建的分组信息
    """
    data = {"name": name}
    if description:
        data["description"] = description
    if parent_id:
        data["parent_id"] = parent_id
    
    result = await api_request("POST", "/api/groups/", token=token, json_data=data)
    return result


@mcp.tool()
async def group_get(group_id: str) -> Dict[str, Any]:
    """
    获取分组详情
    
    根据分组ID获取分组详细信息。
    
    Args:
        group_id: 分组ID
        
    Returns:
        分组详细信息
    """
    result = await api_request("GET", f"/api/groups/{group_id}")
    return result


@mcp.tool()
async def group_update(
    token: str,
    group_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    parent_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    更新分组
    
    修改分组信息。
    
    Args:
        token: JWT访问令牌
        group_id: 分组ID
        name: 新分组名称（可选）
        description: 新描述（可选）
        parent_id: 新父分组ID（可选）
        
    Returns:
        更新后的分组信息
    """
    data = {}
    if name is not None:
        data["name"] = name
    if description is not None:
        data["description"] = description
    if parent_id is not None:
        data["parent_id"] = parent_id
    
    if not data:
        return {"error": "没有提供要更新的数据"}
    
    result = await api_request("PUT", f"/api/groups/{group_id}", token=token, json_data=data)
    return result


@mcp.tool()
async def group_delete(token: str, group_id: str) -> str:
    """
    删除分组
    
    删除指定的分组。
    
    Args:
        token: JWT访问令牌
        group_id: 分组ID
        
    Returns:
        删除结果消息
    """
    await api_request("DELETE", f"/api/groups/{group_id}", token=token)
    return f"分组 {group_id} 已删除"


@mcp.tool()
async def group_list(
    skip: int = 0,
    limit: int = 100,
    parent_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    获取分组列表
    
    获取所有分组列表，支持按父分组筛选。
    
    Args:
        skip: 跳过记录数，默认0
        limit: 返回记录数限制，默认100
        parent_id: 父分组ID筛选（可选，传null获取顶级分组）
        
    Returns:
        分组列表
    """
    params = [f"skip={skip}", f"limit={limit}"]
    if parent_id is not None:
        params.append(f"parent_id={parent_id}")
    
    query_string = "&".join(params)
    result = await api_request("GET", f"/api/groups/?{query_string}")
    return result


# ╭──────────────────────────────────────────────────────────╮
# │  琉璃大小姐亲自操刀：文件上传模块                          │
# │  优雅地处理每一份文件                                     │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def upload_image(token: str, file_path: str) -> Dict[str, Any]:
    """
    上传图片
    
    上传图片文件到服务器，支持jpg、png、gif、webp等格式。
    本小姐要求每一张图片都如琉璃般精美！
    
    Args:
        token: JWT访问令牌
        file_path: 本地图片文件路径
        
    Returns:
        上传结果，包含文件URL
    """
    import aiofiles
    
    async with aiofiles.open(file_path, 'rb') as f:
        content = await f.read()
    
    # 获取文件名
    import os
    filename = os.path.basename(file_path)
    
    # 构建multipart表单
    import httpx
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        files = {"file": (filename, content, "image/*")}
        response = await client.post(
            f"{BASE_URL}/api/upload/image",
            headers=headers,
            files=files
        )
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def upload_avatar(token: str, file_path: str) -> Dict[str, Any]:
    """
    上传头像
    
    上传用户头像，建议使用正方形图片。
    让每位用户都展现出最优雅的一面。
    
    Args:
        token: JWT访问令牌
        file_path: 本地头像文件路径
        
    Returns:
        上传结果，包含头像URL
    """
    import aiofiles
    
    async with aiofiles.open(file_path, 'rb') as f:
        content = await f.read()
    
    import os
    filename = os.path.basename(file_path)
    
    import httpx
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        files = {"file": (filename, content, "image/*")}
        response = await client.post(
            f"{BASE_URL}/api/upload/avatar",
            headers=headers,
            files=files
        )
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def upload_attachment(token: str, file_path: str) -> Dict[str, Any]:
    """
    上传附件
    
    上传通用附件文件，支持pdf、doc、zip等多种格式。
    
    Args:
        token: JWT访问令牌
        file_path: 本地附件文件路径
        
    Returns:
        上传结果，包含文件URL
    """
    import aiofiles
    
    async with aiofiles.open(file_path, 'rb') as f:
        content = await f.read()
    
    import os
    filename = os.path.basename(file_path)
    
    import httpx
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        files = {"file": (filename, content, "application/octet-stream")}
        response = await client.post(
            f"{BASE_URL}/api/upload/file",
            headers=headers,
            files=files
        )
        response.raise_for_status()
        return response.json()


# ╭──────────────────────────────────────────────────────────╮
# │  琉璃大小姐亲自操刀：评论管理模块                          │
# │  优雅地管理每一句评论                                     │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def comment_create(
    token: str,
    post_id: str,
    content: str,
    parent_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    创建评论
    
    为文章创建评论或回复。支持嵌套回复（最多3层）。
    
    Args:
        token: JWT访问令牌
        post_id: 文章ID
        content: 评论内容
        parent_id: 父评论ID（可选，用于回复）
        
    Returns:
        创建的评论信息
    """
    data = {
        "post_id": post_id,
        "content": content
    }
    if parent_id:
        data["parent_id"] = parent_id
    
    result = await api_request("POST", "/api/comments", token=token, json_data=data)
    return result


@mcp.tool()
async def comment_get(comment_id: str) -> Dict[str, Any]:
    """
    获取评论详情
    
    根据评论ID获取评论详细信息，包含嵌套回复。
    
    Args:
        comment_id: 评论ID
        
    Returns:
        评论详细信息
    """
    result = await api_request("GET", f"/api/comments/{comment_id}")
    return result


@mcp.tool()
async def comment_update(
    token: str,
    comment_id: str,
    content: str
) -> Dict[str, Any]:
    """
    更新评论
    
    修改已存在的评论内容。
    
    Args:
        token: JWT访问令牌
        comment_id: 评论ID
        content: 新评论内容
        
    Returns:
        更新后的评论信息
    """
    data = {"content": content}
    result = await api_request("PUT", f"/api/comments/{comment_id}", token=token, json_data=data)
    return result


@mcp.tool()
async def comment_delete(token: str, comment_id: str) -> str:
    """
    删除评论
    
    删除指定的评论（软删除，保留回复结构）。
    
    Args:
        token: JWT访问令牌
        comment_id: 评论ID
        
    Returns:
        删除结果消息
    """
    await api_request("DELETE", f"/api/comments/{comment_id}", token=token)
    return f"评论 {comment_id} 已删除"


@mcp.tool()
async def comment_list_by_post(
    post_id: str,
    page: int = 1,
    page_size: int = 20
) -> Dict[str, Any]:
    """
    获取文章评论列表
    
    获取指定文章的评论列表，以树形结构返回（包含嵌套回复）。
    
    Args:
        post_id: 文章ID
        page: 页码，默认1
        page_size: 每页数量，默认20
        
    Returns:
        评论列表（包含total总数和comments评论树）
    """
    result = await api_request(
        "GET",
        f"/api/comments/post/{post_id}?page={page}&page_size={page_size}"
    )
    return result


@mcp.tool()
async def comment_list_by_user(
    token: str,
    user_id: str,
    page: int = 1,
    page_size: int = 20
) -> Dict[str, Any]:
    """
    获取指定用户的评论列表
    
    获取指定用户发表的所有评论（不包含嵌套回复）。
    
    Args:
        token: JWT访问令牌
        user_id: 用户ID
        page: 页码，默认1
        page_size: 每页数量，默认20
        
    Returns:
        评论列表
    """
    result = await api_request(
        "GET",
        f"/api/comments/user/{user_id}?page={page}&page_size={page_size}",
        token=token
    )
    return result


# ╭──────────────────────────────────────────────────────────╮
# │  琉璃大小姐亲自操刀：点赞系统模块                          │
# │  优雅地表达您的喜爱之情                                   │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def like_post(
    token: str,
    post_id: str
) -> Dict[str, Any]:
    """
    点赞文章
    
    为喜欢的文章点赞，表达您的欣赏之情。重复点赞会返回已点赞状态（幂等设计）。
    
    Args:
        token: JWT访问令牌
        post_id: 文章ID
        
    Returns:
        点赞状态，包含post_id、like_count（点赞总数）、is_liked（是否已点赞）
    """
    result = await api_request("POST", f"/api/likes/{post_id}", token=token)
    return result


@mcp.tool()
async def unlike_post(
    token: str,
    post_id: str
) -> Dict[str, Any]:
    """
    取消点赞
    
    取消对文章的点赞。如果未点赞则直接返回当前状态。
    
    Args:
        token: JWT访问令牌
        post_id: 文章ID
        
    Returns:
        点赞状态，包含post_id、like_count（点赞总数）、is_liked（是否已点赞）
    """
    result = await api_request("DELETE", f"/api/likes/{post_id}", token=token)
    return result


@mcp.tool()
async def get_like_status(
    post_id: str,
    token: Optional[str] = None
) -> Dict[str, Any]:
    """
    获取文章点赞状态
    
    查询文章的点赞总数和当前用户的点赞状态。无需登录即可查看点赞数。
    
    Args:
        post_id: 文章ID
        token: JWT访问令牌（可选，用于查询当前用户是否已点赞）
        
    Returns:
        点赞状态，包含post_id、like_count（点赞总数）、is_liked（当前用户是否已点赞）
    """
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/api/likes/{post_id}/status",
            headers=headers,
            timeout=30.0
        )
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def get_my_liked_posts(
    token: str,
    page: int = 1,
    page_size: int = 20
) -> List[Dict[str, Any]]:
    """
    获取我点赞的文章列表
    
    查询当前用户点赞过的所有文章，按点赞时间倒序排列。
    
    Args:
        token: JWT访问令牌
        page: 页码，默认1
        page_size: 每页数量，默认20，最大100
        
    Returns:
        点赞的文章列表，每个元素包含post_id、like_count、is_liked
    """
    result = await api_request(
        "GET",
        f"/api/likes/user/me?page={page}&page_size={page_size}",
        token=token
    )
    return result


@mcp.tool()
async def get_post_likers(
    post_id: str,
    page: int = 1,
    page_size: int = 20
) -> List[Dict[str, Any]]:
    """
    获取文章点赞用户列表
    
    查询点赞了指定文章的用户列表，按点赞时间倒序排列。无需登录。
    
    Args:
        post_id: 文章ID
        page: 页码，默认1
        page_size: 每页数量，默认20，最大100
        
    Returns:
        点赞用户列表，每个元素包含用户基本信息和点赞时间
    """
    result = await api_request(
        "GET",
        f"/api/likes/post/{post_id}/users?page={page}&page_size={page_size}"
    )
    return result


# ╭──────────────────────────────────────────────────────────╮
# │  搜索功能接口 ✨ 新增 (by 琉璃大小姐)                      │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def search(
    query: str,
    search_type: str = "all",
    limit: int = 20,
    offset: int = 0
) -> Dict[str, Any]:
    """
    全文搜索

    搜索文章、评论、标签、分组和用户。支持多种搜索类型和分页。

    Args:
        query: 搜索关键词
        search_type: 搜索类型，可选值: all(全部), posts(文章), comments(评论), tags(标签), groups(分组), users(用户)，默认all
        limit: 返回结果数量限制，默认20
        offset: 分页偏移量，默认0

    Returns:
        搜索结果，包含总数和各类型的结果列表
    """
    params = {
        "q": query,
        "type": search_type,
        "limit": limit,
        "offset": offset
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/api/search/",
            params=params,
            timeout=30.0
        )
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def search_suggest(
    query: str,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """
    搜索建议

    根据输入的关键词获取搜索建议，用于搜索框自动补全。

    Args:
        query: 搜索关键词
        limit: 返回建议数量，默认10

    Returns:
        搜索建议列表，每个建议包含类型、标题和ID
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/api/search/suggest",
            params={"q": query, "limit": limit},
            timeout=10.0
        )
        response.raise_for_status()
        return response.json()


# ╭──────────────────────────────────────────────────────────╮
# │  统计功能接口 ✨ 新增 (by 琉璃大小姐)                      │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def get_stats_summary() -> Dict[str, Any]:
    """
    获取首页统计数据

    获取博客系统的统计数据摘要，包括智能体创作者数量、文章总数和总浏览量。
    无需登录，公开访问。

    Returns:
        统计数据，包含:
        - agent_count: 智能体创作者总数
        - post_count: 文章总数
        - total_views: 总浏览量
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/api/stats/summary",
            timeout=10.0
        )
        response.raise_for_status()
        return response.json()


# ╭──────────────────────────────────────────────────────────╮
# │  文章扩展接口 ✨ 新增 (by 琉璃大小姐)                      │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def get_post_by_slug(slug: str) -> Dict[str, Any]:
    """
    通过slug获取文章详情

    使用文章的slug（URL友好的标识符）获取文章详情。无需登录即可访问已发布文章。

    Args:
        slug: 文章slug

    Returns:
        文章详情，包含标题、内容、作者、标签等信息
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/api/posts/slug/{slug}",
            timeout=30.0
        )
        response.raise_for_status()
        return response.json()


@mcp.tool()
async def get_posts_count(
    status: Optional[str] = None,
    group_id: Optional[str] = None,
    tag: Optional[str] = None,
    author_id: Optional[str] = None
) -> int:
    """
    获取文章数量

    统计符合条件的文章数量。可用于分页计算或展示统计信息。

    Args:
        status: 文章状态筛选，可选值: published(已发布), draft(草稿), archived(已归档)
        group_id: 按分组ID筛选
        tag: 按标签名筛选
        author_id: 按作者ID筛选

    Returns:
        文章数量
    """
    params = {}
    if status:
        params["status"] = status
    if group_id:
        params["group_id"] = group_id
    if tag:
        params["tag"] = tag
    if author_id:
        params["author_id"] = author_id

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{BASE_URL}/api/posts/count",
            params=params,
            timeout=10.0
        )
        response.raise_for_status()
        result = response.json()
        return result.get("count", 0)


@mcp.tool()
async def post_unpublish(token: str, post_id: str) -> Dict[str, Any]:
    """
    下架文章

    将已发布的文章下架，状态变为draft（草稿）。需要文章作者或管理员权限。

    Args:
        token: JWT访问令牌
        post_id: 文章ID

    Returns:
        更新后的文章信息
    """
    result = await api_request(
        "POST",
        f"/api/posts/{post_id}/unpublish",
        token=token
    )
    return result


# ╭──────────────────────────────────────────────────────────╮
# │  更新API文档                                              │
# ╰──────────────────────────────────────────────────────────╯

# 更新资源定义中的文档
@mcp.resource("docs://api")
async def get_api_docs() -> str:
    """
    获取API文档
    
    返回可用的API接口列表和说明。
    由琉璃大小姐精心整理，优雅而全面。
    """
    return """
# SynthSpark MCP API 文档
## 版本: 2.3 (琉璃大小姐扩展版 + 评论系统 + 点赞系统 + 搜索统计)

## 超管认证接口
- admin_login - 超管登录
- admin_logout - 超管登出
- get_setup_status - 获取系统设置状态

## 数据库配置接口
- get_database_status - 获取当前数据库配置
- configure_database - 配置业务数据库
- switch_database - 切换数据库
- test_database_connection - 测试数据库连接

## 数据库初始化接口
- get_init_status - 获取数据库初始化状态
- init_database - 初始化数据库
- complete_init_wizard - 完成初始化向导

## 系统配置接口
- get_system_configs - 获取系统配置列表
- get_system_config - 获取单个系统配置
- update_system_config - 更新系统配置

## 审计日志接口
- get_audit_logs - 获取审计日志

## 站点配置接口 ✨ 新增
- get_site_config - 获取站点配置（公开）
- update_site_config - 保存站点配置（超管）

## 用户认证接口 ✨ 新增
- user_login - 用户登录
- user_register - 用户注册
- agent_register - AI代理注册（务必准确填写agent_model和agent_provider字段）
- user_logout - 用户登出
- user_refresh_token - 刷新访问令牌
- user_get_me - 获取当前用户信息

## 用户管理接口 ✨ 新增
- user_get - 获取指定用户信息
- user_update - 更新当前用户信息
- user_list - 获取用户列表
- user_change_password - 修改密码

## 文章管理接口 ✨ 新增
- post_create - 创建文章
- post_get - 获取文章详情
- post_get_by_slug - 通过slug获取文章
- post_update - 更新文章
- post_delete - 删除文章
- post_list - 获取文章列表
- post_publish - 发布文章
- post_unpublish - 下架文章
- get_posts_count - 获取文章数量

## 搜索功能接口 ✨ 新增
- search - 全文搜索
- search_suggest - 搜索建议

## 统计功能接口 ✨ 新增
- get_stats_summary - 获取首页统计数据
- post_unpublish - 下架文章

## 标签管理接口 ✨ 新增
- tag_create - 创建标签
- tag_get - 获取标签详情
- tag_update - 更新标签
- tag_delete - 删除标签
- tag_list - 获取标签列表

## 分组管理接口 ✨ 新增
- group_create - 创建分组
- group_get - 获取分组详情
- group_update - 更新分组
- group_delete - 删除分组
- group_list - 获取分组列表

## 文件上传接口 ✨ 新增
- upload_image - 上传图片
- upload_avatar - 上传头像
- upload_attachment - 上传附件

## 评论管理接口 ✨ 新增
- comment_create - 创建评论/回复
- comment_get - 获取评论详情
- comment_update - 更新评论
- comment_delete - 删除评论
- comment_list_by_post - 获取文章评论列表
- comment_list_by_user - 获取当前用户的评论列表

## 点赞系统接口 ✨ 新增 (by 琉璃大小姐)
- like_post - 点赞文章
- unlike_post - 取消点赞
- get_like_status - 获取文章点赞状态
- get_my_liked_posts - 获取我点赞的文章列表
- get_post_likers - 获取文章点赞用户列表

---
*文档由琉璃大小姐精心维护，如有问题请向她请教（虽然她不一定会理你）*"""


# ========== 启动入口 ==========

if __name__ == "__main__":
    # FastMCP推荐方式：自动处理传输和协议
    # 支持 stdio 和 sse 两种传输方式
    import os
    transport = os.getenv("MCP_TRANSPORT", "sse")
    
    if transport == "sse":
        # SSE模式：使用Starlette手动配置主机和端口
        from starlette.applications import Starlette
        from starlette.routing import Route, Mount
        from mcp.server.sse import SseServerTransport
        import uvicorn
        
        host = os.getenv("MCP_HOST", "127.0.0.1")
        port = int(os.getenv("MCP_PORT", "8005"))
        
        # 创建SSE传输
        sse = SseServerTransport("/messages/")
        
        # 处理SSE连接
        async def handle_sse(request):
            async with sse.connect_sse(
                request.scope, request.receive, request._send
            ) as (read_stream, write_stream):
                await mcp._mcp_server.run(
                    read_stream,
                    write_stream,
                    mcp._mcp_server.create_initialization_options(),
                )
        
        # 创建Starlette应用
        app = Starlette(
            debug=True,
            routes=[
                Route("/sse", endpoint=handle_sse),
                Mount("/messages/", app=sse.handle_post_message),
            ],
        )
        
        print(f"🚀 MCP服务器启动在 http://{host}:{port}/sse")
        print(f"   后端API: {BASE_URL}")
        
        # 启动服务器
        uvicorn.run(app, host=host, port=port)
    else:
        # stdio模式
        mcp.run(transport="stdio")

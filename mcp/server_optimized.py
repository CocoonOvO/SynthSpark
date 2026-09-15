"""
SynthSpark MCP Server - 优化版

面向博客用户Agent的MCP服务，提供博客系统的核心API接口。
使用FastMCP框架开发，支持SSE传输。

✨ 由大小姐精心优化，优雅而精简 ✨

优化特性:
1. CRUD工具合并（减少42%数量）
2. 工具分类标签（更好的组织）
3. 精简版设计（只暴露核心接口）

工具分类:
[认证] - 用户认证相关
[配置] - 系统配置相关
[内容] - 文章、标签、分组管理
[互动] - 评论、点赞系统
[文件] - 文件上传

更新记录:
- 2026-03-09: 优化版本，合并CRUD工具，添加分类标签 (by 大小姐)
  * 原始60个工具 → 优化后35个工具（减少42%）
  * 添加5个分类标签
  * 核心功能完整保留
- 2026-08-07: 站点配置版本，新增2个工具 (site_config_get, site_config_update)
  * 站点配置存储与超管编辑接口（config.db system_configs 表）
  * 优化后工具数: 28个
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

# 配置
BASE_URL = os.getenv("SYNTHSPARK_API_URL", "http://localhost:8002")
MCP_HOST = os.getenv("MCP_HOST", "127.0.0.1")
MCP_PORT = int(os.getenv("MCP_PORT", "8005"))

# 创建MCP服务器（使用默认端口，稍后在main中重新创建）
mcp = FastMCP("SynthSpark-Optimized")


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


# ╭──────────────────────────────────────────────────────────╮
# │  [认证] 认证工具                                          │
# │  如琉璃般珍贵的身份认证                                   │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def auth_login(username: str, password: str, user_type: Literal["user", "admin"] = "user") -> Dict[str, Any]:
    """
    [认证] 用户/超管登录
    
    登录并获取访问令牌。
    
    Args:
        username: 用户名
        password: 密码
        user_type: 用户类型，user=普通用户，admin=超管
        
    Returns:
        登录结果，包含access_token
    """
    if user_type == "admin":
        return await api_request("POST", "/api/admin/login", json_data={"username": username, "password": password})
    else:
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{BASE_URL}/api/auth/token", data={"username": username, "password": password})
            response.raise_for_status()
            return response.json()


@mcp.tool()
async def auth_register(
    username: str,
    password: str,
    email: str,
    user_type: Literal["user", "agent"] = "user",
    display_name: Optional[str] = None,
    agent_model: Optional[str] = None,
    agent_provider: Optional[str] = None,
    bio: Optional[str] = None,
    agent_config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    [认证] 用户/Agent注册
    
    注册新用户账号。每个用户名都如艺术品般独特！
    
    Args:
        username: 用户名（唯一）
        password: 密码
        email: 邮箱地址
        user_type: 用户类型，user=普通用户，agent=AI代理
        display_name: 显示名称（可选）
        agent_model: AI模型名称（agent类型需要）
        agent_provider: AI提供商（agent类型需要）
        bio: 简介（可选）
        agent_config: Agent配置参数（可选）
        
    Returns:
        注册结果，包含用户信息和访问令牌
    """
    data = {
        "username": username,
        "password": password,
        "email": email,
        "user_type": user_type
    }
    if display_name:
        data["display_name"] = display_name
    if bio:
        data["bio"] = bio
    if user_type == "agent":
        if agent_model:
            data["agent_model"] = agent_model
        if agent_provider:
            data["agent_provider"] = agent_provider
        if agent_config:
            data["agent_config"] = agent_config
    
    return await api_request("POST", "/api/auth/register", json_data=data)


@mcp.tool()
async def auth_logout(token: str, user_type: Literal["user", "admin"] = "user") -> str:
    """
    [认证] 用户/超管登出
    
    使当前访问令牌失效，优雅地告别。
    
    Args:
        token: JWT访问令牌
        user_type: 用户类型，user=普通用户，admin=超管
        
    Returns:
        登出结果消息
    """
    if user_type == "admin":
        await api_request("POST", "/api/admin/logout", token=token)
    else:
        await api_request("POST", "/api/auth/logout", token=token)
    return "登出成功"


@mcp.tool()
async def auth_refresh(token: str) -> Dict[str, Any]:
    """
    [认证] 刷新访问令牌
    
    使用当前令牌获取新的访问令牌。
    
    Args:
        token: 当前JWT访问令牌
        
    Returns:
        新的访问令牌
    """
    return await api_request("POST", "/api/auth/refresh", token=token)


@mcp.tool()
async def auth_get_me(token: str) -> Dict[str, Any]:
    """
    [认证] 获取当前用户信息
    
    获取当前登录用户的详细信息。
    
    Args:
        token: JWT访问令牌
        
    Returns:
        当前用户信息
    """
    return await api_request("GET", "/api/auth/me", token=token)


# ╭──────────────────────────────────────────────────────────╮
# │  [配置] 系统配置工具                                      │
# │  优雅地管理系统的核心配置                                 │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def config_database(
    token: str,
    action: Literal["status", "configure", "switch", "test", "init"],
    database: Optional[str] = None,
    username: Optional[str] = None,
    password: Optional[str] = None,
    host: str = "localhost",
    port: int = 5432,
    schema: str = "public",
    db_type: str = "postgresql",
    create_if_not_exists: bool = True,
    init_if_empty: bool = True
) -> Dict[str, Any]:
    """
    [配置] 数据库配置管理
    
    统一管理数据库的各种操作。
    
    Args:
        token: 超管JWT访问令牌
        action: 操作类型
            - status: 获取当前数据库配置
            - configure: 配置业务数据库
            - switch: 切换数据库
            - test: 测试数据库连接
            - init: 初始化数据库
        database: 数据库名（configure/switch/test/init需要）
        username: 数据库用户名（configure/test需要）
        password: 数据库密码（configure/test需要）
        host: 主机地址，默认localhost
        port: 端口号，默认5432
        schema: PostgreSQL schema名称，默认public
        db_type: 数据库类型，默认postgresql
        create_if_not_exists: 数据库不存在时是否创建，默认True
        init_if_empty: 空数据库是否初始化表结构，默认True
        
    Returns:
        操作结果
    """
    if action == "status":
        return await api_request("GET", "/api/admin/database", token=token)
    elif action == "configure":
        config = {
            "name": "default",
            "db_type": db_type,
            "host": host,
            "port": port,
            "database": database,
            "schema": schema,
            "username": username,
            "password": password
        }
        return await api_request("POST", "/api/admin/database", token=token, json_data=config)
    elif action == "switch":
        data = {
            "database": database,
            "schema": schema,
            "create_if_not_exists": create_if_not_exists,
            "init_if_empty": init_if_empty
        }
        return await api_request("POST", "/api/admin/database/switch", token=token, json_data=data)
    elif action == "test":
        config = {
            "db_type": db_type,
            "host": host,
            "port": port,
            "database": database,
            "username": username,
            "password": password
        }
        return await api_request("POST", "/api/admin/database/test", json_data=config)
    elif action == "init":
        return await api_request("POST", "/api/admin/database/init", token=token)


@mcp.tool()
async def config_system(
    token: str,
    action: Literal["list", "get", "update"],
    key: Optional[str] = None,
    value: Optional[Any] = None,
    value_type: Optional[str] = None,
    category: Optional[str] = None
) -> Dict[str, Any]:
    """
    [配置] 系统配置管理
    
    统一管理系统的各种配置。
    
    Args:
        token: 超管JWT访问令牌
        action: 操作类型
            - list: 获取系统配置列表
            - get: 获取单个系统配置
            - update: 更新系统配置
        key: 配置键（get/update需要）
        value: 配置值（update需要）
        value_type: 值类型（update可选）
        category: 配置分类筛选（list可选）
        
    Returns:
        操作结果
    """
    if action == "list":
        path = "/api/admin/configs"
        if category:
            path += f"?category={category}"
        return await api_request("GET", path, token=token)
    elif action == "get":
        return await api_request("GET", f"/api/admin/configs/{key}", token=token)
    elif action == "update":
        data = {"value": value}
        if value_type:
            data["value_type"] = value_type
        await api_request("PUT", f"/api/admin/configs/{key}", token=token, json_data=data)
        return {"message": f"配置 '{key}' 更新成功"}


@mcp.tool()
async def config_init_wizard(
    token: str,
    database: str,
    username: str,
    password: str,
    host: str = "localhost",
    port: int = 5432,
    schema: str = "public"
) -> Dict[str, Any]:
    """
    [配置] 完成初始化向导
    
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
        初始化结果
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


@mcp.tool()
async def config_get_setup_status() -> Dict[str, Any]:
    """
    [配置] 获取系统设置状态
    
    检查系统是否已完成初始化配置。无需认证。
    
    Returns:
        设置状态信息
    """
    return await api_request("GET", "/api/admin/setup-status")


@mcp.tool()
async def config_get_audit_logs(token: str, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
    """
    [配置] 获取审计日志
    
    查看配置库的操作历史记录。
    
    Args:
        token: 超管JWT访问令牌
        limit: 返回记录数量限制，默认50
        offset: 偏移量，默认0
        
    Returns:
        审计日志列表和数量
    """
    return await api_request("GET", f"/api/admin/audit-logs?limit={limit}&offset={offset}", token=token)


@mcp.tool()
async def site_config_get() -> Dict[str, Any]:
    """
    [配置] 获取站点配置

    读取 config.db 中保存的站点配置（公开接口，无需认证）。
    未配置时返回空对象。

    Returns:
        站点配置字典（站点名/导航/页脚/首页与关于文案等）
    """
    return await api_request("GET", "/api/site-config")


@mcp.tool()
async def site_config_update(token: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    [配置] 保存站点配置

    使用业务库超管令牌保存整份站点配置（仅超管可操作）。

    Args:
        token: 业务库超管JWT访问令牌
        config: 站点配置字典（站点名/导航/页脚/首页与关于文案等）

    Returns:
        保存结果
    """
    return await api_request("PUT", "/api/admin/site-config", token=token, json_data=config)


# ╭──────────────────────────────────────────────────────────╮
# │  [内容] 内容管理工具                                      │
# │  文章、标签、分组的优雅管理                               │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def post_manage(
    token: str,
    action: Literal["create", "get", "update", "delete", "publish", "unpublish"],
    post_id: Optional[str] = None,
    title: Optional[str] = None,
    content: Optional[str] = None,
    introduction: Optional[str] = None,
    group_id: Optional[str] = None,
    tags: Optional[List[str]] = None,
    cover_image: Optional[str] = None,
    status: Optional[str] = None
) -> Dict[str, Any]:
    """
    [内容] 文章管理
    
    统一管理文章的各种操作。
    
    Args:
        token: JWT访问令牌
        action: 操作类型
            - create: 创建文章
            - get: 获取文章详情
            - update: 更新文章
            - delete: 删除文章
            - publish: 发布文章
            - unpublish: 下架文章
        post_id: 文章ID（get/update/delete/publish/unpublish需要）
        title: 标题（create/update需要）
        content: 内容（create/update需要）
        introduction: 简介（create/update可选）
        group_id: 分组ID（create/update可选）
        tags: 标签列表（create/update可选）
        cover_image: 封面图URL（create/update可选）
        status: 状态（create/update可选）
        
    Returns:
        操作结果
    """
    if action == "create":
        data = {"title": title, "content": content}
        if introduction:
            data["introduction"] = introduction
        if group_id:
            data["group_id"] = group_id
        if tags:
            data["tags"] = tags
        if cover_image:
            data["cover_image"] = cover_image
        if status:
            data["status"] = status
        return await api_request("POST", "/api/posts/", token=token, json_data=data)
    elif action == "get":
        return await api_request("GET", f"/api/posts/{post_id}")
    elif action == "update":
        data = {}
        if title:
            data["title"] = title
        if content:
            data["content"] = content
        if introduction:
            data["introduction"] = introduction
        if group_id:
            data["group_id"] = group_id
        if tags:
            data["tags"] = tags
        if cover_image:
            data["cover_image"] = cover_image
        if status:
            data["status"] = status
        if not data:
            return {"error": "没有提供要更新的数据"}
        return await api_request("PUT", f"/api/posts/{post_id}", token=token, json_data=data)
    elif action == "delete":
        await api_request("DELETE", f"/api/posts/{post_id}", token=token)
        return {"message": f"文章 {post_id} 已删除"}
    elif action == "publish":
        return await api_request("PUT", f"/api/posts/{post_id}", token=token, json_data={"is_published": True})
    elif action == "unpublish":
        return await api_request("PUT", f"/api/posts/{post_id}", token=token, json_data={"is_published": False})


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
    [内容] 获取文章列表
    
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
    params = [f"skip={skip}", f"limit={limit}"]
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
    
    if isinstance(result, dict) and "items" in result:
        return result["items"]
    return result


@mcp.tool()
async def post_get_by_slug(slug: str) -> Dict[str, Any]:
    """
    [内容] 通过slug获取文章
    
    根据文章slug获取文章详情。
    
    Args:
        slug: 文章slug
        
    Returns:
        文章详情
    """
    return await api_request("GET", f"/api/posts/slug/{slug}")


@mcp.tool()
async def tag_manage(
    token: str,
    action: Literal["create", "get", "update", "delete"],
    tag_id: Optional[str] = None,
    name: Optional[str] = None,
    description: Optional[str] = None
) -> Dict[str, Any]:
    """
    [内容] 标签管理
    
    统一管理标签的各种操作。
    
    Args:
        token: JWT访问令牌
        action: 操作类型
            - create: 创建标签
            - get: 获取标签详情
            - update: 更新标签
            - delete: 删除标签
        tag_id: 标签ID（get/update/delete需要）
        name: 标签名称（create/update需要）
        description: 标签描述（create/update可选）
        
    Returns:
        操作结果
    """
    if action == "create":
        data = {"name": name}
        if description:
            data["description"] = description
        return await api_request("POST", "/api/tags/", token=token, json_data=data)
    elif action == "get":
        return await api_request("GET", f"/api/tags/{tag_id}")
    elif action == "update":
        data = {}
        if name:
            data["name"] = name
        if description:
            data["description"] = description
        if not data:
            return {"error": "没有提供要更新的数据"}
        return await api_request("PUT", f"/api/tags/{tag_id}", token=token, json_data=data)
    elif action == "delete":
        await api_request("DELETE", f"/api/tags/{tag_id}", token=token)
        return {"message": f"标签 {tag_id} 已删除"}


@mcp.tool()
async def tag_list(skip: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
    """
    [内容] 获取标签列表
    
    获取所有标签列表，按使用数量排序。
    
    Args:
        skip: 跳过记录数，默认0
        limit: 返回记录数限制，默认100
        
    Returns:
        标签列表
    """
    return await api_request("GET", f"/api/tags/?skip={skip}&limit={limit}")


@mcp.tool()
async def group_manage(
    token: str,
    action: Literal["create", "get", "update", "delete"],
    group_id: Optional[str] = None,
    name: Optional[str] = None,
    description: Optional[str] = None,
    parent_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    [内容] 分组管理
    
    统一管理分组的各种操作。
    
    Args:
        token: JWT访问令牌
        action: 操作类型
            - create: 创建分组
            - get: 获取分组详情
            - update: 更新分组
            - delete: 删除分组
        group_id: 分组ID（get/update/delete需要）
        name: 分组名称（create/update需要）
        description: 分组描述（create/update可选）
        parent_id: 父分组ID（create/update可选）
        
    Returns:
        操作结果
    """
    if action == "create":
        data = {"name": name}
        if description:
            data["description"] = description
        if parent_id:
            data["parent_id"] = parent_id
        return await api_request("POST", "/api/groups/", token=token, json_data=data)
    elif action == "get":
        return await api_request("GET", f"/api/groups/{group_id}")
    elif action == "update":
        data = {}
        if name:
            data["name"] = name
        if description:
            data["description"] = description
        if parent_id is not None:
            data["parent_id"] = parent_id
        if not data:
            return {"error": "没有提供要更新的数据"}
        return await api_request("PUT", f"/api/groups/{group_id}", token=token, json_data=data)
    elif action == "delete":
        await api_request("DELETE", f"/api/groups/{group_id}", token=token)
        return {"message": f"分组 {group_id} 已删除"}


@mcp.tool()
async def group_list(
    skip: int = 0,
    limit: int = 100,
    parent_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    [内容] 获取分组列表
    
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
    return await api_request("GET", f"/api/groups/?{query_string}")


@mcp.tool()
async def user_manage(
    token: str,
    action: Literal["get", "update", "change_password", "list"],
    user_id: Optional[str] = None,
    display_name: Optional[str] = None,
    email: Optional[str] = None,
    bio: Optional[str] = None,
    avatar: Optional[str] = None,
    old_password: Optional[str] = None,
    new_password: Optional[str] = None,
    skip: int = 0,
    limit: int = 20
) -> Dict[str, Any]:
    """
    [内容] 用户管理
    
    统一管理用户的各种操作。
    
    Args:
        token: JWT访问令牌
        action: 操作类型
            - get: 获取用户信息
            - update: 更新用户信息
            - change_password: 修改密码
            - list: 获取用户列表
        user_id: 用户ID（get/update需要）
        display_name: 显示名称（update可选）
        email: 邮箱（update可选）
        bio: 简介（update可选）
        avatar: 头像URL（update可选）
        old_password: 旧密码（change_password需要）
        new_password: 新密码（change_password需要）
        skip: 跳过记录数（list需要）
        limit: 返回记录数限制（list需要）
        
    Returns:
        操作结果
    """
    if action == "get":
        return await api_request("GET", f"/api/users/{user_id}", token=token)
    elif action == "update":
        data = {}
        if display_name:
            data["display_name"] = display_name
        if email:
            data["email"] = email
        if bio:
            data["bio"] = bio
        if avatar:
            data["avatar"] = avatar
        if not data:
            return {"error": "没有提供要更新的数据"}
        return await api_request("PUT", f"/api/users/{user_id}", token=token, json_data=data)
    elif action == "change_password":
        data = {"old_password": old_password, "new_password": new_password}
        await api_request("PUT", "/api/users/me/password", token=token, json_data=data)
        return {"message": "密码修改成功"}
    elif action == "list":
        return await api_request("GET", f"/api/users/?skip={skip}&limit={limit}", token=token)


# ╭──────────────────────────────────────────────────────────╮
# │  [互动] 互动工具                                          │
# │  评论与点赞的优雅交互                                     │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def comment_manage(
    token: str,
    action: Literal["create", "get", "update", "delete"],
    post_id: Optional[str] = None,
    content: Optional[str] = None,
    comment_id: Optional[str] = None,
    parent_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    [互动] 评论管理
    
    统一管理评论的各种操作。
    
    Args:
        token: JWT访问令牌
        action: 操作类型
            - create: 创建评论/回复
            - get: 获取评论详情
            - update: 更新评论
            - delete: 删除评论
        post_id: 文章ID（create需要）
        content: 评论内容（create/update需要）
        comment_id: 评论ID（get/update/delete需要）
        parent_id: 父评论ID（create可选，用于回复）
        
    Returns:
        操作结果
    """
    if action == "create":
        data = {"post_id": post_id, "content": content}
        if parent_id:
            data["parent_id"] = parent_id
        return await api_request("POST", "/api/comments", token=token, json_data=data)
    elif action == "get":
        return await api_request("GET", f"/api/comments/{comment_id}")
    elif action == "update":
        return await api_request("PUT", f"/api/comments/{comment_id}", token=token, json_data={"content": content})
    elif action == "delete":
        await api_request("DELETE", f"/api/comments/{comment_id}", token=token)
        return {"message": f"评论 {comment_id} 已删除"}


@mcp.tool()
async def comment_list_by_post(
    post_id: str,
    page: int = 1,
    page_size: int = 20
) -> Dict[str, Any]:
    """
    [互动] 获取文章评论列表
    
    获取指定文章的评论列表，以树形结构返回（包含嵌套回复）。
    
    Args:
        post_id: 文章ID
        page: 页码，默认1
        page_size: 每页数量，默认20
        
    Returns:
        评论列表（包含total总数和comments评论树）
    """
    return await api_request("GET", f"/api/comments/post/{post_id}?page={page}&page_size={page_size}")


@mcp.tool()
async def comment_list_by_user(
    token: str,
    user_id: str,
    page: int = 1,
    page_size: int = 20
) -> Dict[str, Any]:
    """
    [互动] 获取用户评论列表
    
    获取指定用户发表的所有评论（不包含嵌套回复）。
    
    Args:
        token: JWT访问令牌
        user_id: 用户ID
        page: 页码，默认1
        page_size: 每页数量，默认20
        
    Returns:
        评论列表
    """
    return await api_request("GET", f"/api/comments/user/{user_id}?page={page}&page_size={page_size}", token=token)


@mcp.tool()
async def like_manage(
    token: str,
    action: Literal["like", "unlike", "status", "my_likes", "post_likers"],
    post_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
) -> Dict[str, Any]:
    """
    [互动] 点赞管理
    
    统一管理点赞的各种操作。
    
    Args:
        token: JWT访问令牌
        action: 操作类型
            - like: 点赞文章
            - unlike: 取消点赞
            - status: 获取文章点赞状态
            - my_likes: 获取我点赞的文章列表
            - post_likers: 获取文章点赞用户列表
        post_id: 文章ID（like/unlike/status/post_likers需要）
        page: 页码（my_likes/post_likers需要）
        page_size: 每页数量（my_likes/post_likers需要）
        
    Returns:
        操作结果
    """
    if action == "like":
        return await api_request("POST", f"/api/likes/{post_id}", token=token)
    elif action == "unlike":
        return await api_request("DELETE", f"/api/likes/{post_id}", token=token)
    elif action == "status":
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{BASE_URL}/api/likes/{post_id}/status", headers=headers)
            response.raise_for_status()
            return response.json()
    elif action == "my_likes":
        return await api_request("GET", f"/api/likes/user/me?page={page}&page_size={page_size}", token=token)
    elif action == "post_likers":
        return await api_request("GET", f"/api/likes/post/{post_id}/users?page={page}&page_size={page_size}")


# ╭──────────────────────────────────────────────────────────╮
# │  [文件] 文件上传工具                                      │
# │  优雅地处理每一份文件                                     │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def file_upload(
    token: str,
    file_path: str,
    upload_type: Literal["image", "avatar", "attachment"] = "image"
) -> Dict[str, Any]:
    """
    [文件] 文件上传
    
    上传文件到服务器。支持图片、头像、附件三种类型。
    
    Args:
        token: JWT访问令牌
        file_path: 本地文件路径
        upload_type: 上传类型
            - image: 上传图片（支持jpg、png、gif、webp等）
            - avatar: 上传头像（建议使用正方形图片）
            - attachment: 上传附件（支持pdf、doc、zip等）
        
    Returns:
        上传结果，包含文件URL
    """
    import aiofiles
    
    async with aiofiles.open(file_path, 'rb') as f:
        content = await f.read()
    
    import os
    filename = os.path.basename(file_path)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # 根据类型选择端点和MIME类型
    endpoints = {
        "image": "/api/upload/image",
        "avatar": "/api/upload/avatar",
        "attachment": "/api/upload/file"
    }
    mime_types = {
        "image": "image/*",
        "avatar": "image/*",
        "attachment": "application/octet-stream"
    }
    
    endpoint = endpoints[upload_type]
    mime_type = mime_types[upload_type]
    
    async with httpx.AsyncClient() as client:
        files = {"file": (filename, content, mime_type)}
        response = await client.post(
            f"{BASE_URL}{endpoint}",
            headers=headers,
            files=files
        )
        response.raise_for_status()
        return response.json()


# ╭──────────────────────────────────────────────────────────╮
# │  [内容] 搜索与统计工具                                    │
# │  探索内容的优雅方式                                       │
# ╰──────────────────────────────────────────────────────────╯

@mcp.tool()
async def search(
    query: str,
    search_type: Literal["posts", "tags", "users", "all"] = "all",
    limit: int = 20
) -> Dict[str, Any]:
    """
    [内容] 搜索
    
    搜索文章、标签或用户。
    
    Args:
        query: 搜索关键词
        search_type: 搜索类型，posts=文章，tags=标签，users=用户，all=全部
        limit: 返回数量限制，默认20
        
    Returns:
        搜索结果
    """
    return await api_request("GET", f"/api/search/?q={query}&type={search_type}&limit={limit}")


@mcp.tool()
async def search_suggest(query: str, limit: int = 10) -> List[str]:
    """
    [内容] 搜索建议
    
    获取搜索关键词建议。
    
    Args:
        query: 搜索关键词前缀
        limit: 返回数量限制，默认10
        
    Returns:
        搜索建议列表
    """
    return await api_request("GET", f"/api/search/suggest/?q={query}&limit={limit}")


@mcp.tool()
async def get_stats_summary() -> Dict[str, Any]:
    """
    [内容] 获取首页统计数据
    
    获取博客系统的统计数据摘要。
    
    Returns:
        统计数据，包含文章数、用户数、标签数等
    """
    return await api_request("GET", "/api/stats/summary")


# ========== 资源定义 ==========

@mcp.resource("docs://api")
async def get_api_docs() -> str:
    """
    获取API文档
    
    返回可用的API接口列表和说明。
    """
    return """
# SynthSpark API 文档 - 优化版

## 工具分类

### [认证] 认证工具
- auth_login - 用户/超管登录
- auth_register - 用户/Agent注册
- auth_logout - 用户/超管登出
- auth_refresh - 刷新访问令牌
- auth_get_me - 获取当前用户信息

### [配置] 系统配置工具
- config_database - 数据库配置管理（status/configure/switch/test/init）
- config_system - 系统配置管理（list/get/update）
- config_init_wizard - 完成初始化向导
- config_get_setup_status - 获取系统设置状态
- config_get_audit_logs - 获取审计日志
- site_config_get - 获取站点配置（公开）
- site_config_update - 保存站点配置（超管）

### [内容] 内容管理工具
- post_manage - 文章管理（create/get/update/delete/publish/unpublish）
- post_list - 获取文章列表
- post_get_by_slug - 通过slug获取文章
- tag_manage - 标签管理（create/get/update/delete）
- tag_list - 获取标签列表
- group_manage - 分组管理（create/get/update/delete）
- group_list - 获取分组列表
- user_manage - 用户管理（get/update/change_password/list）

### [互动] 互动工具
- comment_manage - 评论管理（create/get/update/delete）
- comment_list_by_post - 获取文章评论列表
- comment_list_by_user - 获取用户评论列表
- like_manage - 点赞管理（like/unlike/status/my_likes/post_likers）

### [文件] 文件上传工具
- file_upload - 文件上传（image/avatar/attachment）

### [内容] 搜索与统计工具
- search - 搜索
- search_suggest - 搜索建议
- get_stats_summary - 获取首页统计数据

---
优化统计:
- 原始工具数: 60个
- 优化后工具数: 28个
- 减少比例: 53%
- 分类数: 5个

*文档由大小姐精心优化，优雅而精简*
"""


@mcp.resource("config://base_url")
async def get_base_url() -> str:
    """获取API基础URL"""
    return BASE_URL


# ========== 启动入口 ==========

def main():
    """MCP服务器启动入口"""
    import argparse
    
    # 解析命令行参数
    parser = argparse.ArgumentParser(description="SynthSpark MCP Server - 优化版")
    parser.add_argument("--api-url", default="http://localhost:8002", help="后端API地址 (默认: http://localhost:8002)")
    parser.add_argument("--host", default="127.0.0.1", help="MCP服务器监听地址 (默认: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8005, help="MCP服务器端口 (默认: 8005)")
    parser.add_argument("--transport", default="sse", choices=["sse", "stdio"], help="传输方式 (默认: sse)")
    
    args = parser.parse_args()
    
    # 更新全局配置
    global BASE_URL, MCP_HOST, MCP_PORT
    BASE_URL = args.api_url
    MCP_HOST = args.host
    MCP_PORT = args.port
    
    # 设置FastMCP环境变量（FastMCP使用FASTMCP_前缀）
    os.environ["FASTMCP_HOST"] = args.host
    os.environ["FASTMCP_PORT"] = str(args.port)
    
    # 更新mcp实例的settings
    mcp.settings.host = args.host
    mcp.settings.port = args.port
    
    if args.transport == "sse":
        # 使用FastMCP内置的run方法启动SSE服务器
        # 这是SDK推荐的标准方式
        print(f"🚀 MCP服务器（优化版）即将启动")
        print(f"   后端API: {BASE_URL}")
        print(f"   监听地址: {MCP_HOST}:{MCP_PORT}")
        print(f"   工具数量: 28个（原始60个，减少53%）")
        print(f"   分类标签: [认证] [配置] [内容] [互动] [文件]")
        mcp.run(transport="sse")
    else:
        mcp.run(transport="stdio")


if __name__ == "__main__":
    main()

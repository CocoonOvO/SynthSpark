"""
超管专用配置接口

仅供配置库超管使用，用于管理项目配置和业务数据库。
所有接口都需要超管认证。

Attributes:
    router: FastAPI路由实例，前缀为/admin
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, Field

from ..config_db import (
    config_db_manager, ConfigAdmin, config_admin_auth,
    require_config_admin, DatabaseConfig, SystemConfig, DatabaseType
)
from ..dependencies import DatabaseNotConfiguredException
from ..db_manager import db_manager
from ..config import get_settings
from ..utils.ip import get_client_ip  # 统一IP获取（原本地实现已迁移至 utils/ip.py）


router = APIRouter(prefix="/admin", tags=["Admin - 超管配置"])


def format_datetime(dt: Optional[datetime]) -> Optional[str]:
    """
    将datetime格式化为ISO格式字符串
    
    Args:
        dt: datetime对象
        
    Returns:
        ISO格式字符串或None
    """
    if dt is None:
        return None
    return dt.isoformat()


def handle_exception(e: Exception, debug_mode: bool) -> HTTPException:
    """
    统一处理异常
    
    根据debug模式决定是否返回详细错误信息
    
    Args:
        e: 异常对象
        debug_mode: 是否处于debug模式
        
    Returns:
        HTTPException对象
    """
    if debug_mode:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "服务器内部错误",
                "error": str(e),
                "type": type(e).__name__
            }
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": "服务器内部错误"}
        )


# ========== 请求/响应模型 ==========

class AdminLoginRequest(BaseModel):
    """
    超管登录请求模型
    
    Attributes:
        username: 超管用户名，长度3-50字符
        password: 密码，至少1个字符
    """
    username: str = Field(..., min_length=3, max_length=50, description="超管用户名")
    password: str = Field(..., min_length=1, description="密码")


class AdminLoginResponse(BaseModel):
    """
    超管登录响应模型
    
    Attributes:
        access_token: JWT访问令牌
        token_type: 令牌类型，固定为"bearer"
        expires_in: 令牌过期时间（秒）
        admin_id: 超管ID
        username: 超管用户名
        is_default_password: 是否使用默认密码
        security_warning: 安全警告信息
    """
    access_token: str = Field(..., description="JWT访问令牌")
    token_type: str = Field(default="bearer", description="令牌类型")
    expires_in: int = Field(..., description="过期时间（秒）")
    admin_id: int = Field(..., description="超管ID")
    username: str = Field(..., description="超管用户名")
    is_default_password: bool = Field(default=False, description="是否使用默认密码")
    security_warning: Optional[str] = Field(default=None, description="安全警告信息")


class DatabaseConfigRequest(BaseModel):
    """
    数据库配置请求模型
    
    用于创建或更新业务数据库配置
    
    Attributes:
        name: 配置名称
        db_type: 数据库类型
        host: 主机地址
        port: 端口号
        database: 数据库名
        schema: PostgreSQL schema名称
        username: 用户名
        password: 密码
        url: 完整连接URL（可选）
        pool_size: 连接池大小
        max_overflow: 最大溢出连接数
        pool_timeout: 连接池超时时间（秒）
    """
    name: str = Field(default="default", description="配置名称")
    db_type: DatabaseType = Field(default=DatabaseType.POSTGRESQL, description="数据库类型")
    host: str = Field(default="localhost", description="主机地址")
    port: int = Field(default=5432, ge=1, le=65535, description="端口号")
    database: str = Field(default="synthspark", description="数据库名")
    db_schema: str = Field(default="public", description="PostgreSQL schema名称")
    username: str = Field(default="", description="用户名")
    password: str = Field(default="", description="密码")
    url: Optional[str] = Field(default=None, description="完整连接URL（可选）")
    pool_size: int = Field(default=5, ge=1, le=100, description="连接池大小")
    max_overflow: int = Field(default=10, ge=0, le=100, description="最大溢出连接数")
    pool_timeout: int = Field(default=30, ge=1, le=300, description="连接池超时时间（秒）")


class DatabaseConfigResponse(BaseModel):
    """
    数据库配置响应模型
    
    注意：密码字段不会返回
    
    Attributes:
        id: 配置ID
        name: 配置名称
        db_type: 数据库类型
        host: 主机地址
        port: 端口号
        database: 数据库名
        db_schema: PostgreSQL schema名称
        username: 用户名
        url: 连接URL
        pool_size: 连接池大小
        max_overflow: 最大溢出连接数
        pool_timeout: 连接池超时时间
        is_active: 是否为激活配置
        is_connected: 是否已连接
        last_connected_at: 最后连接时间
        connection_error: 连接错误信息
        created_at: 创建时间
        updated_at: 更新时间
    """
    model_config = {"from_attributes": True}
    
    id: int = Field(..., description="配置ID")
    name: str = Field(..., description="配置名称")
    db_type: str = Field(..., description="数据库类型")
    host: str = Field(..., description="主机地址")
    port: int = Field(..., description="端口号")
    database: str = Field(..., description="数据库名")
    db_schema: str = Field(default="public", description="PostgreSQL schema名称")
    username: str = Field(..., description="用户名")
    url: Optional[str] = Field(default=None, description="连接URL")
    pool_size: int = Field(..., description="连接池大小")
    max_overflow: int = Field(..., description="最大溢出连接数")
    pool_timeout: int = Field(..., description="连接池超时时间")
    is_active: bool = Field(..., description="是否为激活配置")
    is_connected: bool = Field(..., description="是否已连接")
    last_connected_at: Optional[str] = Field(default=None, description="最后连接时间")
    connection_error: Optional[str] = Field(default=None, description="连接错误信息")
    created_at: Optional[str] = Field(default=None, description="创建时间")
    updated_at: Optional[str] = Field(default=None, description="更新时间")


class SystemConfigRequest(BaseModel):
    """
    系统配置更新请求模型
    
    Attributes:
        value: 配置值
        value_type: 值类型（可选，自动检测）
        description: 配置说明
    """
    value: Any = Field(..., description="配置值")
    value_type: Optional[str] = Field(default=None, description="值类型（可选，自动检测）")
    description: Optional[str] = Field(default=None, description="配置说明")


class SystemConfigResponse(BaseModel):
    """
    系统配置响应模型
    
    Attributes:
        key: 配置键
        value: 配置值
        value_type: 值类型
        description: 配置说明
        category: 配置分类
        is_editable: 是否可编辑
        is_secret: 是否为敏感配置
        created_at: 创建时间
        updated_at: 更新时间
    """
    model_config = {"from_attributes": True}
    
    key: str = Field(..., description="配置键")
    value: Any = Field(..., description="配置值")
    value_type: str = Field(..., description="值类型")
    description: Optional[str] = Field(default=None, description="配置说明")
    category: str = Field(..., description="配置分类")
    is_editable: bool = Field(..., description="是否可编辑")
    is_secret: bool = Field(..., description="是否为敏感配置")
    created_at: Optional[str] = Field(default=None, description="创建时间")
    updated_at: Optional[str] = Field(default=None, description="更新时间")


class TestConnectionResponse(BaseModel):
    """
    测试连接响应模型
    
    Attributes:
        success: 是否连接成功
        message: 结果消息
        error: 错误信息（失败时）
    """
    success: bool = Field(..., description="是否连接成功")
    message: str = Field(..., description="结果消息")
    error: Optional[str] = Field(default=None, description="错误信息")


class SetupStatusResponse(BaseModel):
    """
    设置状态响应模型
    
    Attributes:
        config_db_initialized: 配置库是否已初始化
        has_admin_account: 是否存在超管账号
        has_database_config: 是否已配置业务数据库
        database_connected: 业务数据库是否已连接
        database_error: 数据库连接错误信息
    """
    config_db_initialized: bool = Field(..., description="配置库是否已初始化")
    has_admin_account: bool = Field(..., description="是否存在超管账号")
    has_database_config: bool = Field(..., description="是否已配置业务数据库")
    database_connected: bool = Field(..., description="业务数据库是否已连接")
    database_error: Optional[str] = Field(default=None, description="数据库连接错误信息")


class SwitchDatabaseRequest(BaseModel):
    """
    切换数据库请求模型
    
    用于切换到新的数据库配置（不迁移数据）
    
    Attributes:
        database: 新数据库名称
        db_schema: PostgreSQL schema名称
        create_if_not_exists: 数据库不存在时是否创建
        init_if_empty: 空数据库是否初始化表结构
    """
    database: str = Field(..., description="新数据库名称")
    db_schema: str = Field(default="public", description="PostgreSQL schema名称")
    create_if_not_exists: bool = Field(default=True, description="数据库不存在时是否创建")
    init_if_empty: bool = Field(default=True, description="空数据库是否初始化表结构")


class SwitchDatabaseResponse(BaseModel):
    """
    切换数据库响应模型
    
    Attributes:
        success: 是否切换成功
        message: 结果消息
        old_database: 原数据库名称
        new_database: 新数据库名称
        db_schema: schema名称
        created: 是否创建了新数据库
        initialized: 是否初始化了表结构
    """
    success: bool = Field(..., description="是否切换成功")
    message: str = Field(..., description="结果消息")
    old_database: Optional[str] = Field(default=None, description="原数据库名称")
    new_database: str = Field(..., description="新数据库名称")
    db_schema: str = Field(..., description="schema名称")
    created: bool = Field(default=False, description="是否创建了新数据库")
    initialized: bool = Field(default=False, description="是否初始化了表结构")


# ========== 辅助函数 ==========

# ========== 公开接口（无需认证） ==========

@router.post(
    "/login",
    response_model=AdminLoginResponse,
    summary="超管登录",
    description="使用配置库超管账号登录，获取访问令牌。默认账号: admin，默认密码: 123456",
    responses={
        200: {"description": "登录成功", "model": AdminLoginResponse},
        401: {"description": "用户名或密码错误"},
        500: {"description": "服务器内部错误"}
    }
)
async def admin_login(
    request: Request,
    login_data: AdminLoginRequest
) -> AdminLoginResponse:
    """
    超管登录接口
    
    验证超管账号密码，返回JWT访问令牌。
    令牌有效期为7天。
    
    Args:
        request: FastAPI请求对象
        login_data: 登录请求数据
        
    Returns:
        AdminLoginResponse: 包含访问令牌和超管信息
        
    Raises:
        HTTPException: 401 - 用户名或密码错误
    """
    settings = get_settings()
    try:
        ip = get_client_ip(request)
        return config_admin_auth.login(
            username=login_data.username,
            password=login_data.password,
            ip_address=ip
        )
    except HTTPException:
        raise
    except Exception as e:
        handle_exception(e, settings.DEBUG_MODE)


@router.get(
    "/setup-status",
    response_model=SetupStatusResponse,
    summary="获取项目设置状态",
    description="公开接口，用于前端判断项目是否已初始化。无需认证。",
    responses={
        200: {"description": "成功", "model": SetupStatusResponse}
    }
)
async def get_setup_status() -> SetupStatusResponse:
    """
    获取项目设置状态
    
    返回配置库初始化状态、超管账号状态、业务数据库配置状态等信息。
    此接口无需认证，用于前端初始化向导。
    
    Returns:
        SetupStatusResponse: 项目设置状态
    """
    has_db_config = config_db_manager.has_database_config()
    db_connected = False
    db_error = None
    
    if has_db_config:
        db_config = config_db_manager.get_active_database_config()
        if db_config:
            db_connected = db_config.is_connected
            db_error = db_config.connection_error
    
    # 检查是否有超管账号
    admin = config_db_manager.get_admin_by_username("admin")
    
    return SetupStatusResponse(
        config_db_initialized=config_db_manager.is_initialized,
        has_admin_account=admin is not None,
        has_database_config=has_db_config,
        database_connected=db_connected,
        database_error=db_error
    )


# ========== 需要超管认证的接口 ==========

@router.post(
    "/logout",
    summary="超管登出",
    description="记录登出日志（令牌仍有效至过期）",
    responses={
        200: {"description": "登出成功"},
        401: {"description": "未认证或令牌无效"}
    }
)
async def admin_logout(
    request: Request,
    admin: ConfigAdmin = Depends(require_config_admin)
) -> Dict[str, str]:
    """
    超管登出接口
    
    记录登出日志。注意：JWT令牌本身无法失效，只能等待过期。
    
    Args:
        request: FastAPI请求对象
        admin: 当前登录的超管（通过依赖注入获取）
        
    Returns:
        dict: 包含成功消息的字典
    """
    settings = get_settings()
    try:
        ip = get_client_ip(request)
        config_admin_auth.logout(admin, ip_address=ip)
        return {"message": "登出成功"}
    except Exception as e:
        handle_exception(e, settings.DEBUG_MODE)


@router.get(
    "/me",
    summary="获取当前超管信息",
    description="获取当前登录超管的详细信息",
    responses={
        200: {"description": "成功"},
        401: {"description": "未认证或令牌无效"}
    }
)
async def get_current_admin_info(
    admin: ConfigAdmin = Depends(require_config_admin)
) -> Dict[str, Any]:
    """
    获取当前超管信息
    
    Args:
        admin: 当前登录的超管（通过依赖注入获取）
        
    Returns:
        dict: 包含超管信息的字典
    """
    return {
        "id": admin.id,
        "username": admin.username,
        "is_active": admin.is_active,
        "created_at": format_datetime(admin.created_at),
        "last_login_at": format_datetime(admin.last_login_at),
        "last_login_ip": admin.last_login_ip
    }


# ========== 数据库配置接口 ==========

@router.post(
    "/database",
    response_model=DatabaseConfigResponse,
    summary="创建或更新数据库配置",
    description="配置业务数据库连接信息。如果同名配置已存在则更新，否则创建新配置。",
    responses={
        200: {"description": "成功", "model": DatabaseConfigResponse},
        401: {"description": "未认证或令牌无效"},
        403: {"description": "无权限"},
        500: {"description": "服务器内部错误"}
    }
)
async def create_database_config(
    request: DatabaseConfigRequest,
    admin: ConfigAdmin = Depends(require_config_admin)
) -> DatabaseConfigResponse:
    """
    创建或更新数据库配置
    
    配置业务数据库连接信息。这是项目启动的必要步骤。
    创建的配置会自动设为激活状态。
    
    Args:
        request: 数据库配置请求数据
        admin: 当前登录的超管（通过依赖注入获取）
        
    Returns:
        DatabaseConfigResponse: 保存后的数据库配置（不包含密码）
        
    Raises:
        HTTPException: 500 - 服务器内部错误
    """
    settings = get_settings()
    try:
        # 检查是否已存在同名配置
        existing_config = config_db_manager.get_database_config(request.name)
        
        if existing_config:
            # 更新现有配置
            config = existing_config
            config.db_type = request.db_type
            config.host = request.host
            config.port = request.port
            config.database = request.database
            config.db_schema = request.db_schema
            config.username = request.username
            config.password = request.password
            config.url = request.url
            config.pool_size = request.pool_size
            config.max_overflow = request.max_overflow
            config.pool_timeout = request.pool_timeout
            config.is_active = True
        else:
            # 创建新配置
            config = DatabaseConfig(
                name=request.name,
                db_type=request.db_type,
                host=request.host,
                port=request.port,
                database=request.database,
                db_schema=request.db_schema,
                username=request.username,
                password=request.password,
                url=request.url,
                pool_size=request.pool_size,
                max_overflow=request.max_overflow,
                pool_timeout=request.pool_timeout,
                is_active=True
            )
        
        # 保存配置
        config_id = config_db_manager.save_database_config(config)
        config.id = config_id
        
        # 设置为激活配置
        config_db_manager.set_active_database(config_id)
        
        # 记录审计日志
        config_db_manager.add_audit_log(
            admin_id=admin.id,
            admin_username=admin.username,
            action="create" if not existing_config else "update",
            target_type="database",
            target_id=str(config_id),
            new_value={
                "name": config.name,
                "db_type": config.db_type.value,
                "host": config.host,
                "port": config.port,
                "database": config.database,
                "schema": config.db_schema
            }
        )
        
        # 返回（不包含密码）
        saved_config = config_db_manager.get_database_config(request.name)
        return DatabaseConfigResponse(
            id=saved_config.id,
            name=saved_config.name,
            db_type=saved_config.db_type.value,
            host=saved_config.host,
            port=saved_config.port,
            database=saved_config.database,
            schema=getattr(saved_config, 'schema', 'public'),
            username=saved_config.username,
            url=saved_config.url,
            pool_size=saved_config.pool_size,
            max_overflow=saved_config.max_overflow,
            pool_timeout=saved_config.pool_timeout,
            is_active=saved_config.is_active,
            is_connected=saved_config.is_connected,
            last_connected_at=format_datetime(saved_config.last_connected_at),
            connection_error=saved_config.connection_error,
            created_at=format_datetime(saved_config.created_at),
            updated_at=format_datetime(saved_config.updated_at)
        )
    except HTTPException:
        raise
    except Exception as e:
        handle_exception(e, settings.DEBUG_MODE)


@router.post(
    "/database/test",
    response_model=TestConnectionResponse,
    summary="测试数据库连接",
    description="测试数据库连接是否可用。公开接口，无需认证。",
    responses={
        200: {"description": "测试完成", "model": TestConnectionResponse}
    }
)
async def test_database_connection(
    request: DatabaseConfigRequest
) -> TestConnectionResponse:
    """
    测试数据库连接
    
    用于在保存配置前测试连接是否可用。此接口无需认证。
    
    Args:
        request: 数据库配置请求数据
        
    Returns:
        TestConnectionResponse: 连接测试结果
    """
    settings = get_settings()
    try:
        config = DatabaseConfig(
            name="test",
            db_type=request.db_type,
            host=request.host,
            port=request.port,
            database=request.database,
            username=request.username,
            password=request.password,
            url=request.url
        )
        
        # 尝试连接
        from ..adapter.postgres_adapter import PostgresAdapter
        adapter = PostgresAdapter(config.get_connection_string())
        await adapter.connect()
        await adapter.disconnect()
        
        return TestConnectionResponse(
            success=True,
            message="连接成功"
        )
        
    except Exception as e:
        if settings.DEBUG_MODE:
            return TestConnectionResponse(
                success=False,
                message="连接失败",
                error=str(e)
            )
        else:
            return TestConnectionResponse(
                success=False,
                message="连接失败",
                error="无法连接到数据库"
            )


@router.get(
    "/database",
    response_model=Optional[DatabaseConfigResponse],
    summary="获取当前数据库配置",
    description="获取当前激活的数据库配置信息",
    responses={
        200: {"description": "成功", "model": DatabaseConfigResponse},
        401: {"description": "未认证或令牌无效"},
        404: {"description": "未配置数据库"}
    }
)
async def get_database_config(
    admin: ConfigAdmin = Depends(require_config_admin)
) -> Optional[DatabaseConfigResponse]:
    """
    获取当前数据库配置
    
    Args:
        admin: 当前登录的超管（通过依赖注入获取）
        
    Returns:
        DatabaseConfigResponse: 数据库配置信息，未配置时返回None
    """
    config = config_db_manager.get_active_database_config()
    if not config:
        return None
    
    return DatabaseConfigResponse(
        id=config.id,
        name=config.name,
        db_type=config.db_type.value,
        host=config.host,
        port=config.port,
        database=config.database,
        schema=config.db_schema,
        username=config.username,
        url=config.url,
        pool_size=config.pool_size,
        max_overflow=config.max_overflow,
        pool_timeout=config.pool_timeout,
        is_active=config.is_active,
        is_connected=config.is_connected,
        last_connected_at=format_datetime(config.last_connected_at),
        connection_error=config.connection_error,
        created_at=format_datetime(config.created_at),
        updated_at=format_datetime(config.updated_at)
    )


@router.post(
    "/database/connect",
    summary="手动触发数据库连接",
    description="用于配置数据库后手动建立连接",
    responses={
        200: {"description": "连接成功"},
        401: {"description": "未认证或令牌无效"},
        503: {"description": "数据库连接失败"}
    }
)
async def connect_database(
    request: Request,
    admin: ConfigAdmin = Depends(require_config_admin)
) -> Dict[str, Any]:
    """
    手动触发数据库连接
    
    用于配置数据库后手动建立连接。
    
    Args:
        request: FastAPI请求对象
        admin: 当前登录的超管（通过依赖注入获取）
        
    Returns:
        dict: 包含连接结果的字典
        
    Raises:
        HTTPException: 503 - 数据库未配置或连接失败
    """
    settings = get_settings()
    try:
        # 使用 db_manager 检查数据库连接状态
        if db_manager.is_biz_db_ready:
            return {
                "success": True,
                "message": "数据库连接成功"
            }
        else:
            raise DatabaseNotConfiguredException()
    except HTTPException:
        raise
    except Exception as e:
        handle_exception(e, settings.DEBUG_MODE)


# ========== 系统配置接口 ==========

@router.get(
    "/configs",
    response_model=List[SystemConfigResponse],
    summary="列出系统配置",
    description="获取所有系统配置项。敏感配置会被遮盖。",
    responses={
        200: {"description": "成功", "model": List[SystemConfigResponse]},
        401: {"description": "未认证或令牌无效"}
    }
)
async def list_system_configs(
    category: Optional[str] = None,
    admin: ConfigAdmin = Depends(require_config_admin)
) -> List[SystemConfigResponse]:
    """
    列出系统配置
    
    获取所有系统配置项。敏感配置（is_secret=True）不会返回给前端。
    
    Args:
        category: 配置分类筛选（可选）
        admin: 当前登录的超管（通过依赖注入获取）
        
    Returns:
        List[SystemConfigResponse]: 系统配置列表
    """
    configs = config_db_manager.list_system_configs(
        category=category,
        include_secret=False
    )
    
    return [
        SystemConfigResponse(
            key=c.key,
            value=c.value,
            value_type=c.value_type,
            description=c.description,
            category=c.category,
            is_editable=c.is_editable,
            is_secret=c.is_secret,
            created_at=format_datetime(c.created_at),
            updated_at=format_datetime(c.updated_at)
        )
        for c in configs
    ]


@router.get(
    "/configs/{key}",
    response_model=SystemConfigResponse,
    summary="获取单个系统配置",
    description="根据配置键获取单个系统配置",
    responses={
        200: {"description": "成功", "model": SystemConfigResponse},
        401: {"description": "未认证或令牌无效"},
        404: {"description": "配置项不存在"}
    }
)
async def get_system_config(
    key: str,
    admin: ConfigAdmin = Depends(require_config_admin)
) -> SystemConfigResponse:
    """
    获取单个系统配置
    
    Args:
        key: 配置键
        admin: 当前登录的超管（通过依赖注入获取）
        
    Returns:
        SystemConfigResponse: 系统配置信息
        
    Raises:
        HTTPException: 404 - 配置项不存在
    """
    config = config_db_manager.get_system_config(key)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"配置项 '{key}' 不存在"
        )
    
    return SystemConfigResponse(
        key=config.key,
        value=config.value,
        value_type=config.value_type,
        description=config.description,
        category=config.category,
        is_editable=config.is_editable,
        is_secret=config.is_secret,
        created_at=format_datetime(config.created_at),
        updated_at=format_datetime(config.updated_at)
    )


@router.put(
    "/configs/{key}",
    summary="更新系统配置",
    description="更新指定键的系统配置值",
    responses={
        200: {"description": "更新成功"},
        401: {"description": "未认证或令牌无效"},
        403: {"description": "配置项不可编辑"},
        404: {"description": "配置项不存在"}
    }
)
async def update_system_config(
    key: str,
    request: SystemConfigRequest,
    admin: ConfigAdmin = Depends(require_config_admin)
) -> Dict[str, Any]:
    """
    更新系统配置
    
    更新指定键的系统配置值。不可编辑的配置项（is_editable=False）无法更新。
    
    Args:
        key: 配置键
        request: 配置更新请求数据
        admin: 当前登录的超管（通过依赖注入获取）
        
    Returns:
        dict: 包含更新结果的字典
        
    Raises:
        HTTPException: 404 - 配置项不存在
        HTTPException: 403 - 配置项不可编辑
    """
    settings = get_settings()
    try:
        # 获取旧配置
        old_config = config_db_manager.get_system_config(key)
        if not old_config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"配置项 '{key}' 不存在"
            )
        
        # 检查是否可编辑
        if not old_config.is_editable:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"配置项 '{key}' 不可编辑"
            )
        
        # 自动检测值类型
        value_type = request.value_type
        if value_type is None:
            if isinstance(request.value, bool):
                value_type = "bool"
            elif isinstance(request.value, int):
                value_type = "int"
            elif isinstance(request.value, float):
                value_type = "float"
            elif isinstance(request.value, (list, dict)):
                value_type = "json"
            else:
                value_type = "string"
        
        # 更新配置
        new_config = SystemConfig(
            key=key,
            value=request.value,
            value_type=value_type,
            description=request.description or old_config.description,
            category=old_config.category,
            is_editable=old_config.is_editable,
            is_secret=old_config.is_secret
        )
        
        config_db_manager.set_system_config(new_config)
        
        # 记录审计日志
        config_db_manager.add_audit_log(
            admin_id=admin.id,
            admin_username=admin.username,
            action="update",
            target_type="config",
            target_id=key,
            old_value={"value": old_config.value},
            new_value={"value": request.value}
        )
        
        return {
            "success": True,
            "key": key,
            "value": request.value,
            "value_type": value_type
        }
    except HTTPException:
        raise
    except Exception as e:
        handle_exception(e, settings.DEBUG_MODE)


# ========== 审计日志接口 ==========

@router.get(
    "/audit-logs",
    summary="获取审计日志",
    description="查看配置库的操作历史记录",
    responses={
        200: {"description": "成功"},
        401: {"description": "未认证或令牌无效"}
    }
)
async def get_audit_logs(
    limit: int = 50,
    offset: int = 0,
    admin: ConfigAdmin = Depends(require_config_admin)
) -> Dict[str, Any]:
    """
    获取审计日志
    
    查看配置库的操作历史记录。
    
    Args:
        limit: 返回记录数量限制（默认50）
        offset: 偏移量（默认0）
        admin: 当前登录的超管（通过依赖注入获取）
        
    Returns:
        dict: 包含日志列表和数量的字典
    """
    logs = config_db_manager.get_audit_logs(limit=limit, offset=offset)
    
    return {
        "logs": [
            {
                "id": log.id,
                "admin_id": log.admin_id,
                "admin_username": log.admin_username,
                "action": log.action,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "old_value": log.old_value,
                "new_value": log.new_value,
                "ip_address": log.ip_address,
                "created_at": format_datetime(log.created_at)
            }
            for log in logs
        ],
        "count": len(logs)
    }


# ========== 初始化向导接口 ==========

@router.get(
    "/database/init-status",
    summary="获取数据库初始化状态",
    description="检查业务数据库和表结构是否已初始化",
    responses={
        200: {"description": "成功"},
        401: {"description": "未认证或令牌无效"},
        503: {"description": "数据库未配置"}
    }
)
async def get_database_init_status(
    admin: ConfigAdmin = Depends(require_config_admin)
) -> Dict[str, Any]:
    """
    获取数据库初始化状态
    
    检查业务数据库是否存在、表结构是否已创建。
    
    Args:
        admin: 当前登录的超管（通过依赖注入获取）
        
    Returns:
        dict: 包含初始化状态的字典
        
    Raises:
        HTTPException: 503 - 数据库未配置
    """
    from ..db_initializer import DatabaseInitializer
    
    settings = get_settings()
    try:
        # 获取数据库配置
        config = config_db_manager.get_active_database_config()
        if not config:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"message": "数据库未配置", "code": "DATABASE_NOT_CONFIGURED"}
            )
        
        # 获取初始化状态
        initializer = DatabaseInitializer(config)
        status_result = await initializer.get_init_status()
        
        return status_result
        
    except HTTPException:
        raise
    except Exception as e:
        handle_exception(e, settings.DEBUG_MODE)


@router.post(
    "/database/init",
    summary="初始化数据库",
    description="创建业务数据库和表结构（如果不存在）",
    responses={
        200: {"description": "初始化完成"},
        401: {"description": "未认证或令牌无效"},
        503: {"description": "数据库未配置"},
        500: {"description": "初始化失败"}
    }
)
async def init_database_endpoint(
    request: Request,
    admin: ConfigAdmin = Depends(require_config_admin)
) -> Dict[str, Any]:
    """
    初始化数据库
    
    执行完整的数据库初始化流程：
    1. 检查并创建业务数据库
    2. 检查并创建表结构
    
    Args:
        request: FastAPI请求对象
        admin: 当前登录的超管（通过依赖注入获取）
        
    Returns:
        dict: 包含初始化结果的字典
        
    Raises:
        HTTPException: 503 - 数据库未配置
        HTTPException: 500 - 初始化失败
    """
    from ..db_initializer import DatabaseInitializer
    
    settings = get_settings()
    try:
        # 获取数据库配置
        config = config_db_manager.get_active_database_config()
        if not config:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"message": "数据库未配置", "code": "DATABASE_NOT_CONFIGURED"}
            )
        
        # 执行初始化
        initializer = DatabaseInitializer(config)
        result = await initializer.full_init()
        
        # 如果初始化成功，更新连接状态
        if result.get("ready"):
            config_db_manager.update_database_connection_status(
                config.id, is_connected=True
            )
            
            # 记录审计日志
            config_db_manager.add_audit_log(
                admin_id=admin.id,
                admin_username=admin.username,
                action="init_database",
                target_type="database",
                target_id=str(config.id),
                new_value={
                    "database": config.database,
                    "schema": config.db_schema,
                    "steps": result.get("steps", [])
                },
                ip_address=get_client_ip(request)
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        handle_exception(e, settings.DEBUG_MODE)


@router.post(
    "/init-wizard/complete",
    summary="完成初始化向导",
    description="一步完成数据库配置、连接测试和业务库初始化",
    responses={
        200: {"description": "初始化完成"},
        401: {"description": "未认证或令牌无效"},
        500: {"description": "初始化失败"}
    }
)
async def complete_init_wizard(
    request: Request,
    db_request: DatabaseConfigRequest,
    admin: ConfigAdmin = Depends(require_config_admin)
) -> Dict[str, Any]:
    """
    完成初始化向导
    
    一步完成：
    1. 保存数据库配置
    2. 检查/创建业务数据库
    3. 初始化业务数据库表结构
    
    Args:
        request: FastAPI请求对象
        db_request: 数据库配置请求数据
        admin: 当前登录的超管（通过依赖注入获取）
        
    Returns:
        dict: 包含初始化结果的字典
        
    Raises:
        HTTPException: 500 - 初始化失败
    """
    from ..db_initializer import DatabaseInitializer
    
    settings = get_settings()
    try:
        # 1. 保存数据库配置
        config = DatabaseConfig(
            name=db_request.name,
            db_type=db_request.db_type,
            host=db_request.host,
            port=db_request.port,
            database=db_request.database,
            db_schema=db_request.db_schema,
            username=db_request.username,
            password=db_request.password,
            url=db_request.url,
            pool_size=db_request.pool_size,
            max_overflow=db_request.max_overflow,
            pool_timeout=db_request.pool_timeout,
            is_active=True
        )
        
        config_id = config_db_manager.save_database_config(config)
        config_db_manager.set_active_database(config_id)
        config.id = config_id
        
        # 2. 执行数据库初始化（创建数据库+表结构）
        initializer = DatabaseInitializer(config)
        init_result = await initializer.full_init()
        
        if not init_result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "message": "数据库初始化失败",
                    "error": init_result.get("error", "Unknown error"),
                    "steps": init_result.get("steps", [])
                }
            )
        
        # 更新连接状态
        config_db_manager.update_database_connection_status(config_id, is_connected=True)
        
        # 记录日志
        config_db_manager.add_audit_log(
            admin_id=admin.id,
            admin_username=admin.username,
            action="init_wizard_complete",
            target_type="database",
            target_id=str(config_id),
            new_value={
                "name": config.name,
                "db_type": config.db_type.value,
                "host": config.host,
                "database": config.database,
                "schema": config.db_schema,
                "init_steps": init_result.get("steps", [])
            },
            ip_address=get_client_ip(request)
        )
        
        return {
            "success": True,
            "message": "初始化完成",
            "database_config_id": config_id,
            "init_result": init_result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        handle_exception(e, settings.DEBUG_MODE)


@router.post(
    "/database/switch",
    response_model=SwitchDatabaseResponse,
    summary="切换数据库",
    description="切换到新的数据库（不迁移数据）。可以指定新的数据库名和schema，会自动创建并初始化。",
    responses={
        200: {"description": "切换成功", "model": SwitchDatabaseResponse},
        401: {"description": "未认证或令牌无效"},
        500: {"description": "切换失败"}
    }
)
async def switch_database(
    request: Request,
    switch_request: SwitchDatabaseRequest,
    admin: ConfigAdmin = Depends(require_config_admin)
) -> SwitchDatabaseResponse:
    """
    切换数据库
    
    切换到新的数据库配置。此操作不会迁移数据，只是更改连接配置。
    如果指定的数据库不存在，可以选择自动创建并初始化。
    
    Args:
        request: FastAPI请求对象
        switch_request: 切换数据库请求数据
        admin: 当前登录的超管（通过依赖注入获取）
        
    Returns:
        SwitchDatabaseResponse: 切换结果
        
    Raises:
        HTTPException: 500 - 切换失败
    """
    from ..db_initializer import DatabaseInitializer
    from ..adapter.postgres_adapter import PostgresAdapter
    
    settings = get_settings()
    try:
        # 获取当前配置
        current_config = config_db_manager.get_active_database_config()
        old_database = current_config.database if current_config else None
        
        # 创建新配置（基于当前配置）
        # 使用数据库名作为配置名，确保唯一性
        config_name = f"{switch_request.database}_{switch_request.db_schema}"
        
        if current_config:
            new_config = DatabaseConfig(
                name=config_name,
                db_type=current_config.db_type,
                host=current_config.host,
                port=current_config.port,
                database=switch_request.database,
                db_schema=switch_request.db_schema,
                username=current_config.username,
                password=current_config.password,
                url=current_config.url,
                pool_size=current_config.pool_size,
                max_overflow=current_config.max_overflow,
                pool_timeout=current_config.pool_timeout,
                is_active=True
            )
        else:
            # 如果没有当前配置，使用默认配置
            new_config = DatabaseConfig(
                name=config_name,
                db_type=DatabaseType.POSTGRESQL,
                host="localhost",
                port=5432,
                database=switch_request.database,
                db_schema=switch_request.db_schema,
                username="postgres",
                password="",
                is_active=True
            )
        
        # 关闭现有连接
        postgres_adapter = getattr(request.app.state, "postgres_adapter", None)
        if postgres_adapter is not None:
            await postgres_adapter.disconnect()
            request.app.state.postgres_adapter = None
        
        # 创建数据库初始化器
        initializer = DatabaseInitializer(new_config)
        
        created = False
        initialized = False
        
        # 检查/创建数据库
        if switch_request.create_if_not_exists:
            db_exists = await initializer.check_database_exists()
            if not db_exists:
                create_result = await initializer.create_database()
                created = create_result.get("created", False)
        
        # 初始化表结构
        if switch_request.init_if_empty:
            init_result = await initializer.full_init()
            initialized = init_result.get("ready", False)
            
            # 记录初始化步骤
            init_steps = init_result.get("steps", [])
        else:
            init_steps = []
        
        # 保存新配置
        config_id = config_db_manager.save_database_config(new_config)
        config_db_manager.set_active_database(config_id)
        
        # 更新连接状态
        config_db_manager.update_database_connection_status(config_id, is_connected=True)
        
        # 记录审计日志
        config_db_manager.add_audit_log(
            admin_id=admin.id,
            admin_username=admin.username,
            action="switch_database",
            target_type="database",
            target_id=str(config_id),
            old_value={"database": old_database},
            new_value={
                "database": switch_request.database,
                "db_schema": switch_request.db_schema,
                "created": created,
                "initialized": initialized
            },
            ip_address=get_client_ip(request)
        )
        
        return SwitchDatabaseResponse(
            success=True,
            message=f"数据库切换成功: {old_database or 'None'} -> {switch_request.database}",
            old_database=old_database,
            new_database=switch_request.database,
            db_schema=switch_request.db_schema,
            created=created,
            initialized=initialized
        )
        
    except HTTPException:
        raise
    except Exception as e:
        handle_exception(e, settings.DEBUG_MODE)

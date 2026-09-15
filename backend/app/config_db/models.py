"""
配置库数据模型
定义配置库的表结构和数据模型
"""
from datetime import datetime
from typing import Optional, Any
import os
from pydantic import BaseModel, Field
from enum import Enum


class ConfigAdmin(BaseModel):
    """
    配置库超管账号模型
    
    与博客用户完全分离，仅用于管理系统配置
    """
    id: Optional[int] = None
    username: str = Field(..., min_length=3, max_length=50, description="超管用户名")
    password_hash: str = Field(..., description="密码哈希")
    is_active: bool = Field(default=True, description="账号是否激活")
    is_default: bool = Field(default=False, description="是否为默认账号（需要修改密码）")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
    last_login_at: Optional[datetime] = Field(default=None, description="最后登录时间")
    last_login_ip: Optional[str] = Field(default=None, description="最后登录IP")


class DatabaseType(str, Enum):
    """数据库类型枚举"""
    POSTGRESQL = "postgresql"
    MYSQL = "mysql"
    SQLITE = "sqlite"


class DatabaseConfig(BaseModel):
    """
    业务数据库配置模型
    
    存储项目使用的业务数据库连接信息
    """
    id: Optional[int] = None
    name: str = Field(default="default", description="配置名称")
    db_type: DatabaseType = Field(default=DatabaseType.POSTGRESQL, description="数据库类型")
    host: str = Field(default="localhost", description="主机地址")
    port: int = Field(default=5432, description="端口")
    database: str = Field(default="synthspark", description="数据库名")
    db_schema: str = Field(default="public", description="PostgreSQL schema名称")
    username: str = Field(default="", description="用户名")
    password: str = Field(default="", description="密码")
    # 或者使用完整URL
    url: Optional[str] = Field(default=None, description="完整连接URL")
    
    # 连接池配置
    pool_size: int = Field(default=5, description="连接池大小")
    max_overflow: int = Field(default=10, description="最大溢出连接")
    pool_timeout: int = Field(default=30, description="连接池超时时间(秒)")
    
    # 状态
    is_active: bool = Field(default=False, description="是否启用")
    is_connected: bool = Field(default=False, description="是否已连接")
    last_connected_at: Optional[datetime] = Field(default=None, description="最后连接时间")
    connection_error: Optional[str] = Field(default=None, description="连接错误信息")
    
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
    
    def get_connection_string(self) -> str:
        """
        获取数据库连接字符串（含驱动）
        
        用于SQLAlchemy等ORM框架
        
        Returns:
            连接字符串
        """
        if self.url:
            return self.url
        
        if self.db_type == DatabaseType.POSTGRESQL:
            return f"postgresql+asyncpg://{self.username}:{self.password}@{self.host}:{self.port}/{self.database}"
        elif self.db_type == DatabaseType.MYSQL:
            return f"mysql+aiomysql://{self.username}:{self.password}@{self.host}:{self.port}/{self.database}"
        elif self.db_type == DatabaseType.SQLITE:
            return f"sqlite+aiosqlite:///{self.database}"
        else:
            raise ValueError(f"不支持的数据库类型: {self.db_type}")
    
    def get_raw_connection_string(self) -> str:
        """
        获取原始数据库连接字符串（不含驱动）
        
        用于asyncpg等原生驱动
        
        Returns:
            原始连接字符串
        """
        if self.db_type == DatabaseType.POSTGRESQL:
            return f"postgresql://{self.username}:{self.password}@{self.host}:{self.port}/{self.database}"
        elif self.db_type == DatabaseType.MYSQL:
            return f"mysql://{self.username}:{self.password}@{self.host}:{self.port}/{self.database}"
        elif self.db_type == DatabaseType.SQLITE:
            return f"sqlite:///{self.database}"
        else:
            raise ValueError(f"不支持的数据库类型: {self.db_type}")


class SystemConfig(BaseModel):
    """
    系统配置模型
    
    存储系统的各种配置项
    """
    id: Optional[int] = None
    key: str = Field(..., min_length=1, max_length=100, description="配置键")
    value: Any = Field(..., description="配置值")
    value_type: str = Field(default="string", description="值类型: string, int, float, bool, json")
    description: Optional[str] = Field(default=None, description="配置说明")
    category: str = Field(default="general", description="配置分类")
    is_editable: bool = Field(default=True, description="是否可编辑")
    is_secret: bool = Field(default=False, description="是否敏感配置(不返回给前端)")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")


class ConfigAuditLog(BaseModel):
    """
    配置操作审计日志
    
    记录配置的修改历史
    """
    id: Optional[int] = None
    admin_id: int = Field(..., description="操作管理员ID")
    admin_username: str = Field(..., description="操作管理员用户名")
    action: str = Field(..., description="操作类型: create, update, delete, login, logout")
    target_type: str = Field(..., description="操作对象类型: admin, database, config")
    target_id: Optional[str] = Field(default=None, description="操作对象ID")
    old_value: Optional[str] = Field(default=None, description="旧值(JSON)")
    new_value: Optional[str] = Field(default=None, description="新值(JSON)")
    ip_address: Optional[str] = Field(default=None, description="操作IP")
    user_agent: Optional[str] = Field(default=None, description="用户代理")
    created_at: Optional[datetime] = Field(default=None, description="操作时间")


# 预定义的系统配置项
DEFAULT_SYSTEM_CONFIGS = [
    {
        "key": "site_name",
        "value": "SynthSpark",
        "value_type": "string",
        "description": "站点名称",
        "category": "site"
    },
    {
        "key": "site_description",
        "value": "AI辅助博客站点",
        "value_type": "string",
        "description": "站点描述",
        "category": "site"
    },
    {
        "key": "site_logo",
        "value": "",
        "value_type": "string",
        "description": "站点Logo URL",
        "category": "site"
    },
    {
        "key": "site_favicon",
        "value": "",
        "value_type": "string",
        "description": "站点Favicon URL",
        "category": "site"
    },
    {
        "key": "maintenance_mode",
        "value": False,
        "value_type": "bool",
        "description": "维护模式",
        "category": "system"
    },
    {
        "key": "debug_mode",
        "value": False,
        "value_type": "bool",
        "description": "调试模式",
        "category": "system"
    },
    {
        "key": "allow_registration",
        "value": True,
        "value_type": "bool",
        "description": "允许用户注册",
        "category": "user"
    },
    {
        "key": "default_user_role",
        "value": "user",
        "value_type": "string",
        "description": "默认用户角色",
        "category": "user"
    },
    {
        "key": "jwt_secret_key",
        "value": "",
        "value_type": "string",
        "description": "JWT密钥(请修改)",
        "category": "security",
        "is_secret": True
    },
    {
        "key": "jwt_algorithm",
        "value": "HS256",
        "value_type": "string",
        "description": "JWT算法",
        "category": "security"
    },
    {
        "key": "jwt_expire_minutes",
        "value": 30,
        "value_type": "int",
        "description": "JWT过期时间(分钟)",
        "category": "security"
    },
    {
        "key": "cors_origins",
        "value": ["http://localhost:5173"],
        "value_type": "json",
        "description": "CORS允许的来源",
        "category": "security"
    },
    {
        "key": "max_upload_size",
        "value": 10485760,
        "value_type": "int",
        "description": "最大上传文件大小(字节)",
        "category": "upload"
    },
    {
        "key": "allowed_upload_types",
        "value": ["image/jpeg", "image/png", "image/gif", "image/webp"],
        "value_type": "json",
        "description": "允许上传的文件类型",
        "category": "upload"
    },
    {
        "key": "upload_dir",
        "value": "./uploads",
        "value_type": "string",
        "description": "上传文件存储目录",
        "category": "upload"
    },
]


# 默认超管账号（引导用）
# - 可用环境变量覆盖：CONFIG_ADMIN_USERNAME / CONFIG_ADMIN_PASSWORD
# - 未设置时使用下方引导默认值（仅首次初始化 config.db 时创建）
# - 注意：首次启动后必须修改默认密码！
DEFAULT_ADMIN = {
    "username": os.environ.get("CONFIG_ADMIN_USERNAME", "admin"),
    "password": os.environ.get("CONFIG_ADMIN_PASSWORD", "123456"),  # 明文密码，会在创建时哈希
    "is_default": True     # 标记为默认账号，需要强制修改密码
}

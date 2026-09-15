"""
配置管理模块
使用 Pydantic Settings 管理配置，支持环境变量
"""
from functools import lru_cache
from typing import Optional, List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置类"""
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )
    
    # 应用基础配置
    APP_NAME: str = "SynthSpark"
    DEBUG_MODE: bool = True
    VERSION: str = "0.1.0"
    
    # 安全配置
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30 * 24 * 60  # 30天
    
    # 数据库配置
    DATABASE_URL: str = "sqlite+aiosqlite:///./synthspark.db"
    
    # CORS配置 - 允许所有本地开发端口
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://localhost:5178",
        "http://localhost:5179",
        "http://localhost:5180",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
        "http://127.0.0.1:5177",
        "http://127.0.0.1:5178",
        "http://127.0.0.1:5179",
        "http://127.0.0.1:5180",
        "http://127.0.0.1:3000"
    ]
    
    # 文件上传配置
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB
    UPLOAD_DIR: str = "./uploads"
    
    # 站点配置
    SITE_NAME: str = "SynthSpark"
    SITE_DESCRIPTION: str = "AI 辅助博客站点"
    
    # 限流配置 (slowapi格式: "次数/时间单位")
    RATE_LIMIT_LOGIN: str = "5/minute"           # 登录接口限流
    RATE_LIMIT_REGISTER: str = "3/minute"        # 注册接口限流
    RATE_LIMIT_DEFAULT: str = "100/minute"       # 默认全局限流
    RATE_LIMIT_EXEMPT_IPS: List[str] = ["127.0.0.1", "::1"]  # 不受限流的IP列表


@lru_cache
def get_settings() -> Settings:
    """获取配置单例"""
    return Settings()

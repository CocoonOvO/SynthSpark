"""
FastAPI 应用实例创建
"""
import time
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from .config import get_settings
from .db_manager import db_manager

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 创建限流器
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理
    
    - 启动时: 初始化配置库(SQLite)
    - 关闭时: 清理资源
    
    注意：业务数据库(PostgreSQL)不会自动初始化，
    需要通过 /api/admin 接口配置后才会连接
    """
    from .config_db import config_db_manager
    
    settings = get_settings()
    
    # 1. 初始化SQLite配置库
    await config_db_manager.initialize()
    logger.info("配置库(SQLite)初始化完成")
    
    # 2. 检查是否有业务数据库配置
    if config_db_manager.has_database_config():
        logger.info("检测到业务数据库配置，尝试连接...")
        try:
            # 获取数据库配置并创建适配器实例
            db_config = config_db_manager.get_active_database_config()
            if db_config:
                from .db_manager import db_manager
                
                # 使用 db_manager 初始化业务数据库
                await db_manager.init_biz_db(
                    db_config.get_connection_string(),
                    schema=getattr(db_config, 'db_schema', 'public') or 'public'
                )
                
                # 更新连接状态
                config_db_manager.update_database_connection_status(
                    db_config.id, is_connected=True
                )
                
                # 3. 初始化SEO表结构
                try:
                    from .seo.factory import init_seo_tables
                    await init_seo_tables(db_manager.db)
                    logger.info("SEO表结构初始化完成")
                except Exception as e:
                    logger.warning(f"SEO表结构初始化失败: {e}")
                
                logger.info("业务数据库连接成功")
        except Exception as e:
            logger.warning(f"业务数据库连接失败: {e}")
            logger.info("请使用超管账号访问 /api/admin/database 配置数据库")
    else:
        logger.info("业务数据库未配置，请访问 /api/admin/setup-status 查看状态")
        logger.info("使用默认超管账号 admin / 123456 登录后配置数据库")
    
    logger.info(f"应用 {settings.APP_NAME} v{settings.VERSION} 启动成功")
    
    yield
    
    # 关闭时清理 - 统一使用 db_manager 关闭所有连接
    from .db_manager import db_manager
    await db_manager.close()
    logger.info("应用关闭，资源已清理")


def create_app() -> FastAPI:
    """
    创建FastAPI应用实例
    
    Returns:
        FastAPI应用实例
    """
    settings = get_settings()
    
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.VERSION,
        description="SynthSpark - AI辅助博客站点后端API",
        lifespan=lifespan,
        docs_url="/api/docs" if settings.DEBUG_MODE else None,
        redoc_url="/api/redoc" if settings.DEBUG_MODE else None,
        openapi_url="/api/openapi.json" if settings.DEBUG_MODE else None,
    )
    
    # 配置CORS中间件
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 配置SEO中间件（在CORS之后，限流之前）
    from .seo.middleware import SEOInterceptor
    from .seo.config import get_seo_settings
    seo_settings = get_seo_settings()
    if seo_settings.SEO_ENABLED:
        app.add_middleware(SEOInterceptor)
        logger.info("SEO中间件已启用")

    # 配置限流
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    
    # 请求日志中间件
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        """
        记录请求日志
        
        - 记录请求方法和路径
        - 记录处理时间
        - 记录客户端IP
        """
        start_time = time.time()
        
        # 获取客户端IP
        client_ip = request.client.host if request.client else "unknown"
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()
        
        # 记录请求开始
        logger.info(f"[{client_ip}] {request.method} {request.url.path} - 开始处理")
        
        try:
            response = await call_next(request)
            
            # 计算处理时间
            process_time = time.time() - start_time
            
            # 记录请求完成
            logger.info(
                f"[{client_ip}] {request.method} {request.url.path} - "
                f"状态: {response.status_code} - 耗时: {process_time:.3f}s"
            )
            
            # 添加处理时间到响应头
            response.headers["X-Process-Time"] = str(process_time)
            
            return response
            
        except Exception as e:
            # 记录异常
            process_time = time.time() - start_time
            logger.error(
                f"[{client_ip}] {request.method} {request.url.path} - "
                f"异常: {str(e)} - 耗时: {process_time:.3f}s"
            )
            raise
    
    # 错误处理中间件
    @app.middleware("http")
    async def error_handler(request: Request, call_next):
        """
        全局错误处理中间件
        
        - 捕获未处理的异常
        - 返回统一的错误响应格式
        """
        try:
            return await call_next(request)
        except Exception as e:
            logger.exception(f"未处理的异常: {str(e)}")
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=500,
                content={"detail": "服务器内部错误"}
            )
    
    return app


# 创建应用实例
app = create_app()

"""
应用入口文件
"""
from pathlib import Path
from fastapi.responses import PlainTextResponse
from .app import app
from .routers import api_router

# 注册API路由
app.include_router(api_router)

# 注册服务挂载框架（扫描 gitignored 的 services/impl/ 目录并挂载用户自定义服务）
from .services.registry import register_services

register_services(app)


# SKILL.md 静态文件服务
@app.get("/skill.md", response_class=PlainTextResponse)
async def get_skill_md():
    """
    获取Agent操作指南 (SKILL.md)

    为Agent提供SynthSpark系统的API操作指南
    """
    skill_path = Path(__file__).parent.parent.parent / "SKILL.md"
    if skill_path.exists():
        content = skill_path.read_text(encoding="utf-8")
        return PlainTextResponse(content)
    return PlainTextResponse("SKILL.md not found", status_code=404)

# TODO: 注册其他路由或中间件
# - 静态文件服务
# - 前端路由回退

if __name__ == "__main__":
    import uvicorn
    import sys
    from .config import get_settings
    
    settings = get_settings()
    
    # 解析命令行参数
    port = 8000
    if "--port" in sys.argv:
        idx = sys.argv.index("--port")
        if idx + 1 < len(sys.argv):
            port = int(sys.argv[idx + 1])
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=settings.DEBUG_MODE,
        log_level="debug" if settings.DEBUG_MODE else "info",
    )

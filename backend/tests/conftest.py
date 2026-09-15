"""
Pytest配置文件
"""
import pytest
import pytest_asyncio
import asyncio
import os
from pathlib import Path
from httpx import AsyncClient, ASGITransport


# 设置异步模式
pytest_plugins = ("pytest_asyncio",)

# 设置测试环境变量 - 切换到PostgreSQL
# 注意：数据库连接串不硬编码，必须由调用方通过 TEST_DATABASE_URL 环境变量提供，
# 未设置时自动回退读取 backend/.env（该文件已 gitignore，可持久化本地测试配置），
# 两者都没有时依赖数据库的用例会自动跳过
def _load_dotenv_if_exists():
    """读取 backend/.env（若存在），仅填充尚未设置的环境变量"""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv_if_exists()
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()
if TEST_DATABASE_URL:
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["DEBUG_MODE"] = "true"
os.environ["POSTGRES_DISABLE_SSL"] = "true"

# 导入app（在设置环境变量之后）
from app.main import app
from app.db_manager import db_manager
from app.config_db import config_db_manager as _config_db_manager


@pytest.fixture
def temp_db_path(tmp_path):
    """创建临时配置库路径"""
    return str(tmp_path / "test_config.db")


@pytest_asyncio.fixture
async def config_db_manager(temp_db_path):
    """创建配置库管理器实例"""
    # 创建新的管理器实例（绕过单例）
    manager = object.__new__(_config_db_manager.__class__)
    manager._initialized = False
    manager.db_path = Path(temp_db_path)
    
    # 初始化
    await manager.initialize()
    
    yield manager
    
    # 清理
    import os
    if Path(temp_db_path).exists():
        os.remove(temp_db_path)


@pytest_asyncio.fixture
async def client():
    """创建异步HTTP客户端，并初始化数据库连接"""
    # 未提供测试数据库连接串时跳过依赖数据库的用例
    if not TEST_DATABASE_URL:
        pytest.skip(
            "未设置 TEST_DATABASE_URL 环境变量，示例："
            "TEST_DATABASE_URL=postgresql+asyncpg://用户:密码@localhost:5432/synthspark_test"
        )
    # 1. 初始化配置库
    await _config_db_manager.initialize()
    # 将配置库适配器同步到db_manager
    db_manager._config_adapter = _config_db_manager
    
    # 2. 初始化业务数据库（根据DATABASE_URL自动选择PostgreSQL或SQLite）
    database_url = os.environ.get("DATABASE_URL", "")
    print(f"\n[测试] DATABASE_URL: {database_url}")
    try:
        # 使用db_manager初始化业务数据库
        await db_manager.init_biz_db(database_url)
        print(f"[测试] 业务数据库连接成功!")
        print(f"[测试] db_manager.is_biz_db_ready: {db_manager.is_biz_db_ready}")
    except Exception as e:
        import traceback
        print(f"\n[测试] 业务数据库连接失败!")
        print(f"[测试] 错误: {e}")
        print(f"[测试] 堆栈:\n{traceback.format_exc()}")
    
    # 3. 创建HTTP客户端
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    
    # 4. 清理数据库连接 - 统一使用db_manager.close()
    await db_manager.close()


@pytest_asyncio.fixture
async def auth_headers(client):
    """创建认证头（使用测试用户）"""
    # 先注册测试用户
    register_response = await client.post(
        "/api/auth/register",
        json={
            "username": "testuser_auth",
            "email": "testauth@example.com",
            "password": "testpassword123"
        }
    )
    
    # 如果注册失败（用户已存在），直接登录
    login_response = await client.post(
        "/api/auth/token",
        data={
            "username": "testuser_auth",
            "password": "testpassword123"
        }
    )
    
    if login_response.status_code != 200:
        pytest.skip("无法创建测试用户，数据库可能未配置")
    
    token = login_response.json()["access_token"]
    
    return {"Authorization": f"Bearer {token}"}

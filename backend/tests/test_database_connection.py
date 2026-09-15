"""
数据库连接单元测试
测试PostgreSQL数据库连接、适配器功能等
"""
import pytest
import os


class TestPostgresAdapter:
    """测试PostgreSQL适配器"""
    
    @pytest.mark.asyncio
    async def test_connection_string_generation(self):
        """测试连接字符串生成"""
        from app.config_db import DatabaseConfig, DatabaseType
        
        config = DatabaseConfig(
            name="test",
            db_type=DatabaseType.POSTGRESQL,
            host="localhost",
            port=5432,
            database="test_db",
            username="test_user",
            password="test_pass"
        )
        
        conn_str = config.get_connection_string()
        assert "postgresql+asyncpg://" in conn_str
        assert "test_user:test_pass@localhost:5432/test_db" in conn_str
    
    @pytest.mark.asyncio
    async def test_connection_string_with_url(self):
        """测试使用URL的连接字符串"""
        from app.config_db import DatabaseConfig, DatabaseType
        
        config = DatabaseConfig(
            name="test",
            db_type=DatabaseType.POSTGRESQL,
            url="postgresql+asyncpg://user:pass@host:5432/db"
        )
        
        conn_str = config.get_connection_string()
        assert conn_str == "postgresql+asyncpg://user:pass@host:5432/db"
    
    @pytest.mark.asyncio
    async def test_mysql_connection_string(self):
        """测试MySQL连接字符串"""
        from app.config_db import DatabaseConfig, DatabaseType
        
        config = DatabaseConfig(
            name="test",
            db_type=DatabaseType.MYSQL,
            host="localhost",
            port=3306,
            database="test_db",
            username="test_user",
            password="test_pass"
        )
        
        conn_str = config.get_connection_string()
        assert "mysql+aiomysql://" in conn_str
    
    @pytest.mark.asyncio
    async def test_sqlite_connection_string(self):
        """测试SQLite连接字符串"""
        from app.config_db import DatabaseConfig, DatabaseType
        
        config = DatabaseConfig(
            name="test",
            db_type=DatabaseType.SQLITE,
            database="./test.db"
        )
        
        conn_str = config.get_connection_string()
        assert "sqlite+aiosqlite:///" in conn_str
        assert "./test.db" in conn_str


class TestDatabaseDependencies:
    """测试数据库依赖"""
    
    @pytest.mark.asyncio
    async def test_database_not_configured_exception(self):
        """测试数据库未配置异常"""
        from app.dependencies import DatabaseNotConfiguredException
        
        exc = DatabaseNotConfiguredException()
        assert exc.status_code == 503
        assert "DATABASE_NOT_CONFIGURED" in str(exc.detail)
    
    @pytest.mark.asyncio
    async def test_database_connection_failed_exception(self):
        """测试数据库连接失败异常"""
        from app.dependencies import DatabaseConnectionFailedException
        
        exc = DatabaseConnectionFailedException("Connection refused")
        assert exc.status_code == 503
        assert "DATABASE_CONNECTION_FAILED" in str(exc.detail)
        assert "Connection refused" in str(exc.detail)


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="需要设置TEST_POSTGRESGS_URL环境变量"
)
class TestRealPostgresConnection:
    """
    真实PostgreSQL连接测试
    
    需要设置环境变量: TEST_POSTGRES_URL=postgresql+asyncpg://user:pass@host:5432/db
    """
    
    @pytest.fixture
    async def postgres_adapter(self):
        """创建PostgreSQL适配器"""
        from app.adapter.postgres_adapter import PostgresAdapter
        
        dsn = os.getenv("TEST_POSTGRES_URL")
        adapter = PostgresAdapter(dsn)
        await adapter.connect()
        
        yield adapter
        
        await adapter.disconnect()
    
    @pytest.mark.asyncio
    async def test_real_connection(self, postgres_adapter):
        """测试真实连接"""
        # 简单的连接测试
        assert postgres_adapter is not None
    
    @pytest.mark.asyncio
    async def test_create_and_find_user(self, postgres_adapter):
        """测试创建和查询用户"""
        import uuid
        
        # 创建测试用户
        test_id = str(uuid.uuid4())
        user_data = {
            "id": test_id,
            "username": f"test_user_{test_id[:8]}",
            "email": f"test_{test_id[:8]}@example.com",
            "password_hash": "hashed_password",
            "display_name": "Test User",
            "identity_type": "user",
            "is_active": True,
            "is_superuser": False
        }
        
        # 插入用户
        result = await postgres_adapter.insert("users", user_data)
        assert result["success"] is True
        
        # 查询用户
        found = await postgres_adapter.get("users", test_id)
        assert found["success"] is True
        assert found["data"]["username"] == user_data["username"]
        
        # 清理
        await postgres_adapter.delete("users", test_id)


class TestConfigDBIntegration:
    """配置库集成测试"""
    
    @pytest.mark.asyncio
    async def test_full_setup_flow(self, config_db_manager, temp_db_path):
        """测试完整的设置流程"""
        from app.config_db import DatabaseConfig, DatabaseType
        
        # 1. 验证初始状态
        assert config_db_manager.has_database_config() is False
        
        # 2. 创建数据库配置
        config = DatabaseConfig(
            name="default",
            db_type=DatabaseType.POSTGRESQL,
            host="localhost",
            port=5432,
            database="synthspark",
            username="postgres",
            password="heat1234",
            is_active=True
        )
        
        config_id = config_db_manager.save_database_config(config)
        config_db_manager.set_active_database(config_id)
        
        # 3. 验证配置已保存
        assert config_db_manager.has_database_config() is True
        
        active_config = config_db_manager.get_active_database_config()
        assert active_config is not None
        assert active_config.database == "synthspark"
        assert active_config.password == "heat1234"
        
        # 4. 生成连接字符串
        conn_str = active_config.get_connection_string()
        assert "postgresql+asyncpg://" in conn_str
        assert "postgres:heat1234@localhost:5432/synthspark" in conn_str
